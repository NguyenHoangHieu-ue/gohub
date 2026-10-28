// ARGON-X P2 — "KPI lệch kế hoạch" thành SỰ KIỆN: mỗi đêm (cron argon-sync) so số CHIẾU của THÁNG ĐANG CHẠY (Quarter Report, đã nhân hệ số theo ngày khi qua ≥7 ngày)
// với target tháng anh nhập (company_monthly_targets, mỗi quý 3 số), chỗ nào chiếu < 85% target thì sinh một cảnh báo → hiện ở "Việc cần duyệt" kèm nút "Phân tích nguyên nhân" (mở tab Hỏi với câu hỏi dựng sẵn → Argon truy nguyên nhân bằng SQL).
// Ngưỡng theo quy ước tiến độ của hệ thống: ≥100% xanh, ≥85% vàng, <85% đỏ; <70% = nặng. Phần THUẦN ở đầu file (test được không cần env); phần I/O nạp Supabase muộn.
export type Seg = "ALL" | "B2B" | "B2C"
export type Metric = "rev" | "gp" | "cm1"
export const SEG_LABEL: Record<Seg, string> = { ALL: "Toàn công ty", B2B: "B2B", B2C: "B2C" }
export const METRIC_LABEL: Record<Metric, string> = { rev: "Doanh thu", gp: "Lợi nhuận gộp (GP)", cm1: "CM1" }
export const RED_BELOW = 0.85
export const SEVERE_BELOW = 0.7
export const DISMISS_DAYS = 7

export interface KpiMetricLow { metric: Metric; pct: number; projected: number; target: number }
export interface KpiAlert { key: string; seg: Seg; month: string; lows: KpiMetricLow[]; severity: 2 | 3; title: string; detail: string; question: string; at: string; dismissedUntil?: string }
type Totals = Record<Metric, number>
export interface QuarterTotalsIn { ALL: Totals; B2B: Totals; B2C: Totals }
export type TargetsIn = Partial<Record<Seg, Partial<Record<Metric | "hk3rev", number[]>>>>

/** Một phần tử của `summary` trong /api/analytics/quarterly-report: số của tháng (đã chiếu nếu isProjected). */
export interface MonthIn { month: string; isProjected?: boolean; elapsed?: number; dim?: number; total?: Record<string, any>; b2b?: Record<string, any>; b2c?: Record<string, any> }
/** Rút số chiếu của một tháng (thuần). Thiếu trường → 0. */
export function totalsFromMonth(m: MonthIn | null | undefined): QuarterTotalsIn {
  const pick = (o: any): Totals => ({ rev: Number(o?.revenue) || 0, gp: Number(o?.gp) || 0, cm1: Number(o?.cm1) || 0 })
  return { ALL: pick(m?.total), B2B: pick(m?.b2b), B2C: pick(m?.b2c) }
}
const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `T${Number(mo)}/${y}` }

const tyi = (n: number) => `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2).replace(".", ",")} tỷ`

/** So số chiếu của các tháng ĐANG CHẠY (isProjected) với target tháng (mảng 3 số theo thứ tự tháng trong quý); chỉ trả những chỗ < 85%. Thuần. */
export function evaluateKpi(o: { months: MonthIn[]; targets: TargetsIn; now?: Date }): KpiAlert[] {
  const at = (o.now ?? new Date()).toISOString()
  const out: KpiAlert[] = []
  for (const m of o.months) {
    if (!m.isProjected) continue   // tháng mới <7 ngày chưa chiếu (nhiễu) hoặc đã xong: không cảnh báo
    const idx = (Number(m.month.split("-")[1]) - 1) % 3
    const totals = totalsFromMonth(m)
    out.push(...evaluateMonth(m, idx, totals, o.targets, at))
  }
  return out
}

function evaluateMonth(m: MonthIn, idx: number, totals: QuarterTotalsIn, targets: TargetsIn, at: string): KpiAlert[] {
  // MỘT thẻ cho mỗi phân khúc (toàn công ty / B2B / B2C) và tháng, gộp các chỉ số lệch — 9 thẻ rời cho một tháng thì quá ồn để quyết định.
  const out: KpiAlert[] = []
  const ml = monthLabel(m.month)
  for (const seg of ["ALL", "B2B", "B2C"] as Seg[]) {
    const lows: KpiMetricLow[] = []
    for (const metric of ["rev", "gp", "cm1"] as Metric[]) {
      const target = Number(targets[seg]?.[metric]?.[idx]) || 0
      if (target <= 0) continue
      const projected = totals[seg][metric]
      const ratio = projected / target
      if (ratio >= RED_BELOW) continue
      lows.push({ metric, pct: Math.round(ratio * 1000) / 10, projected, target })
    }
    if (!lows.length) continue
    const severity: 2 | 3 = lows.some(l => l.pct < SEVERE_BELOW * 100) ? 3 : 2
    const worst = [...lows].sort((x, y) => x.pct - y.pct)[0]
    out.push({
      key: `kpi:${seg}:${m.month}`, seg, month: m.month, lows, severity,
      title: `${SEG_LABEL[seg]} ${ml} chiếu dưới target: ${lows.map(l => `${METRIC_LABEL[l.metric]} ${l.pct}%`).join(" · ")}`,
      detail: lows.map(l => `• ${METRIC_LABEL[l.metric]}: chiếu cả tháng ${tyi(l.projected)} / target ${tyi(l.target)} (thiếu ${tyi(l.target - l.projected)})`).join("\n") + `\nĐã qua ${m.elapsed ?? "?"}/${m.dim ?? "?"} ngày. Ngưỡng đỏ: dưới ${RED_BELOW * 100}%.`,
      question: `${SEG_LABEL[seg]} ${ml} đang chiếu dưới target: ${lows.map(l => `${METRIC_LABEL[l.metric]} ${l.pct}% (${tyi(l.projected)} / ${tyi(l.target)})`).join("; ")}. Phân tích nguyên nhân, bắt đầu từ ${METRIC_LABEL[worst.metric]} (lệch nhiều nhất): kênh/nhóm khách/SKU nào kéo thấp nhất so với kỳ trước, có phải do khách lớn giảm hay do giá vốn/chi phí? Dẫn số liệu và đề xuất 3 việc cụ thể.`,
      at,
    })
  }
  return out
}

/** Gộp cảnh báo mới vào danh sách cũ: giữ nguyên ngày phát sinh + trạng thái "bỏ qua" nếu chưa nặng hơn; chỗ đã hết lệch thì xoá. Thuần. */
export function mergeAlerts(old: KpiAlert[], fresh: KpiAlert[], now = new Date()): KpiAlert[] {
  const prev = new Map(old.map(a => [a.key, a]))
  return fresh.map(f => {
    const p = prev.get(f.key)
    if (!p) return f
    const stillDismissed = p.dismissedUntil && Date.parse(p.dismissedUntil) > now.getTime() && f.severity <= p.severity
    return { ...f, at: p.at, ...(stillDismissed ? { dismissedUntil: p.dismissedUntil } : {}) }
  })
}
export const activeAlerts = (list: KpiAlert[], now = Date.now()) => list.filter(a => !a.dismissedUntil || Date.parse(a.dismissedUntil) <= now)

/** Quý hiện tại theo giờ VN: "Q4", 2026. */
export function vnQuarter(now = new Date()): { q: number; year: number; label: string } {
  const d = new Date(now.getTime() + 7 * 3600_000)
  const q = Math.floor(d.getUTCMonth() / 3) + 1, year = d.getUTCFullYear()
  return { q, year, label: `Q${q}-${year}` }
}

// ── I/O ──
const key = (u: string) => `argon_alerts:${u}`
async function db() { return (await import("@/lib/supabase")).supabaseAdmin }
async function readJson<T>(k: string, fallback: T): Promise<T> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", k).maybeSingle()
  try { const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value; return (v ?? fallback) as T } catch { return fallback }
}
/** Như readJson nhưng PHÂN BIỆT "không có" với "đọc lỗi": đọc lỗi thì ok=false để người gọi KHÔNG ghi đè dữ liệu cũ bằng giá trị mặc định. */
async function readStrict<T>(k: string, fallback: T): Promise<{ ok: true; v: T } | { ok: false; err: string }> {
  const { data, error } = await (await db()).from("app_settings").select("value").eq("key", k).maybeSingle()
  if (error) return { ok: false, err: error.message }
  try { const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value; return { ok: true, v: (v ?? fallback) as T } } catch { return { ok: false, err: "giá trị không phải JSON" } }
}
export const listAlerts = (username: string) => readJson<KpiAlert[]>(key(username), [])
async function saveAlerts(username: string, list: KpiAlert[]) {
  await (await db()).from("app_settings").upsert({ key: key(username), value: JSON.stringify(list), category: "argon", label: "Cảnh báo KPI của Trợ lý", updated_at: new Date().toISOString() }, { onConflict: "key" })
}

export async function dismissAlert(username: string, alertKey: string, now = new Date()): Promise<boolean> {
  const list = await listAlerts(username)
  const a = list.find(x => x.key === alertKey)
  if (!a) return false
  a.dismissedUntil = new Date(now.getTime() + DISMISS_DAYS * 86_400_000).toISOString()
  await saveAlerts(username, list)
  return true
}

/** Chạy một lượt kiểm KPI cho người dùng (gọi từ cron đêm). Lỗi một bước không ném: trả note. */
export async function runKpiWatch(username: string, origin: string, now = new Date()): Promise<{ checked: number; alerts: number; note?: string }> {
  const { q, year, label } = vnQuarter(now)
  if (!process.env.CRON_SECRET) return { checked: 0, alerts: 0, note: "thiếu CRON_SECRET" }
  // Mọi lỗi đọc/gọi (DB, quarterly-report, hết giờ) → trả note và GIỮ NGUYÊN danh sách cảnh báo cũ (kể cả trạng thái "bỏ qua"); chỉ xoá khi CHẮC CHẮN chưa nhập target.
  const all = await readStrict<Record<string, TargetsIn>>("company_monthly_targets", {})
  if (!all.ok) return { checked: 0, alerts: 0, note: `lỗi đọc target: ${all.err} — giữ nguyên cảnh báo cũ` }
  const targets = all.v[`Q${q}_${year}`] ?? {}
  if (!Object.keys(targets).length) { await saveAlerts(username, []); return { checked: 0, alerts: 0, note: `chưa nhập target ${label}` } }
  let j: { summary?: MonthIn[] }
  try {
    const res = await fetch(`${origin}/api/analytics/quarterly-report?quarter=Q${q}&year=${year}&companyCode=ALL`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(120_000) })
    if (!res.ok) return { checked: 0, alerts: 0, note: `quarterly-report HTTP ${res.status} — giữ nguyên cảnh báo cũ` }
    j = (await res.json()) as { summary?: MonthIn[] }
  } catch (e) { return { checked: 0, alerts: 0, note: `quarterly-report lỗi: ${(e as Error).message} — giữ nguyên cảnh báo cũ` } }
  if (!Array.isArray(j.summary)) return { checked: 0, alerts: 0, note: "quarterly-report không trả summary — giữ nguyên cảnh báo cũ" }
  const fresh = evaluateKpi({ months: j.summary, targets, now })
  const old = await readStrict<KpiAlert[]>(key(username), [])
  if (!old.ok) return { checked: 0, alerts: 0, note: `lỗi đọc cảnh báo cũ: ${old.err} — không ghi đè` }
  const merged = mergeAlerts(old.v, fresh, now)
  await saveAlerts(username, merged)
  return { checked: 9, alerts: merged.length }
}
