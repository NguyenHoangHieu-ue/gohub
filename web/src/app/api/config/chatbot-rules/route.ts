import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "chatbot_custom_rules").maybeSingle()
  return NextResponse.json({ rules: data?.value ? String(data.value) : "" })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "settings", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { rules } = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "chatbot_custom_rules",
    value: String(rules ?? ""),
    category: "chatbot",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
