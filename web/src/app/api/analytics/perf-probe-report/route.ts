import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { buildReportData } from "@/lib/scheduled-report-data"
import { runScheduledMessage } from "@/lib/scheduled-runner"
import { supabaseAdmin } from "@/lib/supabase"

// Đo thời gian dựng số liệu báo cáo tự động (Daily/Weekly/Monthly) KHÔNG gọi Gemini, KHÔNG gửi Lark — creator-only.
// Dùng khi cron scheduled-messages báo timeout. ?period=daily|weekly|monthly|quarterly
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const period = (req.nextUrl.searchParams.get("period") || "daily") as "daily" | "weekly" | "monthly" | "quarterly"
  const t = performance.now()
  // ?admin=1 → cấu trúc phản hồi Admin GoHub customers API (CHỈ tên trường/kiểu + số liệu tổng, KHÔNG trả giá trị định danh).
  if (req.nextUrl.searchParams.get("admin")) {
    const BASE = (process.env.ADMIN_GOHUB_API_BASE_URL || "").replace(/\/$/, "")
    const H = { "X-API-Key": process.env.ADMIN_GOHUB_API_KEY || "", "X-API-Secret": process.env.ADMIN_GOHUB_API_SECRET || "", "X-API-Secrect": process.env.ADMIN_GOHUB_API_SECRET || "" }
    const u = new URL(`${BASE}/v1/internal/customers/revenue`)
    for (const [k, v] of Object.entries({ page: "1", limit: "3", sortBy: "revenue", sortOrder: "desc",
      dateFrom: req.nextUrl.searchParams.get("from") || "2026-07-01T00:00:00.000Z", dateTo: req.nextUrl.searchParams.get("to") || "2026-09-20T23:59:59.999Z" })) u.searchParams.set(k, v)
    const extra = req.nextUrl.searchParams.get("extra")
    if (extra) for (const kv of extra.split(",")) { const [k, v] = kv.split("="); if (k) u.searchParams.set(k, v ?? "") }
    const r = await fetch(u, { headers: H })
    const j: any = await r.json().catch(() => null)
    const shape = (o: any): any => Array.isArray(o) ? [o.length ? shape(o[0]) : "empty[]"] : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o
    return NextResponse.json({ status: r.status, ms: Math.round(performance.now() - t), shape: shape(j), summary: j?.data?.summary, pagination: j?.pagination })
  }
  // ?full=<tên lịch> → chạy TOÀN BỘ đường của cron (số liệu + Gemini format + dựng card) nhưng dryRun: không gửi Lark, không ghi last_run_at.
  const full = req.nextUrl.searchParams.get("full")
  if (full) {
    const { data: msg } = await supabaseAdmin.from("lark_scheduled_messages").select("*").ilike("name", full).maybeSingle()
    if (!msg) return NextResponse.json({ error: "không thấy lịch " + full }, { status: 404 })
    try {
      const report = await runScheduledMessage(msg, { dryRun: true })
      return NextResponse.json({ full, ms: Math.round(performance.now() - t), reportChars: report.length, head: report.slice(0, 200) })
    } catch (e: any) {
      return NextResponse.json({ full, ms: Math.round(performance.now() - t), error: e?.message }, { status: 500 })
    }
  }
  try {
    const { block } = await buildReportData(period)
    return NextResponse.json({ period, ms: Math.round(performance.now() - t), blockChars: block.length })
  } catch (e: any) {
    return NextResponse.json({ period, ms: Math.round(performance.now() - t), error: e?.message }, { status: 500 })
  }
}
