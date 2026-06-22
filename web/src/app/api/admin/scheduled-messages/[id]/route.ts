import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { runScheduledMessage } from "@/lib/scheduled-runner"

function adminOnly(session: any) {
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const guard = adminOnly(session)
  if (guard) return guard

  const body = await req.json()
  const { name, prompt, cron_expression, lark_webhook_url, lark_keyword, is_active } = body

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (name             !== undefined) update.name              = name.trim()
  if (prompt           !== undefined) update.prompt            = prompt.trim()
  if (cron_expression  !== undefined) update.cron_expression   = cron_expression.trim()
  if (lark_webhook_url !== undefined) update.lark_webhook_url  = lark_webhook_url?.trim() || null
  if (lark_keyword     !== undefined) update.lark_keyword      = lark_keyword?.trim() || null
  if (is_active        !== undefined) update.is_active         = is_active

  const { data, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .update(update)
    .eq("id", params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const guard = adminOnly(session)
  if (guard) return guard

  const { error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .delete()
    .eq("id", params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/admin/scheduled-messages/[id] — test run immediately
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const guard = adminOnly(session)
  if (guard) return guard

  const { data: msg, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .select("*")
    .eq("id", params.id)
    .single()

  if (error || !msg) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const finalText = await runScheduledMessage(msg)
    return NextResponse.json({ ok: true, message: "Đã gửi", preview: finalText.slice(0, 200) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
