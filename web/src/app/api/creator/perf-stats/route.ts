import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery, tursoConfigured } from "@/lib/turso"
import { summarizePerf, type PerfEvent } from "@/lib/perf-recorder"
import { topUrlsToWarm } from "@/lib/url-hits"

export const dynamic = "force-dynamic"

// Số đo thật cache BI theo route (p50/p95 phục vụ + tính lại, tỉ lệ trúng) — creator/admin, đọc từ Turso perf_events.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== "creator" && session.user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!tursoConfigured()) return NextResponse.json({ routes: [], events: 0, note: "Turso chưa cấu hình" })

  const days = Math.min(14, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 3))
  try {
    const rows = await tursoQuery<PerfEvent>(
      "SELECT route, outcome, ms FROM perf_events WHERE ts > ? ORDER BY ts DESC LIMIT 40000",
      [Date.now() - days * 86_400_000],
    )
    // URL được hâm nóng theo lượt gọi thật (đã mở mẫu theo hôm nay) — để kiểm tra cơ chế prewarm theo hành vi
    const warmList = await topUrlsToWarm(20)
    return NextResponse.json({ routes: summarizePerf(rows), events: rows.length, days, warmList })
  } catch (e) {
    // Bảng chưa có (chưa lần nào ghi) → trả rỗng thay vì lỗi
    return NextResponse.json({ routes: [], events: 0, days, note: (e as Error).message.slice(0, 120) })
  }
}
