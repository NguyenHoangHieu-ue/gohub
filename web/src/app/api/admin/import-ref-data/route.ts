import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"
import * as XLSX from "xlsx"

const WRITE_ROLES = ["admin", "creator"]

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
  return null
}

function detectTable(filename: string, headers: string[]): string {
  const fn = filename.toLowerCase()
  if (fn.includes("vendors"))            return "ref_vendors"
  if (fn.includes("support-countries"))  return "ref_support_countries"
  if (fn.includes("categories"))         return "ref_categories"
  if (fn.includes("countries"))          return "ref_countries"
  // fallback: detect from headers
  if (headers.includes("Vendor Code") || headers.includes("vendor_code")) return "ref_vendors"
  if (headers.includes("supportCountry") || headers.includes("support_country")) return "ref_support_countries"
  if (headers.includes("nameVn") || headers.includes("name_vn")) return "ref_countries"
  if (headers.includes("type") || headers.includes("region_type")) return "ref_categories"
  return ""
}

function getPK(table: string): string {
  if (table === "ref_vendors")    return "vendor_code"
  if (table === "ref_categories") return "category_code"
  return "code"
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "settings", WRITE_ROLES)))
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
    return NextResponse.json({ error: `Không nhận ra loại file. Tên file phải chứa: countries / support-countries / vendors / categories` }, { status: 400 })

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
