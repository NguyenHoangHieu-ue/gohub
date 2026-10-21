import { SchemaType } from "@google/generative-ai"
import { NextRequest } from "next/server"
import { GET as bodSummary } from "@/app/api/analytics/bod-summary/route"

// Tool Bé Gấu: số tổng hợp công ty theo kỳ — gọi THẲNG route bod-summary của tab BOD Report để số khớp tuyệt đối
// (cùng bộ lọc phí ship, đơn nội bộ, khách bị loại, chi phí kênh + nhóm trong CM1), thay vì mỗi lần tự viết 3–6 câu SQL.

export const kpiSummaryDecl = {
  name: "kpiSummary",
  description: "Số tổng hợp công ty cho 1 khoảng ngày — ĐÚNG số tab BOD Report: doanh thu, số đơn vị bán, giá vốn, GP, %GP, CM1, %CM1, doanh thu và % đóng góp 3HK, kèm so với kỳ liền trước và cùng kỳ năm ngoái. Dùng cho câu hỏi tổng quan 'doanh thu/GP/CM1 tháng/quý/tuần này thế nào', 'so với kỳ trước', thay vì tự viết SQL. Lọc được theo nhóm kênh, vendor, kênh con. Không có số theo từng khách/nhân viên/sản phẩm (dùng executeSQL cho các chiều đó).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:     { type: SchemaType.STRING, description: "Ngày bắt đầu YYYY-MM-DD (gồm cả ngày này)." },
      endDate:       { type: SchemaType.STRING, description: "Ngày kết thúc YYYY-MM-DD (gồm cả ngày này)." },
      dateColumn:    { type: SchemaType.STRING, description: "fulfiled_date (mặc định, tính theo ngày giao) hoặc created_date (theo ngày tạo đơn)." },
      channelGroups: { type: SchemaType.STRING, description: "Lọc nhóm kênh, cách nhau dấu phẩy: B2B, B2C. Bỏ trống = tất cả." },
      vendors:       { type: SchemaType.STRING, description: "Lọc theo vendor (tên trong dim_sku), cách nhau dấu phẩy. Bỏ trống = tất cả." },
      subChannels:   { type: SchemaType.STRING, description: "Lọc theo kênh con (tên kênh), cách nhau dấu phẩy. Bỏ trống = tất cả." },
      includeShip:         { type: SchemaType.BOOLEAN, description: "Tính phí ship (mặc định true, khớp số mặc định của tab)." },
      includeInternalOps:  { type: SchemaType.BOOLEAN, description: "Tính đơn nội bộ (mặc định true, khớp số mặc định của tab)." },
    },
    required: ["startDate", "endDate"],
  },
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : null }

export async function runKpiSummary(a: any): Promise<any> {
  const startDate = String(a?.startDate ?? ""), endDate = String(a?.endDate ?? "")
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) return { error: "Cần startDate và endDate dạng YYYY-MM-DD, startDate ≤ endDate." }
  const p = new URLSearchParams({
    startDate, endDate,
    dateColumn: a?.dateColumn === "created_date" ? "created_date" : "fulfiled_date",
    includeShip: a?.includeShip === false ? "0" : "1",
    includeInternalOps: a?.includeInternalOps === false ? "0" : "1",
  })
  for (const k of ["channelGroups", "vendors", "subChannels"] as const) if (a?.[k]) p.set(k, String(a[k]))
  const res = await bodSummary(new NextRequest(`http://internal/api/analytics/bod-summary?${p}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } }))
  const d: any = await res.json()
  if (!res.ok || d?.error) return { error: d?.error || `Lỗi ${res.status}` }

  const cur = {
    revenue: num(d.total_revenue), units: num(d.total_units), cogs: num(d.total_cogs), gp: num(d.total_margin), gpPct: num(d.avg_margin_percent),
    cm1: num(d.total_gpm2), cm1Pct: num(d.avg_gpm2_percent), hk3Revenue: num(d.total_3hk_revenue), hk3Pct: num(d.total_3hk_contribution),
  }
  const side = (x: any) => x ? { revenue: num(x.total_revenue), gp: num(x.total_margin), gpPct: num(x.avg_margin_percent), cm1: num(x.total_gpm2), cm1Pct: num(x.avg_gpm2_percent), hk3Pct: num(x.total_3hk_contribution) } : null
  const pct = (c: number | null, b: number | null) => (c != null && b != null && b !== 0 ? Math.round(((c - b) / Math.abs(b)) * 1000) / 10 : null)
  const withDelta = (b: any) => b && { ...b, revenueChangePct: pct(cur.revenue, b.revenue), gpChangePct: pct(cur.gp, b.gp), cm1ChangePct: pct(cur.cm1, b.cm1) }
  return {
    period: { startDate, endDate, dateColumn: a?.dateColumn === "created_date" ? "created_date" : "fulfiled_date" },
    note: "Số khớp tab BOD Report. CM1 = GP − chi phí kênh − chi phí nhóm. %GP/%CM1/%3HK tính trên doanh thu. Thay đổi % so với kỳ trước/năm ngoái đã tính sẵn.",
    current: cur,
    previousPeriod: withDelta(side(d.previous_period)),
    previousYear: withDelta(side(d.previous_year)),
  }
}
