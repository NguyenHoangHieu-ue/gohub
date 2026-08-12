import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"
import crypto               from "node:crypto"

const KEY = "portal_sync_token"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if ((session.user as any).role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  return NextResponse.json({ token: data?.value ?? null })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if ((session.user as any).role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const token = crypto.randomBytes(20).toString("hex")

  const { data: existing } = await supabaseAdmin.from("app_settings").select("id").eq("key", KEY).maybeSingle()
  if (existing) {
    await supabaseAdmin.from("app_settings").update({ value: token }).eq("key", KEY)
  } else {
    await supabaseAdmin.from("app_settings").insert({ key: KEY, value: token, category: "portal" })
  }

  return NextResponse.json({ token })
}
