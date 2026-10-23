import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { alertCronFailure } from "@/lib/cron-alert"
import { mirrorCsTickets, upsertCsTickets, csStoreStats } from "@/lib/cs-tickets-store"
import type { CsTicket } from "@/lib/lark-cs-tickets"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Hằng ngày: kéo ticket CS N ngày gần nhất (mặc định 14) từ Lark Base về Turso. `?days=400` để kéo lại rộng hơn (lần đầu / sửa lỗi).
// `?backfill=supabase&offset=0&limit=3000`: chuyển LỊCH SỬ từ bảng Supabase `lark_cs_tickets` sang Turso (Lark chỉ giữ ~5 tháng) — chạy tới khi `done:true`
// rồi mới được xoá bảng (migration v80). Chạy lặp lại an toàn (ghi đè theo lark_record_id).
export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const p = req.nextUrl.searchParams
  try {
    if (p.get("backfill") === "supabase") {
      const offset = Math.max(0, Number(p.get("offset")) || 0)
      const limit = Math.min(5000, Math.max(100, Number(p.get("limit")) || 3000))
      const { data, error } = await supabaseAdmin.from("lark_cs_tickets").select("*").order("lark_record_id", { ascending: true }).range(offset, offset + limit - 1)
      if (error) throw new Error(error.message)
      const rows: CsTicket[] = (data ?? []).map(r => ({
        lark_record_id: String(r.lark_record_id), ticket_no: String(r.ticket_no ?? ""), order_no: String(r.order_no ?? ""), sku: String(r.sku ?? ""),
        ticket_type: String(r.ticket_type ?? ""), issue_detail: String(r.issue_detail ?? ""), source: String(r.source ?? ""), vendor: String(r.vendor ?? ""),
        product_action: String(r.product_action ?? ""), money_action: String(r.money_action ?? ""), creation_date: Number(r.creation_date) || 0,
        leadtime_minutes: Number(r.leadtime_minutes) || 0, source_1: String(r.source_1 ?? ""),
      }))
      const written = await upsertCsTickets(rows)
      return NextResponse.json({ ok: true, backfill: true, offset, read: rows.length, written, nextOffset: offset + rows.length, done: rows.length < limit, store: await csStoreStats() })
    }
    const days = Math.min(800, Math.max(1, Number(p.get("days")) || 14))
    const r = await mirrorCsTickets(days)
    return NextResponse.json({ ok: true, days, ...r, store: await csStoreStats(), at: new Date().toISOString() })
  } catch (e) {
    await alertCronFailure("cs-tickets-mirror", e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
