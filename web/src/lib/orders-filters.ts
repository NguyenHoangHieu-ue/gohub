// Bộ lọc tab Orders (s240): phân loại Tier cho từng đơn + lọc nhiều tầng (Nhóm → Kênh → Nguồn → PIC → Tier) với số đơn trên mỗi lựa chọn.
// Thuần (không DB) để dùng chung cho API, trang và test.

export const ORDER_TIERS = ["Strategic", "VIP", "Gold", "Silver", "B2C", "Khác"] as const
export type OrderTier = (typeof ORDER_TIERS)[number]
export const NO_PIC = "__none__"   // đơn chưa gán PIC (staff_code rỗng)

/** Tên PIC trong dim_staff có dạng "Tên VN|EN-Tên" → chỉ hiện phần trước dấu "|". */
export function picDisplayName(name: string | null | undefined): string {
  const n = (name ?? "").split("|")[0].trim()
  return n || (name ?? "").trim()
}

/**
 * Tier của MỘT đơn: nhóm B2B → theo bảng giá khách (cùng luật Quarter Report `makeClassifyTier`: khớp từ khoá tier nào trước thì lấy,
 * không khớp tier nào = Strategic); nhóm B2C → "B2C"; đơn nội bộ / không rõ nhóm → "Khác".
 * (Trước đây trang tô mọi khách có bảng giá không khớp từ khoá thành "Strategic" kể cả đơn B2C website.)
 */
export function classifyOrderTier(group: string | null | undefined, priceListName: string | null | undefined, kws: Record<string, string[]>): OrderTier {
  const g = (group ?? "").trim().toUpperCase()
  if (g === "B2C") return "B2C"
  if (g !== "B2B") return "Khác"
  const p = (priceListName ?? "").toUpperCase()
  if (p) {
    for (const [tier, list] of Object.entries(kws)) {
      if (list.some(k => k.trim() && p.includes(k.trim().toUpperCase()))) return (ORDER_TIERS as readonly string[]).includes(tier) ? (tier as OrderTier) : "Strategic"
    }
  }
  return "Strategic"
}

const esc = (s: string) => s.toUpperCase().replace(/'/g, "''")

/** Biểu thức SQL cùng nghĩa với classifyOrderTier. `group` = cột nhóm (vd s.group_name), `pln` = cột bảng giá (vd dc.price_list_name). */
export function orderTierSql(kws: Record<string, string[]>, groupExpr: string, plnExpr: string): string {
  const up = `UPPER(COALESCE(${plnExpr}, ''))`
  const whens: string[] = []
  for (const [tier, list] of Object.entries(kws)) {
    const t = (ORDER_TIERS as readonly string[]).includes(tier) ? tier : "Strategic"
    const conds = list.map(k => k.trim()).filter(Boolean).map(k => `POSITION('${esc(k)}' IN ${up}) > 0`)
    if (conds.length) whens.push(`WHEN ${conds.join(" OR ")} THEN '${t}'`)
  }
  const b2b = whens.length ? `CASE ${whens.join(" ")} ELSE 'Strategic' END` : `'Strategic'`
  const g = `UPPER(COALESCE(${groupExpr}, ''))`
  return `CASE WHEN ${g} = 'B2C' THEN 'B2C' WHEN ${g} = 'B2B' THEN ${b2b} ELSE 'Khác' END`
}

// ── Lọc nhiều tầng ─────────────────────────────────────────────────────────
export interface FilterSource { code: string; name: string; channel: string; group: string; status: string }
export interface FilterStaff { code: string; name: string }
/** combos[i] = [chỉ số nguồn, chỉ số PIC (-1 = chưa gán), chỉ số bảng giá, số đơn] */
export interface OrderFilterData { sources: FilterSource[]; staff: FilterStaff[]; plns: string[]; combos: [number, number, number, number][] }
export interface FilterSelection { group: string; channel: string; source: string; staff: string; tier: string }
export interface Opt { value: string; label: string; orders: number; muted?: boolean }
export interface FilterOptions { groups: Opt[]; channels: Opt[]; sources: Opt[]; staff: Opt[]; tiers: Opt[] }

/** Mỗi bộ lọc hiện các lựa chọn CÒN ĐƠN khi áp các bộ lọc KHÁC (kiểu lọc nhiều tầng), kèm số đơn. */
export function deriveFilterOptions(data: OrderFilterData, sel: FilterSelection, kws: Record<string, string[]>): FilterOptions {
  const tierOf = (si: number, pi: number): string => classifyOrderTier(data.sources[si]?.group, data.plns[pi], kws)

  const pass = (c: [number, number, number, number], skip: keyof FilterSelection): boolean => {
    const src = data.sources[c[0]]
    if (!src) return false
    if (skip !== "group" && sel.group && src.group.toUpperCase() !== sel.group.toUpperCase()) return false
    if (skip !== "channel" && sel.channel && src.channel !== sel.channel) return false
    if (skip !== "source" && sel.source && src.code !== sel.source) return false
    if (skip !== "staff" && sel.staff) {
      const code = c[1] < 0 ? NO_PIC : data.staff[c[1]]?.code
      if (code !== sel.staff) return false
    }
    if (skip !== "tier" && sel.tier && tierOf(c[0], c[2]) !== sel.tier) return false
    return true
  }

  const tally = (skip: keyof FilterSelection, keyOf: (c: [number, number, number, number]) => string | null) => {
    const m = new Map<string, number>()
    for (const c of data.combos) {
      if (!pass(c, skip)) continue
      const k = keyOf(c)
      if (k === null) continue
      m.set(k, (m.get(k) ?? 0) + c[3])
    }
    return m
  }

  const groups = tally("group", c => data.sources[c[0]].group.toUpperCase() || null)
  const channels = tally("channel", c => data.sources[c[0]].channel || null)
  const sources = tally("source", c => data.sources[c[0]].code)
  const staff = tally("staff", c => (c[1] < 0 ? NO_PIC : data.staff[c[1]]?.code ?? null))
  const tiers = tally("tier", c => tierOf(c[0], c[2]))

  const byLabel = (a: Opt, b: Opt) => a.label.localeCompare(b.label, "vi")
  return {
    groups: [...groups].map(([v, n]) => ({ value: v, label: v === "INTERNAL-TRANSACTION" ? "Nội bộ" : v, orders: n })).sort((a, b) => b.orders - a.orders),
    channels: [...channels].map(([v, n]) => ({ value: v, label: v, orders: n })).sort(byLabel),
    sources: [...sources].map(([v, n]) => {
      const s = data.sources.find(x => x.code === v)!
      const inactive = /^\[INACTIVE\]/i.test(s.name) || s.status === "Inactive"
      return { value: v, label: `${s.name.replace(/^\[INACTIVE\]\s*/i, "") || v} (${v})${inactive ? " · ngừng" : ""}`, orders: n, muted: inactive }
    }).sort(byLabel),
    staff: [...staff].map(([v, n]) => ({ value: v, label: v === NO_PIC ? "Chưa gán PIC" : picDisplayName(data.staff.find(x => x.code === v)?.name) || v, orders: n })).sort(byLabel),
    tiers: ORDER_TIERS.filter(t => tiers.has(t)).map(t => ({ value: t, label: t, orders: tiers.get(t)! })),
  }
}

/** Sau khi một bộ lọc đổi, bỏ các lựa chọn con không còn hợp lệ (vd chọn nhóm B2C thì kênh B2B bị xoá). */
export function pruneSelection(sel: FilterSelection, opts: FilterOptions): FilterSelection {
  const ok = (v: string, list: Opt[]) => !v || list.some(o => o.value === v)
  return {
    group: ok(sel.group, opts.groups) ? sel.group : "",
    channel: ok(sel.channel, opts.channels) ? sel.channel : "",
    source: ok(sel.source, opts.sources) ? sel.source : "",
    staff: ok(sel.staff, opts.staff) ? sel.staff : "",
    tier: ok(sel.tier, opts.tiers) ? sel.tier : "",
  }
}

/**
 * Dọn lựa chọn không còn hợp lệ theo thứ tự ưu tiên Nhóm > Kênh > Nguồn > PIC > Tier: giữ cái cấp cao, bỏ cái cấp thấp mâu thuẫn
 * (vd chọn nhóm B2C khi đang chọn kênh Momo của B2B → kênh bị bỏ, nhóm giữ nguyên).
 */
export function normalizeSelection(data: OrderFilterData, sel: FilterSelection, kws: Record<string, string[]>): FilterSelection {
  const kept: FilterSelection = { group: "", channel: "", source: "", staff: "", tier: "" }
  const fields: [keyof FilterSelection, keyof FilterOptions][] = [["group", "groups"], ["channel", "channels"], ["source", "sources"], ["staff", "staff"], ["tier", "tiers"]]
  for (const [f, listKey] of fields) {
    const want = sel[f]
    if (!want) continue
    const opts = deriveFilterOptions(data, { ...kept, [f]: want }, kws)
    if (opts[listKey].some(o => o.value === want)) kept[f] = want
  }
  return kept
}
