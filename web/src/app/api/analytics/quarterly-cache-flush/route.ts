import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { flushAnalyticsCacheByPrefixes, B2B_COST_CACHE_PREFIXES } from "@/lib/analytics-helpers"
import { QREPORT_CACHE_PREFIX, QB2B_CACHE_PREFIX } from "@/lib/quarterly-settings"

// Xóa cache analytics (accessible bởi mọi user đã login) — nút "Tải lại mới" ở Quarter Report.
//
// Fix s169 (2026-08-28): trước dùng flushAnalyticsCacheByPrefixes() với danh sách cứng
// ("qreport_raw_v7:"..."v1:", "qb2b_raw_v5:"..."v2:") — mỗi lần bump version cache key
// (quarterly-report.ts / quarterly-b2b-customers.ts) danh sách này KHÔNG tự cập nhật theo → nút
// "Tải lại mới" thành no-op cho cache key hiện hành cho người KHÔNG bấm nút (chỉ tự sửa được nhờ
// bản thân người bấm nút có gọi kèm `nocache=1` bypass).
// Fix s169(b) (cùng ngày): đổi tạm sang flushAnalyticsCache() (xoá SẠCH toàn bộ cache app) — đúng
// nhưng gây cả app chậm hẳn (nuke luôn cache Products/Staff/Vendors/Orders... không liên quan) mỗi
// lần Hiếu bấm nút trong lúc test liên tục. Fix cuối: import hằng số PREFIX HIỆN HÀNH từ
// `lib/quarterly-settings.ts` (QREPORT_CACHE_PREFIX/QB2B_CACHE_PREFIX — đặt ở lib chứ không phải ngay
// trong route.ts vì Next.js App Router chỉ cho phép export tên hàm đã biết như GET/POST) — dùng CHUNG
// 1 hằng số với chính route sinh ra key đó nên không bao giờ lệch version, + B2B_COST_CACHE_PREFIXES
// (các tab khác phụ thuộc cost B2B, để "Tải lại mới" cũng làm chúng tươi theo nếu Hiếu vừa sửa cost)
// — KHÔNG nuke sạch cache của các tab không liên quan.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await flushAnalyticsCacheByPrefixes([
    QREPORT_CACHE_PREFIX, QB2B_CACHE_PREFIX, ...B2B_COST_CACHE_PREFIXES,
  ]).catch(() => {})
  return NextResponse.json({ ok: true })
}
