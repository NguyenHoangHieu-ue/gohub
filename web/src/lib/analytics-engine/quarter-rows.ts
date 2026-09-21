// Tách kết quả GỘP của Quarter Report (1 query hạt tháng×nhóm×kênh + 1 query KH×tháng, phủ cả quý trước lẫn quý này)
// thành đúng 7 mảng mà phần tính toán phía sau vẫn dùng — trước đây mỗi mảng là 1 query riêng (7 lần quét bảng fact).
// Hàm thuần, không I/O → có unit test (`quarter-rows.test.ts`).

export interface QuarterBaseRow {
  month: string
  bg: string
  channel: string | null
  source_code: string | null
  revenue: string
  gp: string
  hk3: string
}
export interface QuarterCustRow { month: string; customer_code: string; revenue: string }

const num = (x: string | null | undefined) => parseFloat(x || "0")
const isCommercial = (bg: string) => bg === "B2B" || bg === "B2C"

export function splitQuarterRows(
  baseRows: QuarterBaseRow[],
  custRows: QuarterCustRow[],
  months: string[],
  prevMonths: string[],
) {
  const cur = new Set(months)
  const prev = new Set(prevMonths)

  const groupAcc = new Map<string, { month: string; bg: string; revenue: number; gp: number }>()
  const prevGroupAcc = new Map<string, { bg: string; revenue: number; gp: number }>()
  const hk3Acc = new Map<string, number>()
  const channelRows: { month: string; bg: string; channel: string; source_code: string; revenue: string; gp: string; hk3: string }[] = []
  const prevChannelRows: { month: string; bg: string; channel: string; revenue: string; gp: string }[] = []

  for (const r of baseRows) {
    const isCur = cur.has(r.month)
    const isPrev = prev.has(r.month)
    if (!isCur && !isPrev) continue
    // hk3Rows (quý này) KHÔNG lọc nhóm — tính cả nhóm OTHER/kênh rỗng, đúng như query gốc.
    if (isCur) hk3Acc.set(r.month, (hk3Acc.get(r.month) ?? 0) + num(r.hk3))
    if (!isCommercial(r.bg)) continue

    const hasChannel = r.channel != null && r.channel !== ""
    if (isCur) {
      const k = `${r.month}|${r.bg}`
      const g = groupAcc.get(k) ?? { month: r.month, bg: r.bg, revenue: 0, gp: 0 }
      g.revenue += num(r.revenue); g.gp += num(r.gp)
      groupAcc.set(k, g)
      if (hasChannel) channelRows.push({ month: r.month, bg: r.bg, channel: r.channel as string, source_code: r.source_code as string, revenue: r.revenue, gp: r.gp, hk3: r.hk3 })
    }
    if (isPrev) {
      const g = prevGroupAcc.get(r.bg) ?? { bg: r.bg, revenue: 0, gp: 0 }
      g.revenue += num(r.revenue); g.gp += num(r.gp)
      prevGroupAcc.set(r.bg, g)
      if (hasChannel) prevChannelRows.push({ month: r.month, bg: r.bg, channel: r.channel as string, revenue: r.revenue, gp: r.gp })
    }
  }

  // Giữ thứ tự như ORDER BY tháng, nhóm, kênh của query gốc (phần sau dùng thứ tự xuất hiện của kênh).
  const cmp = (a: { month: string; bg: string; channel?: string }, b: { month: string; bg: string; channel?: string }) =>
    a.month.localeCompare(b.month) || a.bg.localeCompare(b.bg) || (a.channel ?? "").localeCompare(b.channel ?? "")
  channelRows.sort(cmp)

  const groupRows = [...groupAcc.values()]
    .sort(cmp)
    .map(g => ({ month: g.month, bg: g.bg, revenue: String(g.revenue), gp: String(g.gp) }))
  const prevGroupRows = [...prevGroupAcc.values()].map(g => ({ bg: g.bg, revenue: String(g.revenue), gp: String(g.gp) }))
  const hk3Rows = [...hk3Acc.entries()].map(([month, hk3]) => ({ month, hk3: String(hk3) }))

  const custRevRows = custRows.filter(r => cur.has(r.month))
  const prevCustAcc = new Map<string, number>()
  for (const r of custRows) {
    if (!prev.has(r.month)) continue
    prevCustAcc.set(r.customer_code, (prevCustAcc.get(r.customer_code) ?? 0) + num(r.revenue))
  }
  const prevCustRevRows = [...prevCustAcc.entries()].map(([customer_code, revenue]) => ({ customer_code, revenue: String(revenue) }))

  return { groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows, custRevRows, prevCustRevRows }
}
