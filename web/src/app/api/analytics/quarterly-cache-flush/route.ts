import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"

// Xóa cache analytics (accessible bởi mọi user đã login) — nút "Tải lại mới" ở Quarter Report.
//
// Fix s169 (2026-08-28): trước dùng flushAnalyticsCacheByPrefixes() với danh sách cứng
// ("qreport_raw_v7:"..."v1:", "qb2b_raw_v5:"..."v2:") — mỗi lần bump version cache key
// (quarterly-report.ts / quarterly-b2b-customers.ts, hiện đã lên v9/v8) danh sách này KHÔNG tự
// cập nhật theo → nút "Tải lại mới" thành no-op cho cache key hiện hành, chỉ tự sửa được nhờ
// bản thân người bấm nút có gọi kèm `nocache=1` (bypass đọc + ghi lại cache mới cho ĐÚNG session
// đó). Người khác đang mở Quarter Report cùng lúc (không bấm nút) vẫn thấy số cũ tới hết TTL 12h.
// Đổi sang flushAnalyticsCache() (xoá sạch, cùng cách channel-costs/channel-group-costs POST đã
// làm từ trước) — luôn đúng bất kể cache key đổi version bao nhiêu lần sau này.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await flushAnalyticsCache().catch(() => {})
  return NextResponse.json({ ok: true })
}
