import { FRAME_SKU, POLICY_CODE, VENDOR_CODE, productCode, skuCode, type ProductTypeChar } from "./codes"
import { explainCost, type CostExplain } from "./explain"
import { ceil2, dataCostPool, dataCostUsd, frameFeeUsd, toMb, unlimitedFactor, usdToVnd } from "./pricing"
import type { Assumptions, BuiltSheets, Fx, PlanKind, Pool, PriceList, ProductInput, UnlimitedKey } from "./types"
import { UNLIMITED_PROFILES } from "./types"

/** Tên sheet + tiêu đề cột PHẢI y hệt Format_add_new_packages.xlsx (template bắt buộc). */
export const SKU_HEADERS = ["tenant*", "productCode*", "dataAmount*", "dataAmountUnit*", "dayAmount*", "dayAmountUnit*", "nameVn*", "nameEn*", "frameSku", "datapackSku", "latestCogs", "latestCogsCurrency", "throttleSpeed", "dataMB", "speedMbps", "call", "callSmsDetails", "expirations", "vendorSku", "vendorSkuSim", "SKU CODE"]
export const PRODUCT_HEADERS = ["tenant*", "sourceType*", "productType*", "supportCountryCode*", "supportedCountries", "vendorCode*", "dataPolicyCode*", "Purchase Formula*", "Name*", "Name VN*", "typeOfSim", "operatorCode", "purchaseType", "skuType", "dataType", "baseSimEsimSkuCode", "importType", "dailyResetTime", "activationTime", "networkType", "apnOriginal", "apn", "onsiteCarrier", "localPhoneNumber", "localNumberCountry", "hotspot", "kycCode", "kycNeeded", "kycLinks", "topUpOptions", "activation", "unsupportedApps", "telcoPerks", "note", "dataPlanType", "PRODUCT CODE"]
export const SHEET_NAMES = { skuUS: "Template_sku_US", skuVN: "Template_sku_VN", productUS: "Template_product_US", productVN: "Template_product_VN" } as const

const ACTIVATION_EN = "It will be activated after receiving the network signal."
const ACTIVATION_VN = "Gói sẽ được kích hoạt sau khi eSIM nhận được tín hiệu mạng."
const APN = { CMHK: "cmhk", SINGTEL: "e-ideas" } as const
export const EXPIRATION_DAYS = 90

const fmt = (n: number) => String(Number(n.toFixed(2)))
const amountText = (n: number, unit: string) => `${fmt(n)} ${unit}`

export interface CostRow {
  /** eSIM full · SIM datapack (A) · SIM full (E) */
  type: string
  skuUS: string
  skuVN: string
  productId: string
  pool: string
  operator: string
  pricePerGb: number
  currency: string
  /** Thông số dòng tính giá — để file xuất dựng lại công thức Excel */
  kind: PlanKind
  dataAmount: number
  unit: string
  days: number
  feeKind: "esim" | "sim" | "none"
  /** Unlimited: tốc độ (Mbps) + ô hệ số GB/ngày dùng để tính (để file xuất chọn đúng ô tham số) */
  speedMbps?: number
  unlKey?: UnlimitedKey
  poolKey: Pool
  dataPool: number
  /** Công thức đã thế số cho từng giá (hiện khi rê chuột ở bản xem trước) */
  explain: CostExplain
  dataUsd: number
  feeUsd: number
  cogsUsd: number
  cogsVnd: number
}

export interface BuildResult {
  sheets: BuiltSheets
  warnings: string[]
  /** Bảng tính giá cho người soát: 1 dòng / SKU. */
  costRows: CostRow[]
  /** Chỉ số dòng costRows tương ứng với từng dòng của sheet SKU US / SKU VN (cùng thứ tự) */
  usCost: number[]
  vnCost: number[]
}

function names(p: ProductInput, kind: PlanKind, amount: number, unit: string, days: number, speed = 10) {
  const sim = p.simType
  if (kind === "Unlimited") {
    // Giữ tên cũ (Hiếu chốt): "eSIM Nhật Bản Unlimited 10mbps N ngày"
    return {
      vn: `${sim} ${p.countryNameVn} Unlimited ${speed}mbps ${days} ngày`,
      en: `${sim} ${p.countryNameEn} Unlimited ${speed}mbps ${days} Day(s)`,
    }
  }
  const a = amountText(amount, unit)
  if (kind === "Daily")
    return { vn: `${sim} ${p.countryNameVn} ${a}/ngày ${days} ngày`, en: `${sim} ${p.countryNameEn} ${a}/day ${days} Day(s)` }
  return { vn: `${sim} ${p.countryNameVn} ${a} ${days} ngày`, en: `${sim} ${p.countryNameEn} ${a} ${days} Day(s)` }
}

const throttle = (kind: PlanKind, amount: number, unit: string, speed = 10) =>
  kind === "Unlimited" ? `${fmt(amount)}${unit} of high-speed data per day, then unlimited data at ${speed}Mbps` : "384 kbps"

/** Giá/GB áp dụng = nhà mạng đắt nhất trong số đã chọn (quy tắc bảng COGS BC Datapool). */
export function pickOperatorPrice(p: ProductInput, list: PriceList) {
  const chosen = list.pools[p.pool].rows.filter(r => p.operators.includes(`${r.coverage}|${r.operator}`))
  if (!chosen.length) return null
  return chosen.reduce((m, r) => (r.pricePerGb > m.pricePerGb ? r : m))
}

export interface BuildOptions {
  /** Giá SIM trắng (VND) lấy từ DB — bắt buộc khi có sản phẩm SIM. */
  whiteSimVnd?: number
}

const dailyReset = (kind: PlanKind) => (kind === "Fixed" ? "Count 24h" : "GMT+8")

export function build(products: ProductInput[], list: PriceList, fx: Fx, a: Assumptions, opt: BuildOptions = {}): BuildResult {
  const out: BuildResult = { sheets: { skuUS: [], skuVN: [], productUS: [], productVN: [] }, warnings: [], costRows: [], usCost: [], vnCost: [] }
  const seenSku = new Set<string>()
  const seenProduct = new Set<string>()

  products.forEach((p, pi) => {
    const label = `Sản phẩm #${pi + 1} (${p.countryNameEn || p.supportCountryCode || "?"})`
    const pool = list.pools[p.pool]
    if (!/^[A-Z0-9]{3}$/.test(p.supportCountryCode)) out.warnings.push(`${label}: mã nước/nhóm nước phải đúng 3 ký tự chữ hoa/số (đang là "${p.supportCountryCode}")`)
    if (!p.isoCodes.trim()) out.warnings.push(`${label}: thiếu supportedCountries (mã ISO 2 ký tự)`)
    if (!p.countryNameEn.trim() || !p.countryNameVn.trim()) out.warnings.push(`${label}: thiếu tên nước (EN/VN)`)
    const top = pickOperatorPrice(p, list)
    if (!top) { out.warnings.push(`${label}: chưa chọn nhà mạng nào có giá trong pool ${p.pool}`); return }
    if (!p.plans.length) { out.warnings.push(`${label}: chưa có gói nào`); return }
    if (p.simType === "SIM" && !(opt.whiteSimVnd && opt.whiteSimVnd > 0)) {
      out.warnings.push(`${label}: thiếu giá SIM trắng (SKU ${FRAME_SKU.VN} trong hệ thống chưa có latest_cogs) — không tính được COGS SIM`)
      return
    }

    const chosen = pool.rows.filter(r => p.operators.includes(`${r.coverage}|${r.operator}`))
    const onsite = Array.from(new Set(chosen.map(r => r.operator))).join("/")
    const fee = frameFeeUsd(p.simType, pool, fx, opt.whiteSimVnd)
    const kycOps = chosen.filter(r => r.kyc)
    if (kycOps.length) out.warnings.push(`${label}: nhà mạng ${kycOps.map(r => r.operator).join(", ")} có KYC trong bảng giá — kiểm tra kycNeeded/kycCode`)

    // eSIM: chỉ eSIM full (C). SIM: gói data rời (A) + SIM full (E, ghép khung SIM + datapack).
    const types: ProductTypeChar[] = p.simType === "eSIM" ? ["C"] : ["A", "E"]
    const typeLabel = (t: ProductTypeChar) => (t === "C" ? "eSIM full" : t === "A" ? "SIM datapack (A)" : "SIM full (E, chỉ VN)")

    // 1 Product theo mỗi loại gói: Daily T · Fixed F · Unlimited X (chỉ dùng mã X cho Unlimited)
    const speedOf = (pl: ProductInput["plans"][number]) => (pl.kind === "Unlimited" ? (pl.speedMbps ?? 10) : undefined)
    const kinds = Array.from(new Set(p.plans.map(pl => pl.kind)))
    for (const kind of kinds) {
      const dataType = kind === "Fixed" ? "Fixed Data" : "Daily Data"
      for (const type of types) {
        // SIM full (E) chỉ bán ở đầu VN; datapack (A) vẫn cần bản US vì SKU VN trỏ về mã US (vendorSkuSim)
        const tenants: ("US" | "VN")[] = type === "E" ? ["VN"] : ["US", "VN"]
        const rowFor = (tenant: "US" | "VN"): (string | number)[] => {
          const us = tenant === "US"
          return [
            tenant, us ? "E" : 3, type, p.supportCountryCode, p.isoCodes, VENDOR_CODE[p.pool], POLICY_CODE[kind], "",
            `${p.simType} ${p.countryNameEn}`, `${p.simType} ${p.countryNameVn}`, p.simType, "BCDATAPOOL", "API Purchase", type === "A" ? "Datapack" : "Base + Datapack", dataType, "",
            "Official", dailyReset(kind), us ? ACTIVATION_EN : ACTIVATION_VN, "4G/5G", APN[p.pool], APN[p.pool], onsite, "No", "", "Yes", 1, "No", "", "", "", "", "", "", "",
            productCode(tenant, p.simType, p.supportCountryCode, p.pool, kind, type),
          ]
        }
        const pcKey = productCode(tenants[0], p.simType, p.supportCountryCode, p.pool, kind, type)
        if (seenProduct.has(pcKey)) out.warnings.push(`${label}: trùng Product Code ${pcKey} với sản phẩm khác trong cùng lần xuất`)
        seenProduct.add(pcKey)
        if (tenants.includes("US")) out.sheets.productUS.push(rowFor("US"))
        out.sheets.productVN.push(rowFor("VN"))
      }
    }

    p.plans.forEach((pl, li) => {
      const pname = `${label} · dòng ${li + 1}`
      if (!pl.productId.trim()) out.warnings.push(`${pname}: chưa nhập ProductID`)
      if (!pl.days.length) out.warnings.push(`${pname}: chưa nhập số ngày`)
      // Unlimited: tốc độ (Mbps) + dung lượng tốc độ cao quyết định hệ số GB/ngày (Công Thức Datapool); tổ hợp chưa có hệ số thì KHÔNG đoán
      const speed = speedOf(pl)
      const unl = pl.kind === "Unlimited" ? unlimitedFactor(a, pl.dataAmount, pl.unit, speed) : null
      if (pl.kind === "Unlimited") {
        if (!unl) { out.warnings.push(`${pname}: chưa có hệ số GB/ngày cho Unlimited ${pl.dataAmount}${pl.unit} tốc độ cao + ${speed}Mbps — hiện chỉ có mức ${UNLIMITED_PROFILES.map(x => x.label).join(" · ")} (thêm mức mới ở Admin › Cài đặt › Công Thức Datapool)`); return }
        const bcMb = toMb(pl.bcAmount ?? pl.dataAmount * 2, pl.bcUnit ?? pl.unit)
        if (toMb(pl.dataAmount, pl.unit) > bcMb) { out.warnings.push(`${pname}: dung lượng tốc độ cao ${pl.dataAmount}${pl.unit} lớn hơn tổng gói BC`); return }
      }
      for (const d of pl.days) {
        const code = (tenant: "US" | "VN", type: ProductTypeChar) =>
          skuCode(productCode(tenant, p.simType, p.supportCountryCode, p.pool, pl.kind, type), pl.dataAmount, pl.unit, d)
        const main = p.simType === "eSIM" ? "C" : "E"
        const sUS = code("US", main), sVN = code("VN", main)
        if (!sUS || !sVN) {
          out.warnings.push(`${pname}: không mã hoá được ${pl.dataAmount}${pl.unit} × ${d} ngày (MB phải là bội của 100 và ≤ 900; GB nguyên ≤ 999 hoặc dạng x.5 ≤ 9.5; ngày 1–99)`)
          continue
        }
        if (seenSku.has(sUS)) { out.warnings.push(`${pname}: trùng SKU ${sUS}`); continue }
        seenSku.add(sUS)

        const dataUsd = dataCostUsd(pl, d, top.pricePerGb, pool.currency, fx, a)
        const nm = names(p, pl.kind, pl.dataAmount, pl.unit, d, speed)
        const th = throttle(pl.kind, pl.dataAmount, pl.unit, speed)
        // Cột mới bên phải throttleSpeed (chỉ Unlimited): dataMB = MB tốc độ cao (3GB → 3072), speedMbps = tốc độ mức throttle giữa (10)
        const dataMbCell: number | string = pl.kind === "Unlimited" ? toMb(pl.dataAmount, pl.unit) : ""
        const speedCell: number | string = pl.kind === "Unlimited" ? (speed as number) : ""
        const pid = pl.productId.trim()
        const push = (type: ProductTypeChar, cogsUsd: number, feeUsd: number) => {
          const cUS = code("US", type)!, cVN = code("VN", type)!
          const cogsVnd = usdToVnd(cogsUsd, fx)
          const vnOnly = type === "E"
          const row = (tenant: "US" | "VN", sku: string, cogs: number, cur: string) => {
            const us = tenant === "US"
            const link = us ? "" : cUS   // VN trỏ về mã US tương ứng
            const frame = type === "E" ? FRAME_SKU.VN : ""
            const datapack = type === "E" ? code(tenant, "A")! : ""
            return [
              tenant, productCode(tenant, p.simType, p.supportCountryCode, p.pool, pl.kind, type), pl.dataAmount, pl.unit, d, "Day(s)", nm.vn, nm.en, frame, datapack, cogs, cur,
              th, dataMbCell, speedCell, "No", "", EXPIRATION_DAYS,
              // eSIM full: vendorSku = ProductID (US) / SKU US (VN). SIM datapack: theo tiền lệ DB (3AAS8WDT/EAAS8WDT) ProductID nằm ở vendorSkuSim. SIM full: để trống.
              type === "C" ? (us ? pid : link) : "", type === "A" ? (us ? pid : link) : "", sku,
            ]
          }
          const ci = out.costRows.length
          if (!vnOnly) { out.sheets.skuUS.push(row("US", cUS, cogsUsd, "USD")); out.usCost.push(ci) }
          out.sheets.skuVN.push(row("VN", cVN, cogsVnd, "VND")); out.vnCost.push(ci)
          out.costRows.push({
            type: typeLabel(type), skuUS: vnOnly ? "—" : cUS, skuVN: cVN, productId: pid, pool: p.pool, operator: `${top.operator} (${top.coverage})`,
            pricePerGb: top.pricePerGb, currency: pool.currency, kind: pl.kind, dataAmount: pl.dataAmount, unit: pl.unit, days: d,
            feeKind: feeUsd === 0 ? "none" : p.simType === "eSIM" ? "esim" : "sim", poolKey: p.pool, speedMbps: speed, unlKey: unl?.key,
            dataPool: dataCostPool(pl, d, top.pricePerGb, a), dataUsd, feeUsd, cogsUsd, cogsVnd,
            explain: explainCost({
              kind: pl.kind, dataAmount: pl.dataAmount, unit: pl.unit, days: d, pricePerGb: top.pricePerGb, currency: pool.currency,
              dataPool: dataCostPool(pl, d, top.pricePerGb, a), dataUsd, feeKind: feeUsd === 0 ? "none" : p.simType === "eSIM" ? "esim" : "sim",
              feeUsd, cogsUsd, cogsVnd, fx, a, imsiFee: pool.imsiFee, esimFeeCny: pool.esimFeeCny, whiteSimVnd: opt.whiteSimVnd ?? 0,
              unl: unl ? { gbPerDay: unl.gbPerDay, label: unl.label } : undefined,
            }),
          })
        }
        const full = ceil2(dataUsd + fee)
        if (p.simType === "eSIM") push("C", full, fee)
        else { push("A", dataUsd, 0); push("E", full, fee) }
      }
    })
  })
  return out
}

/** Thêm dòng tiêu đề để ghi ra sheet xlsx. */
export const withHeaders = (s: BuiltSheets) => ({
  [SHEET_NAMES.skuUS]: [SKU_HEADERS, ...s.skuUS],
  [SHEET_NAMES.skuVN]: [SKU_HEADERS, ...s.skuVN],
  [SHEET_NAMES.productUS]: [PRODUCT_HEADERS, ...s.productUS],
  [SHEET_NAMES.productVN]: [PRODUCT_HEADERS, ...s.productVN],
})
