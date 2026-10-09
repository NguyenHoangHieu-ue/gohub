// DM Lark hàng loạt: mọi user có lark_open_id (hoặc chỉ `usernames` nếu truyền). Mặc định dryRun (chỉ liệt kê). Chỉ gọi bằng CRON_SECRET.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkMessage } from "@/lib/lark"

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { dryRun = true, message, usernames } = await req.json().catch(() => ({})) as { dryRun?: boolean; message?: string; usernames?: string[] }
  const text = message?.trim()
  if (!text) return NextResponse.json({ error: "message bắt buộc" }, { status: 400 })

  let q = supabaseAdmin.from("users").select("username,name,role,lark_open_id").not("lark_open_id", "is", null)
  if (usernames?.length) q = q.in("username", usernames)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets = (data ?? []).filter(u => u.lark_open_id)
  const out: Record<string, unknown>[] = []
  for (const u of targets) {
    const row: Record<string, unknown> = { username: u.username, name: u.name, role: u.role }
    if (!dryRun) {
      try { row.sent = !!(await sendLarkMessage(u.lark_open_id, "open_id", text)) }
      catch (e) { row.sent = `lỗi: ${(e as Error).message}` }
    }
    out.push(row)
  }
  return NextResponse.json({ dryRun, count: out.length, targets: out })
}
