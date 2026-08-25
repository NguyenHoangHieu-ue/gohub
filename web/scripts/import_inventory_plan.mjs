/**
 * Import 1 lần "Plan nhập hàng theo tháng.xlsx" (Ops) vào inventory_plan_skus / inventory_plan_weekly /
 * inventory_po (Supabase) — seed dữ liệu ban đầu cho tab Inventory mới.
 *
 * Chạy trên máy có web/.env.local (cần NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY):
 *   cd web && node scripts/import_inventory_plan.mjs "D:\gohub\Plan nhập hàng theo tháng.xlsx"
 *
 * Sheet "Plan VN"/"Plan US": mỗi SKU 5 dòng (Tồn thực tế / Đầu tuần / Bán dự kiến / Số nhập / Cuối tuần),
 *   cột tuần bắt đầu từ vị trí "as of" date ở hàng 0. Đầu tuần/Cuối tuần KHÔNG import (tính lại server-side).
 *   Ô nào Ops đã điền số ở Bán dự kiến/Số nhập → import kèm *_auto=false (giữ nguyên, không bị auto-suggest
 *   ghi đè khi mở tab).
 * Sheet "PO Dự kiến nhập": map thẳng cột → inventory_po.
 */
import path from "node:path"
import fs from "node:fs"
import XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

const filePath = process.argv[2]
if (!filePath) {
  console.error("Usage: node scripts/import_inventory_plan.mjs <path-to-xlsx>")
  process.exit(1)
}

const envCandidates = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "../.env.local")]
const envPath = envCandidates.find(p => fs.existsSync(p))
if (envPath) dotenv.config({ path: envPath })

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SB_URL || !SB_KEY) {
  console.error("Thiếu env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY (chạy trong web/ có .env.local)")
  process.exit(1)
}
const sb = createClient(SB_URL, SB_KEY)

const num = v => { const n = Number(String(v ?? "").replace(/,/g, "").trim()); return Number.isFinite(n) && String(v).trim() !== "" ? n : null }

// "MM/DD/YYYY" -> "YYYY-MM-DD"
function parseUsDate(v) {
  const s = String(v ?? "").trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
}

function inferCompany(sku) {
  const c0 = (sku || "")[0]
  if (!c0) return null
  if (/[1-6]/.test(c0)) return "VN"
  if (/[A-E]/.test(c0)) return "US"
  return null
}

async function upsertChunks(table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await sb.from(table).upsert(chunk, { onConflict })
    if (error) console.error(`  ✗ ${table} chunk ${i}-${i + chunk.length}:`, error.message)
  }
}

async function importPlanSheet(wb, sheetName, companyDefault) {
  const ws = wb.Sheets[sheetName]
  if (!ws) { console.log(`(bỏ qua — không có sheet "${sheetName}")`); return }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })

  // Mốc "as of" nằm ở hàng 0 — cột đầu tiên có giá trị dạng ngày sau 3 cột đầu (SKU/loại/label).
  const anchorRaw = rows[0]?.slice(3).find(v => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v)))
  const anchorYmd = parseUsDate(anchorRaw)
  if (!anchorYmd) { console.log(`(bỏ qua "${sheetName}" — không tìm được mốc ngày ở hàng 0)`); return }
  const anchor = new Date(anchorYmd + "T00:00:00Z")

  const skuRows = []
  const weeklyRows = []

  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.[2] !== "Số tồn thực tế") continue
    const sku = String(rows[i][0] || "").trim()
    if (!sku) continue
    const rActual = rows[i]
    const rSales  = rows[i + 2] // "Số bán trong tuần (dự kiến)"
    const rImport = rows[i + 3] // "Số nhập"
    if (rSales?.[2] !== "Số bán trong tuần (dự kiến)" || rImport?.[2] !== "Số nhập") {
      console.warn(`  ! block lệch hàng cho SKU ${sku} ở dòng ${i}, bỏ qua`)
      continue
    }

    const company = inferCompany(sku) || companyDefault
    skuRows.push({ sku_code: sku, company_code: company })

    for (let c = 3; c < rActual.length; c++) {
      const wDate = new Date(anchor.getTime() + (c - 3) * 7 * 86400_000)
      const weekStart = wDate.toISOString().slice(0, 10)
      const actual = num(rActual[c])
      const sales  = num(rSales[c])
      const imp    = num(rImport[c])
      if (actual == null && sales == null && imp == null) continue
      weeklyRows.push({
        sku_code: sku,
        week_start_date: weekStart,
        actual_stock: actual,
        sales_forecast: sales,
        sales_forecast_auto: sales == null,
        import_qty: imp,
        import_qty_auto: imp == null,
        updated_by: "import_inventory_plan",
      })
    }
  }

  console.log(`  ${sheetName}: ${skuRows.length} SKU, ${weeklyRows.length} dòng tuần`)
  await upsertChunks("inventory_plan_skus", skuRows, "sku_code")
  await upsertChunks("inventory_plan_weekly", weeklyRows, "sku_code,week_start_date")
}

async function importPoSheet(wb) {
  const ws = wb.Sheets["PO Dự kiến nhập"]
  if (!ws) { console.log("(bỏ qua — không có sheet PO Dự kiến nhập)"); return }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })

  const poRows = []
  for (let i = 1; i < rows.length; i++) { // hàng 0 = header
    const r = rows[i]
    const vendor = String(r[0] || "").trim()
    const sku = String(r[2] || "").trim()
    if (!vendor || !sku) continue
    poRows.push({
      vendor, sku_code: sku, qty: num(r[3]) ?? 0, company_code: inferCompany(sku),
      expected_stockout_date: parseUsDate(r[4]),
      need_by_date: parseUsDate(r[5]),
      payment_deadline: parseUsDate(r[6]),
      expected_arrival_date: parseUsDate(r[7]),
      payment_status: String(r[8] || "Chưa thanh toán").trim() || "Chưa thanh toán",
      payment_date: parseUsDate(r[9]),
      delivery_status: String(r[10] || "Chờ thanh toán").trim() || "Chờ thanh toán",
      expected_arrival_week: String(r[11] || "").trim() || null,
      created_by: "import_inventory_plan",
      updated_by: "import_inventory_plan",
    })
  }
  console.log(`  PO Dự kiến nhập: ${poRows.length} dòng`)
  // Không có unique key tự nhiên trong sheet gốc → insert thẳng (bảng mới, chạy 1 lần).
  for (let i = 0; i < poRows.length; i += 200) {
    const chunk = poRows.slice(i, i + 200)
    const { error } = await sb.from("inventory_po").insert(chunk)
    if (error) console.error(`  ✗ inventory_po chunk ${i}:`, error.message)
  }
}

const wb = XLSX.readFile(filePath)
console.log("Import từ:", filePath)
await importPlanSheet(wb, "Plan VN", "VN")
await importPlanSheet(wb, "Plan US", "US")
await importPoSheet(wb)
console.log("Xong.")
