import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const KEY = "squad_config"

async function requireEditor() {
  const session = await getServerSession(authOptions)
  if (!["admin", "creator"].includes(session?.user?.role ?? "")) throw new Error("Forbidden")
  return session
}

export async function GET() {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  const config = data?.value ? JSON.parse(data.value) : { squads: [] }
  return NextResponse.json(config)
}

export async function PUT(req: NextRequest) {
  try {
    await requireEditor()
    const body = await req.json()
    await supabaseAdmin.from("app_settings").upsert(
      { key: KEY, value: JSON.stringify(body), category: "squad" },
      { onConflict: "key" }
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 })
  }
}
