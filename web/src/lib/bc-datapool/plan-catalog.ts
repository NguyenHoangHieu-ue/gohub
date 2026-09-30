import * as XLSX from "xlsx"
import type { DataUnit, PlanKind, Pool, ProductInput, SimType } from "./types"

/** 1 gói (Plan ID = ProductID BC) trong file "Purchase information" xuất từ Portal BC Datapool. */
export interface CatalogPlan {
  id: string
  sim: SimType
  kind: Exclude<PlanKind, "Unlimited">
  countries: string[]
  amount: number
  unit: DataUnit
  pool: Pool
  operators: string[]
  /** "Natural Day" (reset 00:00 UTC+8) hoặc "24-Hour" */
  timing: string
  /** Tốc độ sau khi hết data tốc độ cao: 384 (thường), 1024 = "Throttle to 1Mbps" (dùng cho Unlimited), 128... */
  throttleKbps?: number
  name: string
  /** Các số ngày Portal thực sự bán cho gói này */
  days: number[]
}

export interface PlanCatalog {
  uploadedAt: string
  files: string[]
  plans: CatalogPlan[]
}

// APN trong mô tả gói cho biết pool: cmhk = CMHK (WD), e-ideas = Singtel (W1) — khớp file mẫu Japan/Taiwan.
const APN_POOL: Record<string, Pool> = { cmhk: "CMHK", "e-ideas": "SINGTEL" }

const cell = (v: unknown) => (v == null ? "" : String(v).trim())

function parseSheet(name: string, ws: XLSX.WorkSheet): CatalogPlan[] {
  const isEsim = /esim/i.test(name)
  const isSim = !isEsim && /\bsim\b/i.test(name)
  const kind = /daily/i.test(name) ? "Daily" : /fixed/i.test(name) ? "Fixed" : null
  if (!(isEsim || isSim) || !kind) return []   // Top-Up và sheet lạ: bỏ qua

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })
  const head = (rows[0] ?? []).map(cell)
  const ix = (h: string) => head.indexOf(h)
  const [iId, iName, iRegion, iCountry, iData, iDays, iTiming, iDesc] =
    ["Plan ID", "Plan Name", "Single or Multiple Region", "Country/Region", "Data", "Days", "Timing Rule", "Product Description"].map(ix)
  if ([iId, iCountry, iData, iDays, iDesc].some(i => i < 0)) throw new Error(`Sheet "${name}": thiếu cột bắt buộc (Plan ID, Country/Region, Data, Days, Product Description)`)

  const plans: CatalogPlan[] = []
  let cur = null as CatalogPlan | null
  for (const r of rows.slice(1)) {
    const id = cell(r[iId])
    if (id && id !== cur?.id) {
      const data = /([\d.]+)\s*(MB|GB)/i.exec(cell(r[iData]))
      const desc = cell(r[iDesc])
      const apn = /APN-([^；;<]*)/.exec(desc)?.[1]?.trim().toLowerCase() ?? ""
      const operators = Array.from(desc.matchAll(/(?:^|<br>)\s*[^<]*?-([^，<]+)，Network-/g)).map(m => m[1].trim())
      const pool = APN_POOL[apn]
      const throttleKbps = Number(/throttled into (\d+)kbps/i.exec(desc)?.[1]) || undefined
      cur = null
      if (data && pool) {
        cur = {
          id, sim: isEsim ? "eSIM" : "SIM", kind, pool, timing: cell(r[iTiming]), throttleKbps, name: cell(r[iName]),
          countries: cell(r[iCountry]).split(",").map(s => s.trim()).filter(Boolean),
          amount: Number(data[1]), unit: data[2].toUpperCase() as DataUnit, operators: Array.from(new Set(operators)), days: [],
        }
        if (cell(r[iRegion]).toLowerCase() === "single" || cur.countries.length === 1) plans.push(cur)
        else cur = null   // gói đa vùng: chưa hỗ trợ
      }
    }
    // Ô Plan ID có thể bị gộp (merged) → dòng tiếp theo trống nhưng vẫn là số ngày của gói hiện tại
    const d = Number(r[iDays])
    if (cur && Number.isFinite(d) && d > 0 && !cur.days.includes(d)) cur.days.push(d)
  }
  return plans
}

/** Đọc 1 file "Purchase information" (eSIM hoặc SIM — nhận diện theo tên sheet). */
export function parsePlanFile(buf: Buffer | ArrayBuffer): CatalogPlan[] {
  const wb = XLSX.read(buf, { type: "buffer" })
  const out: CatalogPlan[] = []
  for (const n of wb.SheetNames) out.push(...parseSheet(n, wb.Sheets[n]))
  if (!out.length) throw new Error(`Không thấy sheet "Daily/Fixed Data eSIM/SIM" nào (file có: ${wb.SheetNames.join(", ")})`)
  return out
}

// Tên nước Portal ↔ tên trong bảng báo giá khác nhau chút ít
const ALIAS: Record<string, string> = {
  "brunei darussalam": "brunei", columbia: "colombia", "east timor": "timor leste", macau: "macao",
  russia: "russian federation", "u s a": "united states", usa: "united states",
}
export function canonCountry(s: string): string {
  const c = s.toLowerCase().replace(/\(china\)/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  return ALIAS[c] ?? c
}

export interface PlanQuery { sim: SimType; kind: PlanKind; pool: Pool; coverage: string; amount: number; unit: DataUnit }

/**
 * Gói Portal khớp (nước đơn, cùng pool/SIM/dung lượng).
 * Unlimited (mã X) KHÔNG có gói riêng ở BC: nội bộ = 3GB tốc độ cao + 3GB @10Mbps + không giới hạn @1Mbps, phía BC gộp thành
 * "Daily {2×N}GB — Throttle to 1Mbps" → tra gói Daily có dung lượng gấp đôi và tốc độ sau ngưỡng 1024kbps.
 */
export function findPlans(cat: PlanCatalog, q: PlanQuery): CatalogPlan[] {
  const want = canonCountry(q.coverage)
  const unl = q.kind === "Unlimited"
  const kind = unl ? "Daily" : q.kind
  const amount = unl ? q.amount * 2 : q.amount
  return cat.plans.filter(p =>
    p.sim === q.sim && p.kind === kind && p.pool === q.pool && p.amount === amount && p.unit === q.unit &&
    (unl ? p.throttleKbps === 1024 : (p.throttleKbps ?? 384) !== 1024) &&
    p.countries.length === 1 && canonCountry(p.countries[0]) === want)
}

const newerId = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b))
const sameSpec = (a: CatalogPlan, b: CatalogPlan) =>
  a.timing === b.timing && a.throttleKbps === b.throttleKbps && a.operators.join() === b.operators.join() && a.days.join() === b.days.join()

export interface PlanInfo {
  product: number
  line: number
  /** manual = người dùng tự nhập · portal = tự lấy từ file Portal · missing/ambiguous = không tự lấy được · none = chưa upload file Portal / Unlimited */
  status: "manual" | "portal" | "missing" | "ambiguous" | "none"
  /** Ghi chú khi tự chọn giữa các Plan ID giống hệt nhau */
  note?: string
  productId: string
  planName?: string
  offeredDays?: number[]
  candidates?: string[]
}

/**
 * Điền ProductID còn trống từ file Portal và kiểm số ngày mà Portal thực sự bán. Không sửa dữ liệu người dùng đã nhập.
 * Cùng (nước, pool, loại, dung lượng) mà Portal có >1 Plan ID (VD Indonesia) → KHÔNG đoán, để trống và báo.
 */
export function resolvePlans(products: ProductInput[], cat: PlanCatalog | null): { products: ProductInput[]; info: PlanInfo[]; warnings: string[] } {
  const info: PlanInfo[] = []
  const warnings: string[] = []
  const out = products.map((p, pi) => {
    const label = `Sản phẩm #${pi + 1} (${p.countryNameEn || p.supportCountryCode || "?"})`
    const plans = p.plans.map((pl, li) => {
      const base = { product: pi, line: li }
      const manual = pl.productId.trim()
      const cands = cat && p.coverages[0] ? findPlans(cat, { sim: p.simType, kind: pl.kind, pool: p.pool, coverage: p.coverages[0], amount: pl.dataAmount, unit: pl.unit }) : []
      let chosen: CatalogPlan | undefined
      let status: PlanInfo["status"] = "none"
      let note: string | undefined
      let productId = manual
      if (manual) {
        status = "manual"
        chosen = cat?.plans.find(x => x.id === manual)
      } else if (cat) {
        if (cands.length === 1) { chosen = cands[0]; status = "portal"; productId = chosen.id }
        else if (cands.length > 1 && cands.every(c => sameSpec(c, cands[0]))) {
          // Portal có nhiều Plan ID GIỐNG HỆT nhau (chỉ khác ID/viết hoa tên) → lấy ID mới nhất, ghi chú để người dùng biết
          chosen = [...cands].sort((x, y) => newerId(y.id, x.id))[0]; status = "portal"; productId = chosen.id
          note = `Portal có ${cands.length} Plan ID giống hệt nhau (${cands.map(c => c.id).join(", ")}) — đã chọn ID mới nhất; muốn dùng ID khác thì nhập tay`
        } else if (cands.length > 1) {
          status = "ambiguous"
          warnings.push(`${label} · dòng ${li + 1}: Portal có ${cands.length} Plan ID cho gói này (${cands.map(c => c.id).join(", ")}) — chọn 1 và nhập ProductID`)
        } else {
          status = "missing"
          const want = pl.kind === "Unlimited" ? `Daily ${pl.dataAmount * 2}${pl.unit} Throttle to 1Mbps (cho Unlimited ${pl.dataAmount}${pl.unit})` : `${pl.kind} ${pl.dataAmount}${pl.unit}`
          warnings.push(`${label} · dòng ${li + 1}: không tìm thấy gói ${want} ${p.simType} của ${p.coverages[0] || "?"} (${p.pool}) trong file Portal — kiểm tra, upload lại file Portal mới nhất, hoặc nhập ProductID`)
        }
      }
      if (chosen) {
        const bad = pl.days.filter(d => !chosen!.days.includes(d))
        if (bad.length) warnings.push(`${label} · dòng ${li + 1}: Portal không bán ${bad.join(", ")} ngày cho gói này (Portal có: ${chosen.days.join(", ")})`)
      }
      info.push({ ...base, status, note, productId, planName: chosen?.name.trim(), offeredDays: chosen?.days, candidates: cands.length > 1 ? cands.map(c => c.id) : undefined })
      return { ...pl, productId }
    })
    return { ...p, plans }
  })
  return { products: out, info, warnings }
}
