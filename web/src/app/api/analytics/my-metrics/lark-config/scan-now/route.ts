import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runLarkScan } from "@/lib/lark-scan-runner"

// POST — nút "Quét ngay" trong modal Lark Bot, để Hiếu test/verify ngay sau khi đổi config
// thay vì đợi cron chạy 1 lần/ngày (17:00 ICT).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await runLarkScan(true)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
