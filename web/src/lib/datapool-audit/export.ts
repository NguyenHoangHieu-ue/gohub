import * as XLSX from "xlsx"
import { levelsOf, customUnlimitedLabel } from "@/lib/datapool-formula"
import type { AuditCtx, AuditRow } from "./engine"
import { VENDOR_LABEL } from "./engine"

// File "Soát giá vốn": mỗi SKU 1 dòng, từng bước tính là CÔNG THỨC Excel (ROUNDUP) dùng chung sheet "Tham số" — sửa tham số là giá tính lại đổi theo,
// kèm giá hệ thống, chênh lệch và kết luận. Sheet "Cập nhật latestCogs" chỉ liệt kê SKU lệch với giá tính lại (công thức trỏ sheet soát) để đem đi cập nhật.
export const PARAM_SHEET = "Tham số"
export const AUDIT_SHEET = "Soát giá vốn"
export const UPDATE_SHEET = "Cập nhật latestCogs"
const LEVEL_ROW0 = 18
const P = (row: number) => `'${PARAM_SHEET}'!$B$${row}`
const R = { hkd: 2, cny: 3, vndJsc: 4, vndInc: 5, fixed: 6, daily: 7, esim3hk: 8, simUs3hk: 9, simVn3hk: 10, white: 11, cmhkImsi: 12, cmhkEsimCny: 13, stImsi: 14, stEsimCny: 15 } as const

type Cell = XLSX.CellObject
const num = (v: number, f?: string, z?: string): Cell => ({ t: "n", v, ...(f ? { f } : {}), ...(z ? { z } : {}) })
const str = (v: string): Cell => ({ t: "s", v })

const HEADERS = ["SKU", "Tenant", "Vendor", "Loại", "Gói", "Data", "Đơn vị", "Ngày", "Giá/GB", "Tiền pool", "Hệ số (%/GB-ngày)", "Data (tiền pool)", "Data (USD)", "Phí khung (USD)", "COGS US (USD)", "COGS VN (VND)",
  "Giá mới (tính lại)", "Giá cũ (hệ thống)", "Chênh (mới − cũ)", "Tăng/giảm % (so giá cũ)", "Kết luận", "Ghi chú"]
const VERDICT: Record<string, string> = { match: "Khớp", rounding: "Khớp (chênh do làm tròn)", diff: "LỆCH", nocogs: "Hệ thống chưa có giá", skip: "Không tính lại được" }

export function buildAuditWorkbook(rows: AuditRow[], ctx: AuditCtx): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const pr: XLSX.WorkSheet = {}
  const put = (ws: XLSX.WorkSheet, a: string, c: Cell) => { ws[a] = c }
  put(pr, "A1", str("THAM SỐ (tỷ giá nội bộ + giả định Công Thức Datapool + giá khung + phí pool — sửa ở đây, giá tính lại đổi theo)"))
  const wl = ctx.priceList?.pools
  const params: [number, string, number][] = [
    [R.hkd, "HKD/USD (Inc)", ctx.fx.hkdPerUsd], [R.cny, "CNY/USD (Inc)", ctx.fx.cnyPerUsd], [R.vndJsc, "VND/USD (JSC — đổi USD→VND)", ctx.fx.vndPerUsd], [R.vndInc, "VND/USD (Inc — đổi VND→USD)", ctx.fx.vndPerUsdInc],
    [R.fixed, "Fixed % (data thực dùng)", ctx.a.fixedPct], [R.daily, "Daily % (data thực dùng)", ctx.a.dailyPct],
    [R.esim3hk, "3HK — khung eSIM AB0003DK00000 (USD)", ctx.frames.esimUsUsd ?? 0], [R.simUs3hk, "3HK — khung SIM US CD0003DK00000 (USD)", ctx.frames.simUsUsd ?? 0], [R.simVn3hk, "3HK — khung SIM VN 1D0003DK00000 (VND)", ctx.frames.simVnVnd ?? 0],
    [R.white, "BC — giá SIM trắng (VND, từ hệ thống)", ctx.whiteSimVnd ?? 0],
    [R.cmhkImsi, "BC CMHK — phí IMSI (HKD)", wl?.CMHK.imsiFee ?? 0], [R.cmhkEsimCny, "BC CMHK — phí eSIM (CNY)", wl?.CMHK.esimFeeCny ?? 0],
    [R.stImsi, "BC Singtel — phí IMSI (USD)", wl?.SINGTEL.imsiFee ?? 0], [R.stEsimCny, "BC Singtel — phí eSIM (CNY)", wl?.SINGTEL.esimFeeCny ?? 0],
  ]
  for (const [r, l, v] of params) { put(pr, `A${r}`, str(l)); put(pr, `B${r}`, num(v)) }
  put(pr, `A${LEVEL_ROW0 - 1}`, str("BẢNG MỨC UNLIMITED — GB/ngày tính giá (theo thứ tự bảng mức ở Công Thức Datapool)"))
  const levels = levelsOf(ctx.a)
  levels.forEach((l, i) => { put(pr, `A${LEVEL_ROW0 + i}`, str(customUnlimitedLabel(l))); put(pr, `B${LEVEL_ROW0 + i}`, num(l.gbPerDay)) })
  pr["!ref"] = `A1:B${LEVEL_ROW0 + Math.max(levels.length, 1)}`
  pr["!cols"] = [{ wch: 62 }, { wch: 14 }]

  const ws: XLSX.WorkSheet = {}
  HEADERS.forEach((h, i) => put(ws, XLSX.utils.encode_cell({ r: 0, c: i }), str(h)))
  const usable = rows
  const rowOf = new Map<string, number>()
  usable.forEach((x, i) => {
    const r = i + 2
    rowOf.set(`${x.sku}|${x.tenant}`, r)
    put(ws, `A${r}`, str(x.sku)); put(ws, `B${r}`, str(x.tenant)); put(ws, `C${r}`, str(VENDOR_LABEL[x.vendor])); put(ws, `D${r}`, str(x.type)); put(ws, `E${r}`, str(x.label))
    put(ws, `R${r}`, x.current == null ? str("") : num(x.current)); put(ws, `U${r}`, str(VERDICT[x.verdict] ?? x.verdict)); put(ws, `V${r}`, str(x.note ?? ""))
    const c = x.calc
    if (!c) return
    put(ws, `F${r}`, num(c.amount)); put(ws, `G${r}`, str(c.unit)); put(ws, `H${r}`, num(c.days)); put(ws, `I${r}`, num(c.pricePerGb)); put(ws, `J${r}`, str(c.poolCurrency))
    const gb = `IF(G${r}="MB",F${r}/1024,F${r})`
    const hs = c.kind === "Daily" ? P(R.daily) : c.kind === "Fixed" ? P(R.fixed) : P(LEVEL_ROW0 + (c.unlIdx ?? 0))
    put(ws, `K${r}`, num(c.kind === "Daily" ? ctx.a.dailyPct : c.kind === "Fixed" ? ctx.a.fixedPct : levels[c.unlIdx ?? 0]?.gbPerDay ?? 0, hs))
    put(ws, `L${r}`, num(c.dataPool, c.kind === "Daily" ? `ROUNDUP(I${r}*${gb}*H${r}*K${r},2)` : c.kind === "Fixed" ? `ROUNDUP(I${r}*${gb}*K${r},2)` : `ROUNDUP(I${r}*K${r}*H${r},2)`))
    put(ws, `M${r}`, num(c.dataUsd, `IF(J${r}="HKD",ROUNDUP(L${r}/${P(R.hkd)},2),L${r})`))
    const pool = x.vendor === "BC_CMHK" ? "cmhk" : "st"
    const imsi = x.vendor === "BC_CMHK" ? `${P(R.cmhkImsi)}/${P(R.hkd)}` : P(R.stImsi)
    const feeF = c.feeKind === "none" ? null
      : x.vendor === "3HK" ? (c.feeKind === "esim" ? P(R.esim3hk) : P(R.simUs3hk))
      : c.feeKind === "esim" ? `ROUNDUP(${P(pool === "cmhk" ? R.cmhkEsimCny : R.stEsimCny)}/${P(R.cny)}+${imsi},2)` : `ROUNDUP(${P(R.white)}/${P(R.vndInc)}+${imsi},2)`
    put(ws, `N${r}`, num(c.feeUsd, feeF ?? undefined))
    put(ws, `O${r}`, num(c.cogsUsd, `ROUNDUP(M${r}+N${r},2)`))
    put(ws, `P${r}`, num(c.cogsVnd, x.vendor === "3HK" && x.type === "E" ? `ROUNDUP(M${r}*${P(R.vndJsc)},0)+${P(R.simVn3hk)}` : `ROUNDUP(O${r}*${P(R.vndJsc)},0)`))
    put(ws, `Q${r}`, num(x.expected ?? 0, x.tenant === "US" ? `O${r}` : `P${r}`))
    if (x.current != null) {
      put(ws, `S${r}`, num(x.expected != null ? x.expected - x.current : 0, `Q${r}-R${r}`))
      put(ws, `T${r}`, num(x.current ? (x.expected! - x.current) / x.current : 0, `IF(R${r}=0,0,S${r}/R${r})`, "0.00%"))
    }
  })
  ws["!ref"] = `A1:V${Math.max(usable.length + 1, 2)}`
  ws["!cols"] = [{ wch: 16 }, { wch: 7 }, { wch: 20 }, { wch: 6 }, { wch: 40 }, { wch: 7 }, { wch: 6 }, { wch: 6 }, { wch: 9 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 9 }, { wch: 22 }, { wch: 50 }]
  ws["!autofilter"] = { ref: `A1:V${Math.max(usable.length + 1, 2)}` }

  const up: XLSX.WorkSheet = {}
  ;["tenant*", "skuCode", "latestCogs (giá MỚI)", "latestCogsCurrency", "Giá CŨ (hệ thống)", "Tăng/giảm %", "Ghi chú"].forEach((h, i) => put(up, XLSX.utils.encode_cell({ r: 0, c: i }), str(h)))
  const bad = usable.filter(x => (x.verdict === "diff" || x.verdict === "nocogs") && x.expected != null)
  bad.forEach((x, i) => {
    const r = i + 2, src = rowOf.get(`${x.sku}|${x.tenant}`)!
    put(up, `A${r}`, str(x.tenant)); put(up, `B${r}`, str(x.sku)); put(up, `C${r}`, num(x.expected!, `'${AUDIT_SHEET}'!Q${src}`)); put(up, `D${r}`, str(x.currency))
    put(up, `E${r}`, x.current == null ? str("") : num(x.current)); put(up, `F${r}`, num(x.current ? (x.expected! - x.current) / x.current : 0, `IF(E${r}=0,0,(C${r}-E${r})/E${r})`, "0.00%")); put(up, `G${r}`, str(x.note ?? ""))
  })
  up["!ref"] = `A1:G${Math.max(bad.length + 1, 2)}`
  up["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 50 }]

  XLSX.utils.book_append_sheet(wb, pr, PARAM_SHEET)
  XLSX.utils.book_append_sheet(wb, ws, AUDIT_SHEET)
  XLSX.utils.book_append_sheet(wb, up, UPDATE_SHEET)
  return wb
}
