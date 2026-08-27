import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { invalidatePolicyCache } from "@/lib/agents/guardian"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// access_policy = { [category]: { [role]: "allow" | "deny" | "dept" } }
// Ma trận quyền cho Guardian Agent (cổng kiểm soát câu hỏi chatbot theo role + dept).
// Thiếu category/role → Guardian fallback DEFAULT_POLICY. admin/manager luôn toàn quyền.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "access_policy").maybeSingle()
  let policy: Record<string, Record<string, string>> = {}
  try { if (data?.value) policy = JSON.parse(data.value) } catch {}
  return NextResponse.json(policy)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "settings", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "access_policy",
    value: JSON.stringify(body ?? {}),
    category: "chatbot",
  }, { onConflict: "key" })
  invalidatePolicyCache()
  return NextResponse.json({ ok: true })
}
