import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runLarkScan } from "@/lib/lark-scan-runner"
import { canWriteTab } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// POST — nút "Quét ngay" trong modal Lark Bot, để Hiếu test/verify ngay sau khi đổi config
// thay vì đợi cron chạy 1 lần/ngày (17:00 ICT).
// canWriteTab (role TƯƠI DB) thay session.user.role (JWT) — cùng fix s165 áp cho route này (thêm sau
// s165 nên bị bỏ sót lúc đó).
// ?days=N: quét lại N ngày gần nhất (vd mở lại Q3 → quét lại toàn bộ theo luật mới s225).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username || !(await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const days = Number(req.nextUrl.searchParams.get("days")) || undefined
    const result = await runLarkScan(true, days ? Math.min(150, days) : undefined)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
