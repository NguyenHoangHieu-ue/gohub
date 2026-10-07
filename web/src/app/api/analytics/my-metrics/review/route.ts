import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canWriteTab } from "@/lib/writable-tabs"
import { loadDailyReview } from "@/lib/okr-review-server"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q4-2026 — "Đánh giá hôm nay" (logic lib/okr-review*.ts, cùng nội dung Lark DM 8:30).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWriteTab(session.user.username, "my-metrics", READ_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const quarter = req.nextUrl.searchParams.get("quarter") ?? ""
  if (!/^Q[1-4]-\d{4}$/.test(quarter)) return NextResponse.json({ error: "quarter dạng Q4-2026" }, { status: 400 })
  try {
    return NextResponse.json(await loadDailyReview(quarter))
  } catch (e: any) {
    console.error("[my-metrics/review]", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
