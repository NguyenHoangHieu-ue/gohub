import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import * as XLSX from "xlsx"

// Mapping Excel header → DB column name cho từng bảng
function mapRow(row: Record<string, any>, table: string): Record<string, any> | null {
  if (table === "ref_vendors") {
    const code = (row["Vendor Code"] || row["vendor_code"] || "").toString().trim()
    if (!code) return null
    return {
      vendor_code:  code,
      name:         (row["Name"] || row["name"] || "").toString().trim(),
      description:  row["Description"] || row["description"] || null,
    }
  }
  if (table === "ref_support_countries") {
    const code = (row["code"] || "").toString().trim()
    if (!code) return null
    return {
      code,
      name:               (row["name"] || code).toString().trim(),
      support_country:    row["supportCountry"]   || row["support_country"]    || null,
      support_country_vn: row["supportCountryVn"] || row["support_country_vn"] || null,
      country_codes:      row["countryCodes"]      || row["country_codes"]      || null,
    }
  }
  if (table === "ref_countries") {
    const code = (row["code"] || "").toString().trim()
    if (!code) return null
    return {
      code,
      name:    (row["name"] || "").toString().trim(),
      name_vn: row["nameVn"] || row["name_vn"] || null,
    }
  }
  if (table === "ref_categories") {
    const catCode = (row["code"] || row["category_code"] || "").toString().trim()
    if (!catCode) return null
    return {
      category_code: catCode,
      name_en:       (row["name"] || row["name_en"] || "").toString().trim(),
      region_type:   row["type"] || row["region_type"] || null,
      notes:         row["description"] || row["notes"] || null,
    }
  }
  if (table === "pm_operators") {
    const code = (row["code"] || row["operator_code"] || "").toString().trim()
    if (!code) return null
    return {
      code,
      name:           (row["name"] || "").toString().trim(),
      description:    row["description"] || null,
      image_url:      row["image_url"] || row["imageUrl"] || null,
      country:        row["country"] || null,
      category_codes: row["category_codes"] || row["categoryCodes"] || null,
    }
  }
  if (table === "pm_price_lists") {
    const code = (row["code"] || "").toString().trim()
    if (!code) return null
    return {
      code,
      type:         row["type"] || null,
      tenant:       row["tenant"] || null,
      channel:      row["channel"] || null,
      channel_code: row["channel_code"] || row["channelCode"] || null,
      label:        row["label"] || null,
      description:  row["description"] || null,
      listing_type: row["listing_type"] || row["listingType"] || null,
      sort_order:   row["sort_order"] != null ? Number(row["sort_order"]) : null,
      is_active:    row["is_active"] != null ? Boolean(row["is_active"]) : true,
    }
  }
  if (table === "sku_vat") {
    const skuCode = (row["sku_code"] || row["skuCode"] || "").toString().trim()
    if (!skuCode) return null
    return {
      sku_code:       skuCode,
      vendor_code:    row["vendor_code"] || row["vendorCode"] || null,
      product_code:   row["product_code"] || row["productCode"] || null,
      product_type:   row["product_type"] || row["productType"] || null,
      vat_status:     row["vat_status"] || row["vatStatus"] || "No",
      name_vn:        row["name_vn"] || row["nameVn"] || null,
      vat_unit:       row["vat_unit"] || row["vatUnit"] || null,
      vat_price:      row["vat_price"] != null ? Number(row["vat_price"]) : null,
      vat_tax_rate:   row["vat_tax_rate"] || row["vatTaxRate"] || null,
    }
  }
  return null
}

function detectTable(filename: string, headers: string[]): string {
  const fn = filename.toLowerCase()
  if (fn.includes("operators"))          return "pm_operators"
  if (fn.includes("price-lists") || fn.includes("pricelists")) return "pm_price_lists"
  if (fn.includes("sku-vat") || fn.includes("skuvat"))         return "sku_vat"
  if (fn.includes("vendors"))            return "ref_vendors"
  if (fn.includes("support-countries"))  return "ref_support_countries"
  if (fn.includes("categories"))         return "ref_categories"
  if (fn.includes("countries"))          return "ref_countries"
  // fallback: detect from headers
  if (headers.includes("operator_code") || (headers.includes("code") && headers.includes("country") && headers.includes("category_codes"))) return "pm_operators"
  if (headers.includes("listing_type") || headers.includes("channel_code")) return "pm_price_lists"
  if (headers.includes("sku_code") && headers.includes("vat_status")) return "sku_vat"
  if (headers.includes("Vendor Code") || headers.includes("vendor_code")) return "ref_vendors"
  if (headers.includes("supportCountry") || headers.includes("support_country")) return "ref_support_countries"
  if (headers.includes("nameVn") || headers.includes("name_vn")) return "ref_countries"
  if (headers.includes("type") || headers.includes("region_type")) return "ref_categories"
  return ""
}

function getPK(table: string): string {
  if (table === "ref_vendors")    return "vendor_code"
  if (table === "ref_categories") return "category_code"
  if (table === "sku_vat")        return "sku_code"
  return "code"
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Không có file" }, { status: 400 })
  if (!file.name.endsWith(".xlsx"))
    return NextResponse.json({ error: "Chỉ hỗ trợ file .xlsx" }, { status: 400 })
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "File quá lớn (tối đa 5MB)" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return NextResponse.json({ error: "File trống" }, { status: 400 })

  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null })
  if (!raw.length) return NextResponse.json({ error: "Sheet không có dữ liệu" }, { status: 400 })

  const headers = Object.keys(raw[0])
  const table = detectTable(file.name, headers)
  if (!table)
    return NextResponse.json({ error: `Không nhận ra loại file. Tên file phải chứa: countries / support-countries / vendors / categories / operators / price-lists / sku-vat` }, { status: 400 })

  const mapped = raw.map(r => mapRow(r, table)).filter(Boolean) as Record<string, any>[]
  if (!mapped.length)
    return NextResponse.json({ error: "Không có dòng hợp lệ để import" }, { status: 400 })

  // Upsert batch (tối đa 500/lần)
  const BATCH = 500
  let upserted = 0
  const errors: string[] = []
  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH)
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(batch, { onConflict: getPK(table) })
    if (error) errors.push(error.message)
    else upserted += batch.length
  }

  if (errors.length)
    return NextResponse.json({ ok: false, table, upserted, errors }, { status: 500 })

  return NextResponse.json({
    ok: true,
    table,
    filename: file.name,
    total: raw.length,
    upserted,
  })
}
