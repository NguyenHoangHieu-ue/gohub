import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

const KEY = "portal_access_users"

function isCreator(role: string) { return role === "creator" }

async function getList(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  if (!data?.value) return []
  try { return JSON.parse(data.value) as string[] } catch { return [] }
}

async function saveList(list: string[]): Promise<void> {
  const value = JSON.stringify(list)
  const { data: existing } = await supabaseAdmin.from("app_settings").select("id").eq("key", KEY).maybeSingle()
  if (existing) {
    await supabaseAdmin.from("app_settings").update({ value }).eq("key", KEY)
  } else {
    await supabaseAdmin.from("app_settings").insert({ key: KEY, value, category: "portal" })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const list = await getList()
  // Enrich with user names
  const { data: users } = await supabaseAdmin.from("users").select("username, name, email").in("username", list.length ? list : ["__none__"])
  return NextResponse.json({ usernames: list, users: users ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { username } = await req.json()
  if (!username?.trim()) return NextResponse.json({ error: "username required" }, { status: 400 })

  // Verify user exists
  const { data: user } = await supabaseAdmin.from("users").select("username, name, email").eq("username", username.trim()).maybeSingle()
  if (!user) return NextResponse.json({ error: "User không tồn tại" }, { status: 404 })

  const list = await getList()
  if (!list.includes(username.trim())) {
    await saveList([...list, username.trim()])
  }
  return NextResponse.json({ ok: true, user })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const username = req.nextUrl.searchParams.get("username")
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 })

  const list = await getList()
  await saveList(list.filter(u => u !== username))
  return NextResponse.json({ ok: true })
}
