import * as XLSX from "xlsx"
import { SHEET_NAMES, withHeaders, type BuildResult } from "./builder"
import { frameFeeUsd } from "./pricing"
import type { Assumptions, Fx, Pool, PriceList } from "./types"

/** Tên sheet công thức — các ô latestCogs ở sheet SKU trỏ về đây để người dùng soát lại cách tính giá. */
export const CALC_SHEET = "Tính giá"

// Ô tham số (cột S:T của sheet Tính giá)
const P = { hkd: "$T$2", cny: "$T$3", vnd: "$T$4", fixed: "$T$5", daily: "$T$6", white: "$T$8", vndInc: "$T$9" } as const
const UNL_CELL = { unl3gb10: "$T$7" } as const
const FEE_CELL = {
  "esim:CMHK": "$T$15", "esim:SINGTEL": "$T$16", "sim:CMHK": "$T$17", "sim:SINGTEL": "$T$18",
} as const

const CALC_HEADERS = ["Loại", "SKU US", "SKU VN", "ProductID", "Pool", "Nhà mạng áp dụng", "Loại gói", "Data", "Đơn vị", "Ngày", "Giá/GB (tiền pool)", "Tiền tệ pool",
  "Data (tiền pool)", "Data (USD)", "Phí khung (USD)", "COGS US (USD)", "COGS VN (VND)"]

type Cell = XLSX.CellObject

const num = (v: number, f?: string): Cell => (f ? { t: "n", v, f } : { t: "n", v })
const str = (v: string): Cell => ({ t: "s", v })

/**
 * File xuất: 4 sheet đúng template + sheet "Tính giá". Mọi ô có giá (latestCogs ở SKU US/VN) là CÔNG THỨC (chỉ dùng ROUNDUP, không ROUND)
 * (kèm giá trị đã tính sẵn) trỏ về sheet "Tính giá", nơi từng bước tính đều là công thức Excel dùng chung ô tham số
 * (tỷ giá, %, phí IMSI/eSIM, giá SIM trắng) — sửa tham số là giá tự đổi để đối chiếu.
 */
export function buildWorkbook(result: BuildResult, ctx: { fx: Fx; a: Assumptions; list: PriceList; whiteSimVnd: number | null }): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const sheets = withHeaders(result.sheets)
  const calc: XLSX.WorkSheet = {}
  const at = (col: string, row: number) => `${col}${row}`
  const put = (addr: string, c: Cell) => { calc[addr] = c }

  // ── Khối tham số ──
  const white = ctx.whiteSimVnd ?? 0
  const pl = ctx.list.pools
  put("S1", str("THAM SỐ (tỷ giá nội bộ + bảng báo giá — sửa ở đây, giá tự đổi)"))
  const params: [number, string, number][] = [
    [2, "HKD/USD (Inc)", ctx.fx.hkdPerUsd], [3, "CNY/USD (Inc)", ctx.fx.cnyPerUsd], [4, "VND/USD (JSC — đổi USD→VND)", ctx.fx.vndPerUsd],
    [5, "Fixed % (data thực dùng)", ctx.a.fixedPct], [6, "Daily % (data thực dùng)", ctx.a.dailyPct], [7, "Unlimited 3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps — GB/ngày", ctx.a.unl3gb10],
    [8, "Giá SIM trắng (VND, từ hệ thống)", white], [9, "VND/USD (Inc — đổi VND→USD)", ctx.fx.vndPerUsdInc],
    [10, "CMHK — phí IMSI (HKD)", pl.CMHK.imsiFee], [11, "CMHK — phí eSIM (CNY)", pl.CMHK.esimFeeCny],
    [12, "Singtel — phí IMSI (USD)", pl.SINGTEL.imsiFee], [13, "Singtel — phí eSIM (CNY)", pl.SINGTEL.esimFeeCny],
  ]
  for (const [r, l, v] of params) { put(at("S", r), str(l)); put(at("T", r), num(v)) }
  const fee = (sim: "eSIM" | "SIM", pool: Pool) => frameFeeUsd(sim, pl[pool], ctx.fx, white)
  put("S15", str("Phí khung eSIM CMHK (USD) = eSIM CNY/CNY-USD + IMSI HKD/HKD-USD"));  put("T15", num(fee("eSIM", "CMHK"), "ROUNDUP(T11/$T$3+T10/$T$2,2)"))
  put("S16", str("Phí khung eSIM Singtel (USD) = eSIM CNY/CNY-USD + IMSI USD"));        put("T16", num(fee("eSIM", "SINGTEL"), "ROUNDUP(T13/$T$3+T12,2)"))
  put("S17", str("Phí khung SIM CMHK (USD) = giá SIM trắng/VND-USD(Inc) + IMSI HKD/HKD-USD")); put("T17", num(fee("SIM", "CMHK"), "ROUNDUP($T$8/$T$9+T10/$T$2,2)"))
  put("S18", str("Phí khung SIM Singtel (USD) = giá SIM trắng/VND-USD(Inc) + IMSI USD"));    put("T18", num(fee("SIM", "SINGTEL"), "ROUNDUP($T$8/$T$9+T12,2)"))

  // ── Bảng tính giá: 1 dòng / SKU ──
  CALC_HEADERS.forEach((h, i) => put(XLSX.utils.encode_cell({ r: 0, c: i }), str(h)))
  result.costRows.forEach((c, i) => {
    const r = i + 2
    const gb = `IF(I${r}="MB",H${r}/1024,H${r})`
    const dataF = c.kind === "Daily" ? `ROUNDUP(K${r}*${gb}*J${r}*${P.daily},2)`
      : c.kind === "Fixed" ? `ROUNDUP(K${r}*${gb}*${P.fixed},2)`
      : `ROUNDUP(K${r}*${UNL_CELL[c.unlKey ?? "unl3gb10"]}*J${r},2)`   // ô hệ số theo (dung lượng tốc độ cao, tốc độ Unlimited)
    put(at("A", r), str(c.type)); put(at("B", r), str(c.skuUS)); put(at("C", r), str(c.skuVN)); put(at("D", r), str(c.productId))
    put(at("E", r), str(c.pool)); put(at("F", r), str(c.operator)); put(at("G", r), str(c.kind === "Unlimited" ? `Unlimited ${c.speedMbps}Mbps` : c.kind))
    put(at("H", r), num(c.dataAmount)); put(at("I", r), str(c.unit)); put(at("J", r), num(c.days))
    put(at("K", r), num(c.pricePerGb)); put(at("L", r), str(c.currency))
    put(at("M", r), num(c.dataPool, dataF))
    put(at("N", r), num(c.dataUsd, `IF(L${r}="HKD",ROUNDUP(M${r}/${P.hkd},2),M${r})`))
    put(at("O", r), c.feeKind === "none" ? num(0) : num(c.feeUsd, FEE_CELL[`${c.feeKind}:${c.poolKey}`]))
    put(at("P", r), num(c.cogsUsd, `ROUNDUP(N${r}+O${r},2)`))
    put(at("Q", r), num(c.cogsVnd, `ROUNDUP(P${r}*${P.vnd},0)`))
  })
  calc["!ref"] = `A1:T${Math.max(result.costRows.length + 1, 18)}`
  calc["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 9 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 7 }, { wch: 6 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 2 }, { wch: 2 }, { wch: 60 }, { wch: 12 }]

  // ── 4 sheet template; ô latestCogs (cột K) = công thức trỏ sheet Tính giá ──
  const link = (ws: XLSX.WorkSheet, costIdx: number[], col: "P" | "Q") => costIdx.forEach((ci, i) => {
    const addr = `K${i + 2}`
    const cur = ws[addr] as Cell
    ws[addr] = { t: "n", v: Number(cur.v), f: `'${CALC_SHEET}'!${col}${ci + 2}` }
  })
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (name === SHEET_NAMES.skuUS) link(ws, result.usCost, "P")
    if (name === SHEET_NAMES.skuVN) link(ws, result.vnCost, "Q")
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.utils.book_append_sheet(wb, calc, CALC_SHEET)
  return wb
}
