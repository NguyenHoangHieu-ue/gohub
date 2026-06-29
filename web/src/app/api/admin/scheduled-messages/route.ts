import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

// Đọc (GET): mọi role analytics được cấp tab "scheduled" đều XEM được toàn bộ lịch (quyền tab do
// analytics/layout enforce). Ghi (POST): admin/creator HOẶC user có writable_tabs["scheduled"].
// Dùng DB role (getDbRole) thay JWT role — tránh JWT cũ khi admin vừa đổi role chưa re-login.
const VIEW_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])
const WRITABLE_TABS_KEY = "permissions.writable_tabs"

async function canWriteScheduled(username: string): Promise<boolean> {
  const dbRole = await getDbRole(username)
  if (["admin", "creator"].includes(dbRole)) return true
  const { data } = await supabaseAdmin.from("app_config").select("value").eq("key", WRITABLE_TABS_KEY).maybeSingle()
  if (!data?.value) return false
  try {
    const cfg = JSON.parse(data.value) as Record<string, string[]>
    return (cfg[username] ?? []).includes("scheduled")
  } catch { return false }
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!VIEW_ROLES.has(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = session.user?.username as string
  if (!(await canWriteScheduled(username))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { name, prompt, cron_expression, lark_webhook_url, lark_keyword } = body

  if (!name?.trim() || !prompt?.trim() || !cron_expression?.trim()) {
    return NextResponse.json({ error: "name, prompt, cron_expression là bắt buộc" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .insert({
      name: name.trim(),
      prompt: prompt.trim(),
      cron_expression: cron_expression.trim(),
      lark_webhook_url: lark_webhook_url?.trim() || null,
      lark_keyword: lark_keyword?.trim() || null,
      is_active: true,
      created_by: session.user?.name || username || "admin",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
