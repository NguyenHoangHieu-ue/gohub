import { dataCode, dayCode } from "@/lib/bc-datapool/codes"
import { PRODUCT_HEADERS, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import { ceil2, dataCostPool, dataCostUsd, toMb, unlimitedFactor, usdToVnd } from "@/lib/bc-datapool/pricing"
import type { Assumptions, BuiltSheets, DataUnit, Fx, PlanKind, PlanLine, SimType, UnlimitedKey } from "@/lib/bc-datapool/types"

export { PRODUCT_HEADERS, SKU_HEADERS }

export const VENDOR = "3D"
export const OPERATOR = "3HK"
export const EXPIRATION_DAYS = 60
export const FRAME = { esimUs: "AB0003DK00000", simUs: "CD0003DK00000", simVn: "1D0003DK00000" } as const
export const BASE_SIM_CODES = "AB0003DK00000, 1D0003DK00000, CD0003DK00000"

/** F = Fixed · P = Daily (Count 24h) · T = Daily (GMT + 8) · X = Unlimited (GMT + 8): mức mặc định 3GB tốc độ cao → 10Mbps; mức khác thêm ở Công Thức Datapool (cùng mã X). */
export type Policy = "F" | "P" | "T" | "X"
export const POLICY_KIND: Record<Policy, PlanKind> = { F: "Fixed", P: "Daily", T: "Daily", X: "Unlimited" }
export const POLICY_LABEL: Record<Policy, string> = { F: "Fixed (F)", P: "Daily · Count 24h (P)", T: "Daily · GMT + 8 (T)", X: "Unlimited (X)" }
const RESET: Record<Policy, string> = { F: "Count 24h", P: "Count 24h", T: "GMT + 8", X: "GMT + 8" }

/** A = gói data rời · C = eSIM full · E = SIM full. */
export type TypeChar = "A" | "C" | "E"
export type Tenant = "US" | "VN"
const TYPE_LABEL: Record<TypeChar, string> = { A: "Datapack (A)", C: "eSIM full", E: "SIM full" }
const SKU_TYPE: Record<TypeChar, string> = { A: "Datapack", C: "Base + Datapack", E: "Base + Datapack" }

/** Ký tự đầu: VN = 3 · US = E, riêng SIM full US = C (theo sản phẩm 3HK đã có). */
export const productCode = (tenant: Tenant, type: TypeChar, c3: string, policy: Policy) =>
  `${tenant === "VN" ? "3" : type === "E" ? "C" : "E"}${type}${c3}${VENDOR}${policy}`
const sourceChar = (tenant: Tenant, type: TypeChar): string | number => (tenant === "VN" ? 3 : type === "E" ? "C" : "E")

/** Unlimited (X): amount/unit = dung lượng TỐC ĐỘ CAO mỗi ngày, speedMbps = tốc độ Unlimited (mặc định 10) — cặp phải có hệ số GB/ngày ở Công Thức Datapool. */
export interface ThkPlanInput { policy: Policy; amount: number; unit: DataUnit; days: number[]; speedMbps?: number }
export interface ThkProductInput {
  simType: SimType
  supportCountryCode: string
  isoCodes: string
  countryNameEn: string
  countryNameVn: string
  plans: ThkPlanInput[]
  /** Trường hợp đặc biệt: thêm SIM full đầu US (chỉ khi SIM) / eSIM data đầu VN (chỉ khi eSIM). */
  usSimFull?: boolean
  vnEsimData?: boolean
}

/** Giá nguồn của 1 sản phẩm (từ ncc_3hk): nước đắt nhất trong các nước của gói. */
export interface ThkPrice { pricePerGbHkd: number; network: string; kyc: boolean }

/** Trường-theo-nước copy từ Product 3HK đã có trong hệ thống (cùng nước). */
export interface ProductTpl {
  product_code: string; tenant: string
  supported_countries: string | null; network_type: string | null; onsite_carrier: string | null; kyc_code: string | null; kyc_needed: string | null
  kyc_links: string | null; note: string | null; activation_time: string | null; activation: string | null; local_phone_number: string | null
  local_number_country: string | null; top_up_options: string | null; hotspot: string | null; apn_original: string | null; apn: string | null
}

export interface Frames { esimUsUsd: number | null; simUsUsd: number | null; simVnVnd: number | null }

export interface ThkCostRow {
  type: string
  skuUS: string
  skuVN: string
  policy: Policy
  kind: PlanKind
  speedMbps?: number
  unlKey?: UnlimitedKey
  /** Mức Unlimited tự thêm: thứ tự trong Assumptions.unlCustom (ô tham số riêng ở sheet Tính giá) */
  unlCustomIdx?: number
  dataAmount: number
  unit: string
  days: number
  typeChar: TypeChar
  pricePerGbHkd: number
  network: string
  dataPool: number
  dataUsd: number
  feeUsd: number
  cogsUsd: number
  cogsVnd: number
  explain: string
}

export interface ThkBuildResult {
  sheets: BuiltSheets
  warnings: string[]
  costRows: ThkCostRow[]
  usCost: number[]
  vnCost: number[]
}

const fmt = (n: number) => String(Number(n.toFixed(2)))
const num = (n: number) => n.toLocaleString("en-US")

function names(sim: SimType, nameVn: string, nameEn: string, policy: Policy, amount: number, unit: string, days: number, speed = 10) {
  if (policy === "X") return { vn: `${sim} ${nameVn} Unlimited ${speed}mbps ${days} ngày`, en: `${sim} ${nameEn} Unlimited ${speed}mbps ${days} Day(s)` }
  const a = `${fmt(amount)} ${unit}`
  if (policy === "F") return { vn: `${sim} ${nameVn} ${a} ${days} ngày`, en: `${sim} ${nameEn} ${a} ${days} Day(s)` }
  return { vn: `${sim} ${nameVn} ${a}/ngày ${days} ngày`, en: `${sim} ${nameEn} ${a}/day ${days} Day(s)` }
}

const throttle = (policy: Policy, tenant: Tenant, amount = 3, unit = "GB", speed = 10) =>
  policy !== "X" ? "256 kbps" : tenant === "US" ? `${fmt(amount)}${unit} of high-speed data per day, then unlimited data at ${speed}Mbps` : `${fmt(amount)}${unit} tốc độ cao mỗi ngày, sau đó không giới hạn ở tốc độ ${speed}Mbps`

const DEFAULT_ACT = { US: "It will be activated after receiving the network signal.", VN: "Được kích hoạt sau khi nhận được tín hiệu mạng." }

/** Chọn Product mẫu: đúng mã → cùng tenant + loại → cùng tenant → bất kỳ. */
function pickTpl(tpls: ProductTpl[], tenant: Tenant, type: TypeChar, policy: Policy, c3: string): ProductTpl | null {
  const exact = productCode(tenant, type, c3, policy)
  return tpls.find(t => t.product_code === exact)
    ?? tpls.find(t => t.tenant === tenant && t.product_code[1] === type)
    ?? tpls.find(t => t.tenant === tenant)
    ?? tpls[0] ?? null
}

export interface BuildCtx { fx: Fx; a: Assumptions; frames: Frames }

export function build(products: { input: ThkProductInput; price: ThkPrice | null; tpls: ProductTpl[] }[], ctx: BuildCtx): ThkBuildResult {
  const { fx, a, frames } = ctx
  const out: ThkBuildResult = { sheets: { skuUS: [], skuVN: [], productUS: [], productVN: [] }, warnings: [], costRows: [], usCost: [], vnCost: [] }
  const seenSku = new Set<string>(), seenProduct = new Set<string>()

  products.forEach(({ input: p, price, tpls }, pi) => {
    const label = `Sản phẩm #${pi + 1} (${p.countryNameEn || p.supportCountryCode || "?"})`
    if (!/^[A-Z0-9]{3}$/.test(p.supportCountryCode)) out.warnings.push(`${label}: mã nước/nhóm nước phải đúng 3 ký tự chữ hoa/số (đang là "${p.supportCountryCode}")`)
    if (!p.isoCodes.trim()) out.warnings.push(`${label}: thiếu supportedCountries (mã ISO 2 ký tự)`)
    if (!p.countryNameEn.trim() || !p.countryNameVn.trim()) out.warnings.push(`${label}: thiếu tên nước (EN/VN)`)
    if (!price) { out.warnings.push(`${label}: chưa chọn nước nào có giá trong bảng giá 3HK`); return }
    if (!p.plans.length) { out.warnings.push(`${label}: chưa có gói nào`); return }
    if (!tpls.length) out.warnings.push(`${label}: chưa có Product 3HK nào của nước này trong hệ thống — các trường nước (note, KYC, kích hoạt…) dùng mặc định, kiểm tra lại trước khi import`)
    if (price.kyc) out.warnings.push(`${label}: nhà mạng 3HK có KYC trong bảng giá — kiểm tra kycNeeded/kycCode`)

    const missing = (t: TypeChar): string | false =>
      t === "C" ? frames.esimUsUsd == null && `khung eSIM ${FRAME.esimUs}`
      : t === "E" ? (frames.simUsUsd == null && `khung SIM US ${FRAME.simUs}`) || (frames.simVnVnd == null && `khung SIM VN ${FRAME.simVn}`)
      : false
    // US: eSIM A+C · SIM A (+E nếu bật) — VN: eSIM C (+A nếu bật) · SIM A+E
    const esim = p.simType === "eSIM"
    const typesFor = (tenant: Tenant): TypeChar[] =>
      tenant === "US" ? (esim ? ["A", "C"] : p.usSimFull ? ["A", "E"] : ["A"]) : esim ? (p.vnEsimData ? ["A", "C"] : ["C"]) : ["A", "E"]
    const has = (tenant: Tenant, t: TypeChar) => typesFor(tenant).includes(t)
    const usable = (["A", "C", "E"] as TypeChar[]).filter(t => has("US", t) || has("VN", t)).filter(t => {
      const m = missing(t)
      if (m) out.warnings.push(`${label}: thiếu giá ${m} trong hệ thống — bỏ qua loại ${TYPE_LABEL[t]}`)
      return !m
    })

    for (const policy of Array.from(new Set(p.plans.map(pl => pl.policy)))) {
      for (const type of usable) {
        for (const tenant of ["US", "VN"] as Tenant[]) {
          if (!has(tenant, type)) continue
          const pc = productCode(tenant, type, p.supportCountryCode, policy)
          if ((tenant === "US" || !has("US", type)) && seenProduct.has(pc)) out.warnings.push(`${label}: trùng Product Code ${pc} với sản phẩm khác trong cùng lần xuất`)
          seenProduct.add(pc)
          const t = pickTpl(tpls, tenant, type, policy, p.supportCountryCode)
          const row: (string | number)[] = [
            tenant, sourceChar(tenant, type), type, p.supportCountryCode, t?.supported_countries || p.isoCodes, VENDOR, policy, "",
            `${p.simType} ${p.countryNameEn}`, `${p.simType} ${p.countryNameVn}`, p.simType, OPERATOR, "API Purchase", SKU_TYPE[type],
            policy === "F" ? "Fixed Data" : "Daily Data", type === "A" ? BASE_SIM_CODES : "", "Official", RESET[policy], t?.activation_time || DEFAULT_ACT[tenant],
            t?.network_type || "4G/5G", t?.apn_original || "mobile.three.com.hk", t?.apn || "gohub.com", t?.onsite_carrier || price.network,
            t?.local_phone_number || "No", t?.local_number_country || "", t?.hotspot || "Yes", Number(t?.kyc_code) || (price.kyc ? 6 : 1), t?.kyc_needed || (price.kyc ? "Yes" : "No"),
            t?.kyc_links || "", t?.top_up_options || "No", t?.activation || "", "", "", t?.note || "", "", pc,
          ]
          ;(tenant === "US" ? out.sheets.productUS : out.sheets.productVN).push(row)
        }
      }
    }

    p.plans.forEach((pl, li) => {
      const pname = `${label} · dòng ${li + 1}`
      const kind = POLICY_KIND[pl.policy]
      const isX = pl.policy === "X"
      if (!pl.days.length) out.warnings.push(`${pname}: chưa nhập số ngày`)
      const speed = isX ? (pl.speedMbps ?? 10) : undefined
      // Unlimited: (dung lượng tốc độ cao, tốc độ) phải thuộc mức có hệ số GB/ngày (mức có sẵn 3GB+10Mbps hoặc mức tự thêm) — không đoán
      const unl = isX ? unlimitedFactor(a, pl.amount, pl.unit, speed) : null
      if (isX && !unl) { out.warnings.push(`${pname}: chưa có hệ số GB/ngày cho Unlimited ${fmt(pl.amount)}${pl.unit} tốc độ cao + ${speed}Mbps — thêm mức này ở Admin › Cài đặt › Công Thức Datapool`); return }
      const line: PlanLine = { kind, dataAmount: pl.amount, unit: pl.unit, days: pl.days, productId: "", speedMbps: speed }
      for (const d of pl.days) {
        const dc = dataCode(pl.amount, pl.unit), dd = dayCode(d)
        if (!dc || !dd) { out.warnings.push(`${pname}: không mã hoá được ${pl.amount}${pl.unit} × ${d} ngày (MB phải là bội của 100 và ≤ 900; GB nguyên ≤ 999 hoặc dạng x.5 ≤ 9.5; ngày 1–99)`); continue }
        const sku = (tenant: Tenant, type: TypeChar) => `${productCode(tenant, type, p.supportCountryCode, pl.policy)}${dc}${dd}`
        if (seenSku.has(sku("US", "A"))) { out.warnings.push(`${pname}: trùng SKU ${sku("US", "A")}`); continue }
        seenSku.add(sku("US", "A"))

        const dataPool = dataCostPool(line, d, price.pricePerGbHkd, a)
        const dataUsd = dataCostUsd(line, d, price.pricePerGbHkd, "HKD", fx, a)
        if (!(dataPool > 0)) { out.warnings.push(`${pname}: chưa có hệ số GB/ngày cho Unlimited ${fmt(pl.amount)}${pl.unit} + ${speed}Mbps (Admin › Cài đặt › Công Thức Datapool)`); continue }
        const nm = names(p.simType, p.countryNameVn, p.countryNameEn, pl.policy, pl.amount, pl.unit, d, speed)
        const how = pl.policy === "F" ? `${fmt(pl.amount)}${pl.unit} × ${a.fixedPct * 100}% data thực dùng`
          : isX ? `${unl!.gbPerDay} GB/ngày × ${d} ngày` : `${fmt(pl.amount)}${pl.unit}/ngày × ${d} ngày × ${a.dailyPct * 100}%`
        const base = `${how} × ${price.pricePerGbHkd} HKD/GB = ${dataPool} HKD → ÷ ${fx.hkdPerUsd} = ${dataUsd} USD`

        for (const type of usable) {
          const cUS = sku("US", type), cVN = sku("VN", type)
          let cogsUsd = dataUsd, cogsVnd = usdToVnd(dataUsd, fx), feeUsd = 0, explain = base
          if (type === "A") explain += ` → × ${num(fx.vndPerUsd)} = ${num(cogsVnd)} VND`
          else if (type === "C") {
            feeUsd = frames.esimUsUsd!; cogsUsd = ceil2(dataUsd + feeUsd); cogsVnd = usdToVnd(cogsUsd, fx)
            explain += ` + khung eSIM ${feeUsd} = ${cogsUsd} USD → × ${num(fx.vndPerUsd)} = ${num(cogsVnd)} VND`
          } else {
            feeUsd = frames.simUsUsd!; cogsUsd = ceil2(dataUsd + feeUsd)
            const dataVnd = cogsVnd
            cogsVnd = dataVnd + frames.simVnVnd!
            explain += ` · US: + khung SIM ${feeUsd} = ${cogsUsd} USD · VN: ${num(dataVnd)} + khung ${num(frames.simVnVnd!)} = ${num(cogsVnd)} VND`
          }
          const row = (tenant: Tenant): (string | number)[] => {
            const us = tenant === "US"
            const frame = type === "C" ? (us ? FRAME.esimUs : "") : type === "E" ? (us ? FRAME.simUs : FRAME.simVn) : ""
            const datapack = type === "A" || (type === "C" && !us) ? "" : sku(tenant, "A")
            // vendorSku US của gói data (CDOF…/TDOF…) không suy ra được → để trống, nhập tay sau. VN trỏ về mã US tương ứng.
            const vendor = type === "A" ? (us ? "" : cUS) : type === "C" && !us ? cUS : ""
            return [
              tenant, productCode(tenant, type, p.supportCountryCode, pl.policy), pl.amount, pl.unit, d, "Day(s)", nm.vn, nm.en, frame, datapack,
              us ? cogsUsd : cogsVnd, us ? "USD" : "VND", throttle(pl.policy, tenant, pl.amount, pl.unit, speed), isX ? toMb(pl.amount, pl.unit) : "", isX ? (speed as number) : "", "No", "", EXPIRATION_DAYS,
              vendor, type === "A" ? vendor : "", us ? cUS : cVN,
            ]
          }
          const ci = out.costRows.length
          if (has("US", type)) { out.sheets.skuUS.push(row("US")); out.usCost.push(ci) }
          if (has("VN", type)) { out.sheets.skuVN.push(row("VN")); out.vnCost.push(ci) }
          out.costRows.push({
            type: TYPE_LABEL[type], skuUS: has("US", type) ? cUS : "", skuVN: has("VN", type) ? cVN : "", policy: pl.policy, kind, speedMbps: speed, unlKey: unl?.key, unlCustomIdx: unl?.customIdx, dataAmount: pl.amount, unit: pl.unit, days: d, typeChar: type,
            pricePerGbHkd: price.pricePerGbHkd, network: price.network, dataPool, dataUsd, feeUsd, cogsUsd, cogsVnd, explain,
          })
        }
      }
    })
  })
  return out
}

export const SHEET_NAMES = { skuUS: "Template_sku_US", skuVN: "Template_sku_VN", productUS: "Template_product_US", productVN: "Template_product_VN" } as const
export const withHeaders = (s: BuiltSheets) => ({
  [SHEET_NAMES.skuUS]: [SKU_HEADERS, ...s.skuUS],
  [SHEET_NAMES.skuVN]: [SKU_HEADERS, ...s.skuVN],
  [SHEET_NAMES.productUS]: [PRODUCT_HEADERS, ...s.productUS],
  [SHEET_NAMES.productVN]: [PRODUCT_HEADERS, ...s.productVN],
})
