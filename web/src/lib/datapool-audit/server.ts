import { changePct } from "./compare"
import { waitUntil } from "@vercel/functions"
import { supabaseAdmin } from "@/lib/supabase"
import { findLevel, levelsOf, type CustomUnlimited } from "@/lib/datapool-formula"
import { loadAssumptions, loadFx, loadPriceList, loadRefCountries, loadSupportCountries, loadWhiteSimVnd } from "@/lib/bc-datapool/server"
import { loadFrames, loadNcc3hk } from "@/lib/threehk-datapool/server"
import { getLarkUserOpenId } from "@/lib/lark"
import { notify } from "@/lib/notify"
import { auditAll, mismatchSignature, summarize, VENDOR_LABEL, type AuditCtx, type AuditProductInput, type AuditRow, type AuditSkuInput, type AuditVendor, type AuditSummary } from "./engine"

export const AUDIT_STATE_KEY = "datapool.audit_state"
export const AUDIT_PAGE = "https://intel-v2.gohub.cloud/admin?tab=cogs-audit"
export const ALL_VENDORS: AuditVendor[] = ["3HK", "BC_CMHK", "BC_SINGTEL"]
const CODE_OF_VENDOR: Record<AuditVendor, string> = { "3HK": "3D", BC_CMHK: "WD", BC_SINGTEL: "W1" }
const SKU_COLS = "sku_code,product_code,tenant,status,data_amount,data_amount_unit,day_amount,data,speed,throttle_speed,latest_cogs,latest_cogs_currency,product_type"
export const ACTIVE_STATUSES = ["Active", "Temporary"]

/** Toàn bộ SKU của các vendor (phân trang 1.000 dòng) + Product tương ứng (gom lô 100, không N+1). */
export async function loadAuditData(vendors: AuditVendor[], statuses: string[] | null = ACTIVE_STATUSES): Promise<{ skus: AuditSkuInput[]; products: AuditProductInput[] }> {
  const skus: AuditSkuInput[] = []
  for (const v of vendors) {
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin.from("skus").select(SKU_COLS).like("sku_code", `_____${CODE_OF_VENDOR[v]}%`).order("sku_code").range(from, from + 999)
      if (statuses) q = q.in("status", statuses)
      const { data, error } = await q
      if (error) throw new Error(`Đọc skus lỗi: ${error.message}`)
      skus.push(...((data ?? []) as AuditSkuInput[]))
      if ((data ?? []).length < 1000) break
    }
  }
  const codes = Array.from(new Set(skus.map(s => s.product_code)))
  const products: AuditProductInput[] = []
  for (let i = 0; i < codes.length; i += 100) {
    const { data, error } = await supabaseAdmin.from("products").select("product_code,supported_countries,onsite_carrier,type_of_sim").in("product_code", codes.slice(i, i + 100))
    if (error) throw new Error(`Đọc products lỗi: ${error.message}`)
    products.push(...((data ?? []) as AuditProductInput[]))
  }
  return { skus, products }
}

export async function loadAuditCtx(): Promise<AuditCtx> {
  const [fx, a, ncc, refs, groups, priceList, frames, whiteSimVnd] = await Promise.all([loadFx(), loadAssumptions(), loadNcc3hk(), loadRefCountries(), loadSupportCountries(), loadPriceList(), loadFrames(), loadWhiteSimVnd()])
  return { fx, a, ncc, refs, groups, priceList, frames, whiteSimVnd }
}

/** Các đầu vào ảnh hưởng giá vốn — lưu lại để lần sau biết cái gì đã đổi. */
export interface AuditInputs {
  fx: { hkdPerUsd: number; cnyPerUsd: number; vndPerUsd: number; vndPerUsdInc: number; month?: string }
  fixedPct: number; dailyPct: number; levels: CustomUnlimited[]
  frames: { esimUsUsd: number | null; simUsUsd: number | null; simVnVnd: number | null }; whiteSimVnd: number | null
  /** Giá/GB theo từng dòng bảng giá: "3HK|Thailand" → 5 · "CMHK|Japan|KDDI" → 5.3 */
  prices: Record<string, number>
  /** Phí IMSI / phí eSIM (CNY) từng pool */
  fees: Record<string, number>
}

export function snapshotInputs(ctx: AuditCtx): AuditInputs {
  const prices: Record<string, number> = {}
  for (const r of ctx.ncc) prices[`3HK|${r.country}`] = r.price_per_gb_hkd
  const fees: Record<string, number> = {}
  for (const pool of ["CMHK", "SINGTEL"] as const) {
    const l = ctx.priceList?.pools[pool]
    if (!l) continue
    for (const r of l.rows) prices[`${pool}|${r.coverage}|${r.operator}`] = r.pricePerGb
    fees[`${pool}.imsi`] = l.imsiFee; fees[`${pool}.esimCny`] = l.esimFeeCny
  }
  const { month, ...fx } = ctx.fx as AuditCtx["fx"] & { month?: string }
  return { fx: { ...fx, month }, fixedPct: ctx.a.fixedPct, dailyPct: ctx.a.dailyPct, levels: levelsOf(ctx.a), frames: ctx.frames, whiteSimVnd: ctx.whiteSimVnd, prices, fees }
}

const n = (x: number | null | undefined) => (x == null ? "—" : String(Number(Number(x).toFixed(4))))
const lvLabel = (l: CustomUnlimited) => `${l.dataMb % 1024 === 0 ? `${l.dataMb / 1024}GB` : `${l.dataMb}MB`} + ${l.speedMbps}Mbps`

/** Liệt kê những đầu vào đã đổi so với lần soát trước (câu chữ ngắn, dùng cho DM + giao diện). */
export function diffInputs(prev: AuditInputs | null | undefined, cur: AuditInputs): string[] {
  if (!prev) return []
  const out: string[] = []
  const chg = (label: string, a: unknown, b: unknown) => { if (a !== b) out.push(`${label}: ${n(a as number)} → ${n(b as number)}`) }
  chg("Tỷ giá HKD/USD (Inc)", prev.fx.hkdPerUsd, cur.fx.hkdPerUsd); chg("Tỷ giá CNY/USD (Inc)", prev.fx.cnyPerUsd, cur.fx.cnyPerUsd)
  chg("Tỷ giá VND/USD (JSC)", prev.fx.vndPerUsd, cur.fx.vndPerUsd); chg("Tỷ giá VND/USD (Inc)", prev.fx.vndPerUsdInc, cur.fx.vndPerUsdInc)
  chg("Fixed % data thực dùng", prev.fixedPct, cur.fixedPct); chg("Daily % data thực dùng", prev.dailyPct, cur.dailyPct)
  for (const l of cur.levels) { const o = findLevel(prev.levels, l.dataMb, l.speedMbps); if (!o) out.push(`Mức Unlimited mới ${lvLabel(l)}: ${l.gbPerDay} GB/ngày`); else if (o.gbPerDay !== l.gbPerDay) out.push(`Unlimited ${lvLabel(l)}: ${o.gbPerDay} → ${l.gbPerDay} GB/ngày`) }
  for (const o of prev.levels) if (!findLevel(cur.levels, o.dataMb, o.speedMbps)) out.push(`Mức Unlimited ${lvLabel(o)} đã bị xoá khỏi bảng mức`)
  chg("Giá khung eSIM 3HK (USD)", prev.frames.esimUsUsd, cur.frames.esimUsUsd); chg("Giá khung SIM US 3HK (USD)", prev.frames.simUsUsd, cur.frames.simUsUsd)
  chg("Giá khung SIM VN 3HK (VND)", prev.frames.simVnVnd, cur.frames.simVnVnd); chg("Giá SIM trắng BC (VND)", prev.whiteSimVnd, cur.whiteSimVnd)
  for (const k of new Set([...Object.keys(prev.fees), ...Object.keys(cur.fees)])) chg(`Phí ${k}`, prev.fees[k], cur.fees[k])
  const priceLines: string[] = []
  for (const k of new Set([...Object.keys(prev.prices), ...Object.keys(cur.prices)])) {
    const a = prev.prices[k], b = cur.prices[k]
    if (a === b) continue
    const name = k.replace("|", " — ").replace("|", " · ")
    priceLines.push(a === undefined ? `Giá mới ${name}: ${b}/GB` : b === undefined ? `Giá ${name} bị bỏ khỏi bảng` : `Giá ${name}: ${a} → ${b}/GB`)
  }
  out.push(...priceLines.slice(0, 12)); if (priceLines.length > 12) out.push(`… và ${priceLines.length - 12} thay đổi giá khác`)
  return out
}

export interface AuditState { at: string; inputs: AuditInputs; signature: string; counts: { diff: number; nocogs: number; skip: number; total: number }; notifiedSignature?: string; notifiedAt?: string }

export async function loadState(): Promise<AuditState | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", AUDIT_STATE_KEY).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as AuditState) : null } catch { return null }
}
async function saveState(s: AuditState) {
  await supabaseAdmin.from("app_settings").upsert({ key: AUDIT_STATE_KEY, value: JSON.stringify(s), category: "datapool", label: "Trạng thái soát giá vốn Datapool lần gần nhất", updated_at: new Date().toISOString() }, { onConflict: "key" })
}

export interface AuditRun { rows: AuditRow[]; summary: AuditSummary; inputs: AuditInputs; ctx: AuditCtx; signature: string }
export async function runAudit(vendors: AuditVendor[] = ALL_VENDORS, statuses: string[] | null = ACTIVE_STATUSES, ctx?: AuditCtx): Promise<AuditRun> {
  const c = ctx ?? (await loadAuditCtx())
  const { skus, products } = await loadAuditData(vendors, statuses)
  const rows = auditAll(skus, products, c)
  return { rows, summary: summarize(rows), inputs: snapshotInputs(c), ctx: c, signature: mismatchSignature(rows) }
}

/** Nội dung DM: đầu vào đã đổi + số SKU lệch từng vendor + vài SKU lệch lớn nhất. */
export function dmText(run: AuditRun, changed: string[], reason: string): string {
  const s = run.summary
  const bad = run.rows.filter(r => r.verdict === "diff" || r.verdict === "nocogs")
  const lines: string[] = [s.diff + bad.filter(r => r.verdict === "nocogs").length > 0 ? "⚠️ Soát giá vốn Datapool: có SKU LỆCH giá tính lại" : "✅ Soát giá vốn Datapool: tất cả khớp"]
  lines.push(`Lý do soát: ${reason}`)
  if (changed.length) { lines.push("", "Đầu vào đã đổi so với lần soát trước:", ...changed.slice(0, 14).map(x => `• ${x}`)) }
  lines.push("", "Kết quả theo vendor (lệch / khớp / tổng):")
  for (const v of ALL_VENDORS) { const x = s.byVendor[v]; lines.push(`• ${VENDOR_LABEL[v]}: ${x.diff + x.nocogs} lệch · ${x.match + x.rounding} khớp · ${x.total} SKU${x.skip ? ` (${x.skip} bỏ qua — không tính lại được)` : ""}`) }
  const top = bad.filter(r => r.verdict === "diff").sort((a, b) => Math.abs(changePct(b.current, b.expected) ?? 0) - Math.abs(changePct(a.current, a.expected) ?? 0)).slice(0, 5)
  if (top.length) lines.push("", "Lệch lớn nhất:", ...top.map(r => `• ${r.sku} (${r.tenant}): giá cũ ${r.current} → giá mới ${r.expected} ${r.currency} (${(changePct(r.current, r.expected) ?? 0) > 0 ? "+" : ""}${changePct(r.current, r.expected)}%)`))
  lines.push("", `Xem + xuất file công thức: ${AUDIT_PAGE}`)
  return lines.join("\n")
}

/**
 * Soát toàn bộ + DM Hiếu khi (a) đầu vào đổi so với lần soát trước hoặc (b) tập SKU lệch thay đổi so với lần đã báo. Không đổi gì → im lặng (không spam mỗi ngày).
 * `force` luôn gửi. Trả kết quả để route cron/hook ghi log.
 */
export async function runAuditAndNotify(reason: string, force = false): Promise<{ notified: boolean; counts: AuditState["counts"]; changed: string[]; skipped?: string }> {
  const run = await runAudit()
  const prev = await loadState()
  const changed = diffInputs(prev?.inputs, run.inputs)
  const counts = { diff: run.summary.diff, nocogs: Object.values(run.summary.byVendor).reduce((n, v) => n + v.nocogs, 0), skip: run.summary.skip, total: run.summary.total }
  const issues = counts.diff + counts.nocogs
  // Có lệch: báo khi TẬP lệch khác lần đã báo. Hết lệch: báo "✅ khớp hết" đúng 1 lần (khi lần báo trước còn lệch). Im lặng nếu không có gì mới.
  const should = force || (issues > 0 ? run.signature !== prev?.notifiedSignature : !!prev?.notifiedSignature && !prev.notifiedSignature.startsWith("0:"))
  let notified = false, skipped: string | undefined
  if (should) {
    const hieu = await getLarkUserOpenId()
    if (!hieu) skipped = "chưa Kết nối Lark của Creator — không gửi được DM"
    else {
      const [first, ...rest] = dmText(run, changed, reason).split("\n")   // dòng đầu của dmText là kết luận → làm tiêu đề tin
      notified = await notify(hieu, { kind: first.startsWith("⚠️") ? "Cảnh báo" : "Báo cáo", source: "Soát giá vốn", title: first.replace(/^(⚠️|✅)\s*/u, ""), body: rest.join("\n").trim() })
    }
  }
  await saveState({ at: new Date().toISOString(), inputs: run.inputs, signature: run.signature, counts, notifiedSignature: notified ? run.signature : prev?.notifiedSignature, notifiedAt: notified ? new Date().toISOString() : prev?.notifiedAt })
  return { notified, counts, changed, skipped }
}

/** Kích hoạt soát + DM ở nền (không chặn request lưu) — gọi sau khi tỷ giá / công thức / bảng giá pool đổi. Lỗi chỉ ghi log. */
export function triggerAudit(reason: string): void {
  try { waitUntil(runAuditAndNotify(reason).then(() => undefined, e => console.error("[datapool-audit]", (e as Error).message))) } catch { /* ngoài Vercel: bỏ qua */ }
}
