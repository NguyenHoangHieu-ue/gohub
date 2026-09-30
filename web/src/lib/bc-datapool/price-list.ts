import * as XLSX from "xlsx"
import type { Pool, PoolPriceList, PriceList, PriceRow } from "./types"

const SHEET_POOL: Record<string, Pool> = { cmhk: "CMHK", singtel: "SINGTEL" }
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): PoolPriceList {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })
  const header = rows[0] ?? []
  const priceHeader = String(header[3] ?? "")
  const cur = /\(\s*(HKD|USD)\s*\/\s*GB\s*\)/i.exec(priceHeader)?.[1]?.toUpperCase()
  if (cur !== "HKD" && cur !== "USD")
    throw new Error(`Sheet "${sheetName}": cột D phải có dạng "Price(HKD/GB)" hoặc "Price(USD/GB)", đang là "${priceHeader}"`)

  const out: PriceRow[] = []
  for (const r of rows.slice(1)) {
    const coverage = String(r[0] ?? "").trim()
    const operator = String(r[1] ?? "").trim()
    const price = num(r[3])
    if (!coverage || !operator || !(price > 0)) continue
    out.push({ coverage, operator, plmn: String(r[2] ?? "").trim(), pricePerGb: price, kyc: /kyc/i.test(String(r[4] ?? "")) })
  }
  if (!out.length) throw new Error(`Sheet "${sheetName}": không có dòng giá nào`)

  // Phí chỉ nằm ở dòng dữ liệu đầu tiên: F = IMSI/tháng, G = phí eSIM (CNY), H = thẻ SIM đơn (CNY)
  const first = rows[1] ?? []
  const imsiFee = num(first[5]), esimFeeCny = num(first[6]), simFeeCny = num(first[7])
  if (!(imsiFee > 0) || !(esimFeeCny > 0))
    throw new Error(`Sheet "${sheetName}": thiếu phí IMSI (cột F) hoặc phí eSIM (cột G) ở dòng dữ liệu đầu tiên`)
  return { currency: cur, rows: out, imsiFee, esimFeeCny, simFeeCny }
}

/** Đọc file báo giá BC Datapool: mỗi pool 1 sheet tên "cmhk" / "Singtel". */
export function parsePriceList(buf: ArrayBuffer | Buffer, fileName: string): PriceList {
  const wb = XLSX.read(buf, { type: "buffer" })
  const pools: Partial<Record<Pool, PoolPriceList>> = {}
  for (const name of wb.SheetNames) {
    const pool = SHEET_POOL[name.trim().toLowerCase()]
    if (pool) pools[pool] = parseSheet(wb.Sheets[name], name)
  }
  if (!pools.CMHK || !pools.SINGTEL)
    throw new Error(`Thiếu sheet: cần đủ "cmhk" và "Singtel" (file có: ${wb.SheetNames.join(", ")})`)
  return { fileName, uploadedAt: new Date().toISOString(), pools: pools as Record<Pool, PoolPriceList> }
}
