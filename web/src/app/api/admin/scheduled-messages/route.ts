import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
      created_by: session.user?.name || session.user?.username || "admin",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
