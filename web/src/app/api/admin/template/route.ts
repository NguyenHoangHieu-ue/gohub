import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import * as XLSX from "xlsx"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "admin")
    throw new Error("Unauthorized")
  return session
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WMProduct {
  vendor_product_id: string
  product_name:      string | null
  region:            string | null
  sim_type:          string | null
  days:              number | null
  data_gb:           number | null
  is_daily:          boolean
  is_unlimited:      boolean
  throttle_kbps:     number | null
  cogs:              number | null
  cogs_currency:     string | null
}

interface TemplateConfig {
  // ─ Country / Vendor ─
  supportCountryCode: string   // 3-char, e.g. "TWN"
  isoCodes:           string   // ISO codes, e.g. "TW"
  vendorCode:         string   // 2-char, e.g. "WM"
  countryNameVn:      string   // Vietnamese, e.g. "Đài Loan"
  countryNameEn:      string   // English,    e.g. "Taiwan"

  // ─ SKU Code Components ─
  purchaseType_US:    string   // letter, e.g. "D" → US productCode prefix
  purchaseType_VN:    string   // digit,  e.g. "3" → VN productCode prefix
  productType:        string   // 1-char, e.g. "C"
  dataPolicyCode:     string   // 1-char, e.g. "P" (daily <2Mbps throttle)

  // ─ Product Fields ─
  operatorCode:       string   // e.g. "WORLDMOVE"
  purchaseMethod:     string   // "API Purchase" or "Manual Purchase"
  skuType:            string   // "Base + Datapack" or "Base"
  importType:         string   // "Official"
  typeOfSim:          string   // "eSIM" or "SIM"

  // ─ Network ─
  networkType:        string   // "4G" or "5G/4G"
  apn:                string
  onsiteCarrier:      string

  // ─ Misc ─
  kycNeeded:          string   // "Yes" / "No"
  kycCode:            number   // 1 = no KYC, 6 = KYC required, etc.
  hotspot:            string   // "Yes" / "No"
  dailyResetTime:     string   // e.g. "UTC+8"
  activationTime:     string
  expirationDays:     number   // typically 90
  call:               string   // "Yes" / "No"

  // ─ Template Notes ─
  cogsDescription?:   string
  cogsFormula?:       string
}

interface FxSettings {
  fx_usd_vnd: number
  fx_twd_usd: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zeroPad(n: number, len: number): string {
  return String(Math.round(n)).padStart(len, "0")
}

/** ROUNDUP: always rounds away from zero */
function roundUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.ceil(value * factor) / factor
}

/**
 * DataAmount code (3 chars):
 *   unlimited  → "UNL"
 *   >= 1 GB   → zeroPad(GB, 3)  e.g. 3GB → "003", 10GB → "010"
 *   < 1 GB    → zeroPad(MB, 3)  e.g. 0.5GB → "500"
 */
function dataAmountCode(data_gb: number | null, is_unlimited: boolean): string {
  if (is_unlimited || data_gb == null) return "UNL"
  if (data_gb >= 1) return zeroPad(Math.round(data_gb), 3)
  return zeroPad(Math.round(data_gb * 1000), 3)
}

/** SKU suffix = DataAmountCode(3) + DayAmount(2) */
function skuSuffix(p: WMProduct): string {
  return dataAmountCode(p.data_gb, p.is_unlimited) + zeroPad(p.days ?? 0, 2)
}

function buildProductCode(purchaseType: string, cfg: TemplateConfig): string {
  return purchaseType + cfg.productType + cfg.supportCountryCode + cfg.vendorCode + cfg.dataPolicyCode
}

function skuUS(p: WMProduct, cfg: TemplateConfig): string {
  return buildProductCode(cfg.purchaseType_US, cfg) + skuSuffix(p)
}

function skuVN(p: WMProduct, cfg: TemplateConfig): string {
  return buildProductCode(cfg.purchaseType_VN, cfg) + skuSuffix(p)
}

function fmtThrottle(throttle_kbps: number | null): string {
  if (throttle_kbps == null) return ""
  if (throttle_kbps >= 1000) return `${throttle_kbps / 1000} Mbps`
  return `${throttle_kbps} kbps`
}

function fmtData(p: WMProduct): string {
  if (p.is_unlimited) return "Unlimited"
  if (p.data_gb == null) return ""
  if (p.data_gb < 1) return `${Math.round(p.data_gb * 1000)}MB`
  return `${p.data_gb}GB`
}

function nameVn(p: WMProduct, cfg: TemplateConfig): string {
  const days = zeroPad(p.days ?? 0, 2)
  if (p.is_unlimited) return `${cfg.typeOfSim} ${cfg.countryNameVn} Unlimited ${days} Ngày`
  return `${cfg.typeOfSim} ${cfg.countryNameVn} ${fmtData(p)} ${days} Ngày`
}

function nameEn(p: WMProduct, cfg: TemplateConfig): string {
  const days = zeroPad(p.days ?? 0, 2)
  const dayLabel = `${days} Day${(p.days ?? 1) !== 1 ? "s" : ""}`
  if (p.is_unlimited) return `${cfg.typeOfSim} ${cfg.countryNameEn} Unlimited ${dayLabel}`
  return `${cfg.typeOfSim} ${cfg.countryNameEn} ${fmtData(p)} ${dayLabel}`
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { products: WMProduct[]; config: TemplateConfig; settings: FxSettings }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { products, config, settings } = body
  if (!products?.length || !config || !settings)
    return NextResponse.json({ error: "Thiếu dữ liệu đầu vào" }, { status: 400 })

  const fx_twd_usd = Number(settings.fx_twd_usd) || 0.03165
  const fx_usd_vnd = Number(settings.fx_usd_vnd) || 26394
  const productCodeUS = buildProductCode(config.purchaseType_US, config)
  const productCodeVN = buildProductCode(config.purchaseType_VN, config)

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Danh sách sản phẩm ──────────────────────────────────────────
  const s1 = products.map(p => {
    const costUSD = p.cogs != null ? roundUp(p.cogs * fx_twd_usd, 2) : null
    const costVND = costUSD != null ? roundUp(costUSD * fx_usd_vnd, 0) : null
    return {
      wmproductId:       p.vendor_product_id,
      productId:         skuUS(p, config),
      "product name":    p.product_name ?? "",
      region:            p.region ?? "",
      type:              p.sim_type ?? "",
      "cost price (NT)": p.cogs ?? "",
      "cost price (USD)": costUSD ?? "",
      "cost price (VND)": costVND ?? "",
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1), "Danh sách sản phẩm")

  // ── Sheet 2: Cấu trúc & cogs ─────────────────────────────────────────────
  const s2 = [
    [config.cogsDescription ?? `SIM/eSIM - ${config.operatorCode} - ${config.countryNameEn}\nTỷ giá: TWD/USD: ${(1/fx_twd_usd).toFixed(3)} và VND/USD: ${fx_usd_vnd}`],
    [config.cogsFormula ?? `Tính giá:\n- cost price (USD) = cost price (NT) / ${(1/fx_twd_usd).toFixed(3)}\n- cost price (VND) = cost price (USD) * ${fx_usd_vnd}`],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), "Cấu trúc & cogs")

  // ── Sheet 3: Template_SKU_US ─────────────────────────────────────────────
  const skuCols = [
    "tenant","productCode","dataAmount","dataAmountUnit","dayAmount","dayAmountUnit",
    "nameVn","nameEn","frameSku","datapackSku","latestCogs","latestCogsCurrency",
    "throttleSpeed","call","callSmsDetails","expirations","vendorSku","vendorSkuSim","SKU",
  ]
  const s3 = products.map(p => {
    const costUSD = p.cogs != null ? roundUp(p.cogs * fx_twd_usd, 2) : null
    return {
      tenant:             "US",
      productCode:        productCodeUS,
      dataAmount:         p.is_unlimited ? 9999 : (p.data_gb ?? ""),
      dataAmountUnit:     "GB",
      dayAmount:          p.days ?? "",
      dayAmountUnit:      "Day(s)",
      nameVn:             nameVn(p, config),
      nameEn:             nameEn(p, config),
      frameSku:           "",
      datapackSku:        "",
      latestCogs:         costUSD ?? "",
      latestCogsCurrency: "USD",
      throttleSpeed:      fmtThrottle(p.throttle_kbps),
      call:               config.call,
      callSmsDetails:     "",
      expirations:        config.expirationDays,
      vendorSku:          p.vendor_product_id,
      vendorSkuSim:       "",
      SKU:                skuUS(p, config),
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3, { header: skuCols }), "Template_SKU_US")

  // ── Sheet 4: Template_SKU_VN ─────────────────────────────────────────────
  const s4 = products.map(p => {
    const costUSD = p.cogs != null ? roundUp(p.cogs * fx_twd_usd, 2) : null
    const costVND = costUSD != null ? roundUp(costUSD * fx_usd_vnd, 0) : null
    return {
      tenant:             "VN",
      productCode:        productCodeVN,
      dataAmount:         p.is_unlimited ? 9999 : (p.data_gb ?? ""),
      dataAmountUnit:     "GB",
      dayAmount:          p.days ?? "",
      dayAmountUnit:      "Day(s)",
      nameVn:             nameVn(p, config),
      nameEn:             nameEn(p, config),
      frameSku:           "",
      datapackSku:        "",
      latestCogs:         costVND ?? "",
      latestCogsCurrency: "VND",
      throttleSpeed:      fmtThrottle(p.throttle_kbps),
      call:               config.call,
      callSmsDetails:     "",
      expirations:        config.expirationDays,
      vendorSku:          skuUS(p, config),   // VN buys from US → vendorSku = US SKU code
      vendorSkuSim:       "",
      SKU:                skuVN(p, config),
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s4, { header: skuCols }), "Template_SKU_VN")

  // ── Sheet 5 & 6: Template_Product ────────────────────────────────────────
  const productCols = [
    "tenant","sourceType","productType","supportCountryCode","supportedCountries",
    "vendorCode","dataPolicyCode","typeOfSim","operatorCode","purchaseType","skuType",
    "dataType","baseSimEsimSkuCode","importType","dailyResetTime","activationTime",
    "networkType","apnOriginal","apn","onsiteCarrier","localPhoneNumber","localNumberCountry",
    "hotspot","kycCode","kycNeeded","kycLinks","topUpOptions","activation","unsupportedApps",
    "telcoPerks","note","dataPlanType",
  ]

  // One product row per unique productCode (products share the same product info)
  const makeProductRow = (tenant: string, sourceType: string | number, baseCode: string) => ({
    tenant,
    sourceType,
    productType:        config.productType,
    supportCountryCode: config.supportCountryCode,
    supportedCountries: config.isoCodes,
    vendorCode:         config.vendorCode,
    dataPolicyCode:     config.dataPolicyCode,
    typeOfSim:          config.typeOfSim,
    operatorCode:       config.operatorCode,
    purchaseType:       config.purchaseMethod,
    skuType:            config.skuType,
    dataType:           "",
    baseSimEsimSkuCode: baseCode,
    importType:         config.importType,
    dailyResetTime:     config.dailyResetTime,
    activationTime:     config.activationTime,
    networkType:        config.networkType,
    apnOriginal:        config.apn,
    apn:                config.apn,
    onsiteCarrier:      config.onsiteCarrier,
    localPhoneNumber:   "",
    localNumberCountry: "",
    hotspot:            config.hotspot,
    kycCode:            config.kycCode,
    kycNeeded:          config.kycNeeded,
    kycLinks:           "",
    topUpOptions:       "",
    activation:         "",
    unsupportedApps:    "",
    telcoPerks:         "",
    note:               "",
    dataPlanType:       "",
  })

  // US: sourceType = letter (string), VN: sourceType = number
  const vnSourceNum = /^\d+$/.test(config.purchaseType_VN)
    ? parseInt(config.purchaseType_VN)
    : config.purchaseType_VN

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([makeProductRow("US", config.purchaseType_US, productCodeUS)], { header: productCols }),
    "Template_Product_US"
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([makeProductRow("VN", vnSourceNum, productCodeVN)], { header: productCols }),
    "Template_Product_VN"
  )

  const buf  = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template_${date}.xlsx"`,
    },
  })
}
