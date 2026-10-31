import { rq } from "./client"
import { diffRows } from "./quarter"

// Bản rollup của khối doanh thu trong /api/analytics/b2c/monthly (4 truy vấn: tháng × thị trường, × loại kênh, × thị trường × loại, × kênh có giá vốn/lãi).
// Đường thô KHÔNG lọc ship, đơn nội bộ, khách INACTIVE hay khách loại trừ (chỉ nhóm B2C) nên rollup cũng không lọc gì ngoài nhóm B2C.
export interface MarketRow { month: string; market: string; revenue: string }
export interface CtypeRow { month: string; ctype: string; revenue: string }
export interface MarketCtypeRow { month: string; market: string; ctype: string; revenue: string }
export interface ProfitRow { month: string; channel: string; revenue: string; cogs: string; gross_profit: string }
export interface MonthlyBlock { marketRows: MarketRow[]; channelRows: CtypeRow[]; marketChannelRows: MarketCtypeRow[]; profitRows: ProfitRow[] }

const FROM = "FROM ru_cust_day r JOIN dm_source s ON s.source = r.source"
const WHERE = "r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2C'"
const CTYPE_OTHER = "CASE WHEN s.sub_group_name = 'Websites' THEN 'web' WHEN s.sub_group_name = 'Mobile-App' THEN 'app' ELSE 'other' END"
const CTYPE_SALES = "CASE WHEN s.sub_group_name = 'Websites' THEN 'web' WHEN s.sub_group_name = 'Mobile-App' THEN 'app' ELSE 'sales' END"
const MARKET = "CASE WHEN r.company = '' THEN 'NA' ELSE r.company END"
const n = (v: unknown) => String(Number(v ?? 0))

export async function fetchMonthlyBlockRollup(start: string, end: string): Promise<MonthlyBlock> {
  const a = [start, end]
  const [m, c, mc, p] = await Promise.all([
    rq(`SELECT substr(r.day, 1, 7) AS month, ${MARKET} AS market, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE ${WHERE} GROUP BY 1, 2`, a),
    rq(`SELECT substr(r.day, 1, 7) AS month, ${CTYPE_OTHER} AS ctype, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE ${WHERE} GROUP BY 1, 2`, a),
    rq(`SELECT substr(r.day, 1, 7) AS month, ${MARKET} AS market, ${CTYPE_SALES} AS ctype, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE ${WHERE} GROUP BY 1, 2, 3`, a),
    rq(`SELECT substr(r.day, 1, 7) AS month, COALESCE(NULLIF(TRIM(s.channel_name), ''), 'Khác') AS channel, SUM(r.revenue_vnd) AS revenue, SUM(r.cogs_vnd) AS cogs, SUM(r.gp_vnd) AS gross_profit ${FROM} WHERE ${WHERE} GROUP BY 1, 2`, a),
  ])
  return {
    marketRows: m.map(r => ({ month: String(r.month), market: String(r.market), revenue: n(r.revenue) })),
    channelRows: c.map(r => ({ month: String(r.month), ctype: String(r.ctype), revenue: n(r.revenue) })),
    marketChannelRows: mc.map(r => ({ month: String(r.month), market: String(r.market), ctype: String(r.ctype), revenue: n(r.revenue) })),
    profitRows: p.map(r => ({ month: String(r.month), channel: String(r.channel), revenue: n(r.revenue), cogs: n(r.cogs), gross_profit: n(r.gross_profit) })),
  }
}

export function diffMonthlyBlock(raw: MonthlyBlock, ru: MonthlyBlock) {
  const a = diffRows(raw.marketRows, ru.marketRows, r => `${r.month}|${r.market}`, ["revenue"])
  const b = diffRows(raw.channelRows, ru.channelRows, r => `${r.month}|${r.ctype}`, ["revenue"])
  const c = diffRows(raw.marketChannelRows, ru.marketChannelRows, r => `${r.month}|${r.market}|${r.ctype}`, ["revenue"])
  const d = diffRows(raw.profitRows, ru.profitRows, r => `${r.month}|${r.channel}`, ["revenue", "cogs", "gross_profit"])
  return { ok: a.ok && b.ok && c.ok && d.ok, market: a, ctype: b, marketCtype: c, profit: d }
}
