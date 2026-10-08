// U5 (plan be-gau-upgrade.md): chạy 1 lần khi khoá Gấu Pro cho người không phải Creator.
// migrate: chuyển hội thoại Gấu Pro ("[GP] …", lưu theo username) sang Bé Gấu (lưu theo tên hiển thị), giữ tiền tố [GP] để nhận ra.
// notify: DM Lark cho từng người trong gp_allowed_users có lark_open_id. Mặc định chỉ xem trước (dryRun). Chỉ gọi bằng CRON_SECRET.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { loadGpListed } from "@/lib/gp-access"
import { sendLarkMessage } from "@/lib/lark"

const MESSAGE = `🐻 Gấu Pro đã chuyển sang Bé Gấu

Gấu Pro đã ngừng cho tài khoản của bạn. Chức năng đã được chuyển sang Bé Gấu, kể cả các hội thoại Gấu Pro cũ của bạn (tên bắt đầu bằng [GP]). Từ nay bạn dùng Bé Gấu nhé.

Mở Bé Gấu: https://intel-v2.gohub.cloud/chatbot`

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { dryRun = true, migrate = false, notify = false } = await req.json().catch(() => ({})) as { dryRun?: boolean; migrate?: boolean; notify?: boolean }

  const listed = await loadGpListed()
  const { data: users, error } = await supabaseAdmin
    .from("users").select("username,name,role,lark_open_id").in("username", listed.length ? listed : ["_none_"])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const targets = (users ?? []).filter(u => u.role !== "creator")

  const out = []
  for (const u of targets) {
    const row: Record<string, unknown> = { username: u.username, name: u.name, lark: !!u.lark_open_id }
    const { count } = await supabaseAdmin.from("conversations")
      .select("id", { count: "exact", head: true }).eq("username", u.username).like("title", "[GP] %")
    row.gpConversations = count ?? 0
    if (!dryRun && migrate && u.name && count) {
      const { error: e } = await supabaseAdmin.from("conversations")
        .update({ username: u.name }).eq("username", u.username).like("title", "[GP] %")
      row.migrated = e ? `lỗi: ${e.message}` : count
    }
    if (!dryRun && notify && u.lark_open_id) {
      try { row.notified = !!(await sendLarkMessage(u.lark_open_id, "open_id", MESSAGE)) }
      catch (e) { row.notified = `lỗi: ${(e as Error).message}` }
    }
    out.push(row)
  }
  return NextResponse.json({ dryRun, migrate, notify, message: MESSAGE, targets: out })
}
