import * as XLSX from "xlsx"
import type { Assumptions, Fx } from "@/lib/bc-datapool/types"
import { SHEET_NAMES, withHeaders, type Frames, type ThkBuildResult } from "./builder"

export const CALC_SHEET = "Tính giá"

// Ô tham số (cột Q:R của sheet Tính giá)
const P = { hkd: "$R$2", vnd: "$R$3", fixed: "$R$4", daily: "$R$5", unl: "$R$6", esim: "$R$7", simUs: "$R$8", simVn: "$R$9" } as const
const CALC_HEADERS = ["Loại", "SKU US", "SKU VN", "Loại gói", "Data", "Đơn vị", "Ngày", "Giá/GB (HKD)", "Nước/nhà mạng", "Data (HKD)", "Data (USD)", "Phí khung (USD)", "COGS US (USD)", "COGS VN (VND)"]

type Cell = XLSX.CellObject
const num = (v: number, f?: string): Cell => (f ? { t: "n", v, f } : { t: "n", v })
const str = (v: string): Cell => ({ t: "s", v })

/**
 * File xuất: 4 sheet đúng template + sheet "Tính giá". Ô latestCogs ở SKU US/VN là CÔNG THỨC (ROUNDUP) trỏ về sheet "Tính giá",
 * nơi từng bước đều là công thức dùng chung ô tham số (tỷ giá, %, giá khung) — sửa tham số là giá tự đổi để đối chiếu.
 */
export function buildWorkbook(result: ThkBuildResult, ctx: { fx: Fx; a: Assumptions; frames: Frames }): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const calc: XLSX.WorkSheet = {}
  const put = (addr: string, c: Cell) => { calc[addr] = c }
  const { fx, a, frames } = ctx

  put("Q1", str("THAM SỐ (tỷ giá nội bộ + công thức Datapool + giá khung — sửa ở đây, giá tự đổi)"))
  const params: [number, string, number][] = [
    [2, "HKD/USD (Inc)", fx.hkdPerUsd], [3, "VND/USD (JSC — đổi USD→VND)", fx.vndPerUsd], [4, "Fixed % (data thực dùng)", a.fixedPct], [5, "Daily % (data thực dùng)", a.dailyPct],
    [6, "Unlimited 3GB + 10Mbps — GB/ngày", a.unl3gb10], [7, "Khung eSIM AB0003DK00000 (USD)", frames.esimUsUsd ?? 0], [8, "Khung SIM US CD0003DK00000 (USD)", frames.simUsUsd ?? 0], [9, "Khung SIM VN 1D0003DK00000 (VND)", frames.simVnVnd ?? 0],
  ]
  for (const [r, l, v] of params) { put(`Q${r}`, str(l)); put(`R${r}`, num(v)) }

  CALC_HEADERS.forEach((h, i) => put(XLSX.utils.encode_cell({ r: 0, c: i }), str(h)))
  result.costRows.forEach((c, i) => {
    const r = i + 2
    const gb = `IF(F${r}="MB",E${r}/1024,E${r})`
    const dataF = c.kind === "Daily" ? `ROUNDUP(H${r}*${gb}*G${r}*${P.daily},2)` : c.kind === "Fixed" ? `ROUNDUP(H${r}*${gb}*${P.fixed},2)` : `ROUNDUP(H${r}*${P.unl}*G${r},2)`
    const feeRef = c.typeChar === "C" ? P.esim : c.typeChar === "E" ? P.simUs : null
    put(`A${r}`, str(c.type)); put(`B${r}`, str(c.skuUS)); put(`C${r}`, str(c.skuVN)); put(`D${r}`, str(c.policy === "X" ? "Unlimited 10Mbps" : c.kind))
    put(`E${r}`, num(c.dataAmount)); put(`F${r}`, str(c.unit)); put(`G${r}`, num(c.days)); put(`H${r}`, num(c.pricePerGbHkd)); put(`I${r}`, str(c.network))
    put(`J${r}`, num(c.dataPool, dataF))
    put(`K${r}`, num(c.dataUsd, `ROUNDUP(J${r}/${P.hkd},2)`))
    put(`L${r}`, feeRef ? num(c.feeUsd, feeRef) : num(0))
    put(`M${r}`, num(c.cogsUsd, `ROUNDUP(K${r}+L${r},2)`))
    put(`N${r}`, num(c.cogsVnd, c.typeChar === "C" ? `ROUNDUP(M${r}*${P.vnd},0)` : c.typeChar === "E" ? `ROUNDUP(K${r}*${P.vnd},0)+${P.simVn}` : `ROUNDUP(K${r}*${P.vnd},0)`))
  })
  calc["!ref"] = `A1:R${Math.max(result.costRows.length + 1, 10)}`
  calc["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 12 }, { wch: 28 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 15 }, { wch: 2 }, { wch: 2 }, { wch: 52 }, { wch: 12 }]

  const link = (ws: XLSX.WorkSheet, costIdx: number[], col: "M" | "N") => costIdx.forEach((ci, i) => {
    const addr = `K${i + 2}`
    const cur = ws[addr] as Cell
    ws[addr] = { t: "n", v: Number(cur.v), f: `'${CALC_SHEET}'!${col}${ci + 2}` }
  })
  for (const [name, rows] of Object.entries(withHeaders(result.sheets))) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (name === SHEET_NAMES.skuUS) link(ws, result.usCost, "M")
    if (name === SHEET_NAMES.skuVN) link(ws, result.vnCost, "N")
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.utils.book_append_sheet(wb, calc, CALC_SHEET)
  return wb
}
