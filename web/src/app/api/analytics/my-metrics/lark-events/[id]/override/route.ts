import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { isQuarterLocked } from "@/lib/okr-helpers"
import { fetchThreadByMessageId } from "@/lib/lark-thread-scan"
import { classifyLarkThread } from "@/lib/okr-lark-classify"
import { insertClassifiedEvent } from "@/lib/lark-scan-runner"

const WRITE_ROLES = ["admin", "creator"]

// POST — "Vẫn tính case này": ghi đè marker "tự đăng — không tính" (is_self_initiated=true,
// status='not_matched') bằng cách phân loại lại thread thật qua Gemini rồi ghi case pending_review
// bình thường. Ngoại lệ hiếm (thread Hiếu tự đăng nhưng vẫn là 1 request/vendor-query thật đáng tính)
// nên chấp nhận tốn thêm 1 lượt gọi Gemini tại đây, không tối ưu chi phí như luồng quét hàng loạt.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: rec, error: fetchErr } = await supabaseAdmin
    .from("okr_lark_events").select("*").eq("id", params.id).maybeSingle()
  if (fetchErr || !rec) return NextResponse.json({ error: "Không tìm thấy record" }, { status: 404 })
  if (!rec.is_self_initiated) {
    return NextResponse.json({ error: "Case này không phải marker tự đăng — không cần override." }, { status: 400 })
  }
  if (isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể tính thêm case nữa." }, { status: 403 })
  }

  const thread = await fetchThreadByMessageId(rec.message_id)
  if (!thread) {
    return NextResponse.json({ error: "Không lấy lại được nội dung thread từ Lark (có thể tin đã bị xoá) — thêm case tay thay thế." }, { status: 502 })
  }

  const result = await classifyLarkThread(thread)
  if (!result || !result.is_match || !result.metric) {
    return NextResponse.json({ error: "Gemini không nhận diện được đây là SLA/Vendor Speed — thêm case tay (nút \"Thêm case tay\") thay vì override." }, { status: 422 })
  }

  const { ok: inserted } = await insertClassifiedEvent(thread, result, true)
  if (!inserted) return NextResponse.json({ error: "Lưu case thất bại" }, { status: 500 })

  // Xoá marker cũ (metric='none') — case thật vừa ghi ở metric='sla'|'vendor_speed' là bản chính thức.
  await supabaseAdmin.from("okr_lark_events").delete().eq("id", params.id)

  return NextResponse.json({ ok: true, metric: result.metric })
}
