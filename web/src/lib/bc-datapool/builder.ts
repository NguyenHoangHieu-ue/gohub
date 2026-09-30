import { POLICY_CODE, VENDOR_CODE, productCode, skuCode } from "./codes"
import { dataCostUsd, frameFeeUsd, usdToVnd } from "./pricing"
import type { Assumptions, BuiltSheets, Fx, PlanKind, PriceList, ProductInput } from "./types"

/** Tên sheet + tiêu đề cột PHẢI y hệt Format_add_new_packages.xlsx (template bắt buộc). */
export const SKU_HEADERS = ["tenant*", "productCode*", "dataAmount*", "dataAmountUnit*", "dayAmount*", "dayAmountUnit*", "nameVn*", "nameEn*", "frameSku", "datapackSku", "latestCogs", "latestCogsCurrency", "throttleSpeed", "call", "callSmsDetails", "expirations", "vendorSku", "vendorSkuSim", "SKU CODE"]
export const PRODUCT_HEADERS = ["tenant*", "sourceType*", "productType*", "supportCountryCode*", "supportedCountries", "vendorCode*", "dataPolicyCode*", "Purchase Formula*", "Name*", "Name VN*", "typeOfSim", "operatorCode", "purchaseType", "skuType", "dataType", "baseSimEsimSkuCode", "importType", "dailyResetTime", "activationTime", "networkType", "apnOriginal", "apn", "onsiteCarrier", "localPhoneNumber", "localNumberCountry", "hotspot", "kycCode", "kycNeeded", "kycLinks", "topUpOptions", "activation", "unsupportedApps", "telcoPerks", "note", "dataPlanType", "PRODUCT CODE"]
export const SHEET_NAMES = { skuUS: "Template_sku_US", skuVN: "Template_sku_VN", productUS: "Template_product_US", productVN: "Template_product_VN" } as const

const ACTIVATION_EN = "It will be activated after receiving the network signal."
const ACTIVATION_VN = "Gói sẽ được kích hoạt sau khi eSIM nhận được tín hiệu mạng."
const APN = { CMHK: "cmhk", SINGTEL: "e-ideas" } as const
export const EXPIRATION_DAYS = 90
const UNLIMITED_SPEED = "10mbps"

const fmt = (n: number) => String(Number(n.toFixed(2)))
const amountText = (n: number, unit: string) => `${fmt(n)} ${unit}`

export interface CostRow {
  skuUS: string
  skuVN: string
  pool: string
  operator: string
  pricePerGb: number
  currency: string
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
}

function names(p: ProductInput, kind: PlanKind, amount: number, unit: string, days: number) {
  const sim = p.simType
  if (kind === "Unlimited")
    return {
      vn: `${sim} ${p.countryNameVn} Unlimited ${UNLIMITED_SPEED} ${days} ngày`,
      en: `${sim} ${p.countryNameEn} Unlimited ${UNLIMITED_SPEED} ${days} Day(s)`,
    }
  const a = amountText(amount, unit)
  if (kind === "Daily")
    return { vn: `${sim} ${p.countryNameVn} ${a}/ngày ${days} ngày`, en: `${sim} ${p.countryNameEn} ${a}/day ${days} Day(s)` }
  return { vn: `${sim} ${p.countryNameVn} ${a} ${days} ngày`, en: `${sim} ${p.countryNameEn} ${a} ${days} Day(s)` }
}

const throttle = (kind: PlanKind, amount: number, unit: string) =>
  kind === "Unlimited" ? `${fmt(amount)}${unit} of high-speed data per day, then unlimited data at 10Mbps` : "384 kbps"

/** Giá/GB áp dụng = nhà mạng đắt nhất trong số đã chọn (quy tắc bảng COGS BC Datapool). */
export function pickOperatorPrice(p: ProductInput, list: PriceList) {
  const chosen = list.pools[p.pool].rows.filter(r => p.operators.includes(`${r.coverage}|${r.operator}`))
  if (!chosen.length) return null
  return chosen.reduce((m, r) => (r.pricePerGb > m.pricePerGb ? r : m))
}

export function build(products: ProductInput[], list: PriceList, fx: Fx, a: Assumptions): BuildResult {
  const out: BuildResult = { sheets: { skuUS: [], skuVN: [], productUS: [], productVN: [] }, warnings: [], costRows: [] }
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

    const chosen = pool.rows.filter(r => p.operators.includes(`${r.coverage}|${r.operator}`))
    const onsite = Array.from(new Set(chosen.map(r => r.operator))).join("/")
    const fee = frameFeeUsd(p.simType, pool, fx)
    const kycOps = chosen.filter(r => r.kyc)
    if (kycOps.length) out.warnings.push(`${label}: nhà mạng ${kycOps.map(r => r.operator).join(", ")} có KYC trong bảng giá — kiểm tra kycNeeded/kycCode`)

    const kinds = Array.from(new Set(p.plans.map(pl => pl.kind)))
    for (const kind of kinds) {
      const dataType = kind === "Fixed" ? "Fixed Data" : "Daily Data"
      const rowFor = (tenant: "US" | "VN"): (string | number)[] => {
        const us = tenant === "US"
        return [
          tenant, us ? "E" : 3, p.simType === "eSIM" ? "C" : "E", p.supportCountryCode, p.isoCodes, VENDOR_CODE[p.pool], POLICY_CODE[kind], "",
          `${p.simType} ${p.countryNameEn}`, `${p.simType} ${p.countryNameVn}`, p.simType, "BCDATAPOOL", "API Purchase", "Base + Datapack", dataType, "",
          "Official", "GMT+8", us ? ACTIVATION_EN : ACTIVATION_VN, "4G/5G", APN[p.pool], APN[p.pool], onsite, "No", "", "Yes", 1, "No", "", "", "", "", "", "", "",
          productCode(tenant, p.simType, p.supportCountryCode, p.pool, kind),
        ]
      }
      const pcUS = productCode("US", p.simType, p.supportCountryCode, p.pool, kind)
      if (seenProduct.has(pcUS)) out.warnings.push(`${label}: trùng Product Code ${pcUS} với sản phẩm khác trong cùng lần xuất`)
      seenProduct.add(pcUS)
      out.sheets.productUS.push(rowFor("US"))
      out.sheets.productVN.push(rowFor("VN"))
    }

    p.plans.forEach((pl, li) => {
      const pname = `${label} · dòng ${li + 1}`
      if (!pl.productId.trim()) out.warnings.push(`${pname}: chưa nhập ProductID`)
      if (!pl.days.length) out.warnings.push(`${pname}: chưa nhập số ngày`)
      for (const d of pl.days) {
        const sUS = skuCode(productCode("US", p.simType, p.supportCountryCode, p.pool, pl.kind), pl.dataAmount, pl.unit, d)
        const sVN = skuCode(productCode("VN", p.simType, p.supportCountryCode, p.pool, pl.kind), pl.dataAmount, pl.unit, d)
        if (!sUS || !sVN) {
          out.warnings.push(`${pname}: không mã hoá được ${pl.dataAmount}${pl.unit} × ${d} ngày (MB phải là bội của 100 và ≤ 900; GB nguyên ≤ 999 hoặc dạng x.5 ≤ 9.5; ngày 1–99)`)
          continue
        }
        if (seenSku.has(sUS)) { out.warnings.push(`${pname}: trùng SKU ${sUS}`); continue }
        seenSku.add(sUS)

        const dataUsd = dataCostUsd(pl, d, top.pricePerGb, pool.currency, fx, a)
        const cogsUsd = Math.round((dataUsd + fee) * 100) / 100
        const cogsVnd = usdToVnd(cogsUsd, fx)
        const nm = names(p, pl.kind, pl.dataAmount, pl.unit, d)
        const row = (tenant: "US" | "VN", code: string, vendorSku: string, cogs: number, cur: string) => [
          tenant, productCode(tenant, p.simType, p.supportCountryCode, p.pool, pl.kind), pl.dataAmount, pl.unit, d, "Day(s)", nm.vn, nm.en, "", "", cogs, cur,
          throttle(pl.kind, pl.dataAmount, pl.unit), "No", "", EXPIRATION_DAYS, vendorSku, "", code,
        ]
        out.sheets.skuUS.push(row("US", sUS, pl.productId.trim(), cogsUsd, "USD"))
        out.sheets.skuVN.push(row("VN", sVN, sUS, cogsVnd, "VND"))
        out.costRows.push({ skuUS: sUS, skuVN: sVN, pool: p.pool, operator: `${top.operator} (${top.coverage})`, pricePerGb: top.pricePerGb, currency: pool.currency, dataUsd, feeUsd: fee, cogsUsd, cogsVnd })
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
