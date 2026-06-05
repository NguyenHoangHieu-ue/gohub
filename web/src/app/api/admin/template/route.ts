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

interface WMProduct {
  vendor_product_id: string
  product_name:      string
  region:            string
  sim_type:          string
  days:              number
  data_amount?:      number | null
  data_unit?:        string | null
  is_unlimited:      boolean
  cogs?:             number | null
  cogs_currency?:    string | null
}

interface TemplateConfig {
  productCodePrefix:   string
  supportCountryCode:  string
  isoCodes:            string
  vendorCode:          string
  dataPolicyCode:      string
  sourceType:          string
  productType:         string
  importType:          string
  operatorCode:        string
  networkType:         string
  apn:                 string
  onsiteCarrier:       string
  kycNeeded:           string
  dailyResetTime:      string
  activationTime:      string
  expirationDays:      number
  call:                string
  hotspot:             string
  cogsDescription?:    string
  cogsFormula?:        string
  countryVn?:          string
}

interface FxSettings {
  fx_usd_vnd: number
  fx_twd_usd: number
}

function zeroPad(n: number, len: number): string {
  return String(Math.round(n)).padStart(len, "0")
}

function buildSkuSuffix(product: WMProduct): string {
  if (product.is_unlimited) {
    return "UNL" + zeroPad(product.days, 2)
  }
  const dataMb = product.data_amount ?? 0
  const dataVal = product.data_unit === "GB" ? dataMb * 10 : Math.round(dataMb / 100)
  return zeroPad(dataVal, 3) + zeroPad(product.days, 2)
}

function buildSkuUS(prefix: string, product: WMProduct): string {
  return prefix + buildSkuSuffix(product)
}

function buildSkuVN(prefix: string, product: WMProduct): string {
  const vnPrefix = "3" + prefix.slice(1)
  return vnPrefix + buildSkuSuffix(product)
}

function buildNameVn(product: WMProduct, config: TemplateConfig): string {
  const country = config.countryVn || config.supportCountryCode
  if (product.is_unlimited) {
    return `eSIM ${country} Unlimited ${product.days} Ngày`
  }
  const data = product.data_unit === "GB"
    ? `${product.data_amount}GB`
    : `${product.data_amount}${product.data_unit ?? "MB"}`
  return `eSIM ${country} ${data} ${product.days} Ngày`
}

function buildNameEn(product: WMProduct, config: TemplateConfig): string {
  const country = config.supportCountryCode
  if (product.is_unlimited) {
    return `eSIM ${country} Unlimited ${product.days} Day${product.days !== 1 ? "s" : ""}`
  }
  const data = product.data_unit === "GB"
    ? `${product.data_amount}GB`
    : `${product.data_amount}${product.data_unit ?? "MB"}`
  return `eSIM ${country} ${data} ${product.days} Day${product.days !== 1 ? "s" : ""}`
}

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
  if (!products?.length || !config || !settings) {
    return NextResponse.json({ error: "Thiếu dữ liệu đầu vào" }, { status: 400 })
  }

  const fx_twd_usd = Number(settings.fx_twd_usd) || 0.03165
  const fx_usd_vnd = Number(settings.fx_usd_vnd) || 26394

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Danh sách sản phẩm ──────────────────────────────────────────
  const sheet1Rows = products.map(p => {
    const costUSD = p.cogs ? p.cogs * fx_twd_usd : null
    const costVND = costUSD !== null ? costUSD * fx_usd_vnd : null
    return {
      wmproductId:      p.vendor_product_id,
      productId:        buildSkuUS(config.productCodePrefix, p),
      "product name":   p.product_name,
      region:           p.region,
      type:             p.sim_type,
      "cost price (NT)": p.cogs ?? "",
      "cost price (USD)": costUSD !== null ? Math.round(costUSD * 10000) / 10000 : "",
      "cost price (VND)": costVND !== null ? Math.round(costVND) : "",
    }
  })
  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows)
  XLSX.utils.book_append_sheet(wb, ws1, "Danh sách sản phẩm")

  // ── Sheet 2: Cấu trúc & cogs ─────────────────────────────────────────────
  const sheet2Data = [
    ["Mô tả", config.cogsDescription ?? ""],
    ["Công thức", config.cogsFormula ?? ""],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data)
  XLSX.utils.book_append_sheet(wb, ws2, "Cấu trúc & cogs")

  // ── Sheet 3: Template_SKU_US ─────────────────────────────────────────────
  const skuUsCols = [
    "tenant","productCode","dataAmount","dataAmountUnit","dayAmount","dayAmountUnit",
    "nameVn","nameEn","frameSku","datapackSku","latestCogs","latestCogsCurrency",
    "throttleSpeed","call","callSmsDetails","expirations","vendorSku","vendorSkuSim","SKU",
  ]
  const sheet3Rows = products.map(p => {
    const costUSD  = p.cogs ? p.cogs * fx_twd_usd : null
    const skuUS    = buildSkuUS(config.productCodePrefix, p)
    const dataAmt  = p.is_unlimited ? 9999 : (p.data_amount ?? "")
    const dataUnit = p.is_unlimited ? "GB" : (p.data_unit ?? "GB")
    return {
      tenant:              "US",
      productCode:         skuUS,
      dataAmount:          dataAmt,
      dataAmountUnit:      dataUnit,
      dayAmount:           p.days,
      dayAmountUnit:       "Day",
      nameVn:              buildNameVn(p, config),
      nameEn:              buildNameEn(p, config),
      frameSku:            "",
      datapackSku:         "",
      latestCogs:          costUSD !== null ? Math.round(costUSD * 10000) / 10000 : "",
      latestCogsCurrency:  "USD",
      throttleSpeed:       p.is_unlimited ? "128 kbps" : "",
      call:                config.call,
      callSmsDetails:      "",
      expirations:         config.expirationDays,
      vendorSku:           p.vendor_product_id,
      vendorSkuSim:        "",
      SKU:                 skuUS,
    }
  })
  const ws3 = XLSX.utils.json_to_sheet(sheet3Rows, { header: skuUsCols })
  XLSX.utils.book_append_sheet(wb, ws3, "Template_SKU_US")

  // ── Sheet 4: Template_SKU_VN ─────────────────────────────────────────────
  const sheet4Rows = products.map(p => {
    const costUSD  = p.cogs ? p.cogs * fx_twd_usd : null
    const costVND  = costUSD !== null ? Math.round(costUSD * fx_usd_vnd) : null
    const skuUS    = buildSkuUS(config.productCodePrefix, p)
    const skuVN    = buildSkuVN(config.productCodePrefix, p)
    const dataAmt  = p.is_unlimited ? 9999 : (p.data_amount ?? "")
    const dataUnit = p.is_unlimited ? "GB" : (p.data_unit ?? "GB")
    return {
      tenant:              "VN",
      productCode:         skuVN,
      dataAmount:          dataAmt,
      dataAmountUnit:      dataUnit,
      dayAmount:           p.days,
      dayAmountUnit:       "Day",
      nameVn:              buildNameVn(p, config),
      nameEn:              buildNameEn(p, config),
      frameSku:            "",
      datapackSku:         "",
      latestCogs:          costVND !== null ? costVND : "",
      latestCogsCurrency:  "VND",
      throttleSpeed:       p.is_unlimited ? "128 kbps" : "",
      call:                config.call,
      callSmsDetails:      "",
      expirations:         config.expirationDays,
      vendorSku:           skuUS,
      vendorSkuSim:        "",
      SKU:                 skuVN,
    }
  })
  const ws4 = XLSX.utils.json_to_sheet(sheet4Rows, { header: skuUsCols })
  XLSX.utils.book_append_sheet(wb, ws4, "Template_SKU_VN")

  // ── Sheet 5: Template_Product_US ─────────────────────────────────────────
  const productCols = [
    "tenant","sourceType","productType","supportCountryCode","supportedCountries",
    "vendorCode","dataPolicyCode","typeOfSim","operatorCode","purchaseType","skuType",
    "dataType","baseSimEsimSkuCode","importType","dailyResetTime","activationTime",
    "networkType","apnOriginal","apn","onsiteCarrier","localPhoneNumber","localNumberCountry",
    "hotspot","kycCode","kycNeeded","kycLinks","topUpOptions","activation","unsupportedApps",
    "telcoPerks","note","dataPlanType",
  ]
  const sheet5Rows = products.map(p => {
    const skuUS = buildSkuUS(config.productCodePrefix, p)
    return {
      tenant:             "US",
      sourceType:         config.sourceType,
      productType:        config.productType,
      supportCountryCode: config.supportCountryCode,
      supportedCountries: config.isoCodes,
      vendorCode:         config.vendorCode,
      dataPolicyCode:     config.dataPolicyCode,
      typeOfSim:          p.sim_type,
      operatorCode:       config.operatorCode,
      purchaseType:       "",
      skuType:            "",
      dataType:           p.is_unlimited ? "Unlimited" : "Fixed",
      baseSimEsimSkuCode: skuUS,
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
      kycCode:            "",
      kycNeeded:          config.kycNeeded,
      kycLinks:           "",
      topUpOptions:       "",
      activation:         "",
      unsupportedApps:    "",
      telcoPerks:         "",
      note:               "",
      dataPlanType:       p.is_unlimited ? "Unlimited" : "Fixed",
    }
  })
  const ws5 = XLSX.utils.json_to_sheet(sheet5Rows, { header: productCols })
  XLSX.utils.book_append_sheet(wb, ws5, "Template_Product_US")

  // ── Sheet 6: Template_Product_VN ─────────────────────────────────────────
  const sheet6Rows = products.map(p => {
    const skuVN = buildSkuVN(config.productCodePrefix, p)
    return {
      tenant:             "VN",
      sourceType:         config.sourceType,
      productType:        config.productType,
      supportCountryCode: config.supportCountryCode,
      supportedCountries: config.isoCodes,
      vendorCode:         config.vendorCode,
      dataPolicyCode:     config.dataPolicyCode,
      typeOfSim:          p.sim_type,
      operatorCode:       config.operatorCode,
      purchaseType:       "",
      skuType:            "",
      dataType:           p.is_unlimited ? "Unlimited" : "Fixed",
      baseSimEsimSkuCode: skuVN,
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
      kycCode:            "",
      kycNeeded:          config.kycNeeded,
      kycLinks:           "",
      topUpOptions:       "",
      activation:         "",
      unsupportedApps:    "",
      telcoPerks:         "",
      note:               "",
      dataPlanType:       p.is_unlimited ? "Unlimited" : "Fixed",
    }
  })
  const ws6 = XLSX.utils.json_to_sheet(sheet6Rows, { header: productCols })
  XLSX.utils.book_append_sheet(wb, ws6, "Template_Product_VN")

  // ── Write and return ─────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template_${date}.xlsx"`,
    },
  })
}
