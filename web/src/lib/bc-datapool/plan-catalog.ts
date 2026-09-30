import * as XLSX from "xlsx"
import type { CatalogPlan } from "./plan-lookup"
import type { DataUnit, Pool } from "./types"

// Phần thuần (tra cứu/kiểm tra) nằm ở plan-lookup.ts để trình duyệt dùng được mà không kéo thư viện đọc Excel.
export * from "./plan-lookup"


// APN trong mô tả gói cho biết pool: cmhk = CMHK (WD), e-ideas = Singtel (W1) — khớp file mẫu Japan/Taiwan.
const APN_POOL: Record<string, Pool> = { cmhk: "CMHK", "e-ideas": "SINGTEL" }

const cell = (v: unknown) => (v == null ? "" : String(v).trim())

function parseSheet(name: string, ws: XLSX.WorkSheet): CatalogPlan[] {
  const isEsim = /esim/i.test(name)
  const isSim = !isEsim && /\bsim\b/i.test(name)
  const kind = /daily/i.test(name) ? "Daily" : /fixed/i.test(name) ? "Fixed" : null
  if (!(isEsim || isSim) || !kind) return []   // Top-Up và sheet lạ: bỏ qua

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })
  const head = (rows[0] ?? []).map(cell)
  const ix = (h: string) => head.indexOf(h)
  const [iId, iName, iRegion, iCountry, iData, iDays, iTiming, iDesc] =
    ["Plan ID", "Plan Name", "Single or Multiple Region", "Country/Region", "Data", "Days", "Timing Rule", "Product Description"].map(ix)
  if ([iId, iCountry, iData, iDays, iDesc].some(i => i < 0)) throw new Error(`Sheet "${name}": thiếu cột bắt buộc (Plan ID, Country/Region, Data, Days, Product Description)`)

  const plans: CatalogPlan[] = []
  let cur = null as CatalogPlan | null
  for (const r of rows.slice(1)) {
    const id = cell(r[iId])
    if (id && id !== cur?.id) {
      const data = /([\d.]+)\s*(MB|GB)/i.exec(cell(r[iData]))
      const desc = cell(r[iDesc])
      const apn = /APN-([^；;<]*)/.exec(desc)?.[1]?.trim().toLowerCase() ?? ""
      const operators = Array.from(desc.matchAll(/(?:^|<br>)\s*[^<]*?-([^，<]+)，Network-/g)).map(m => m[1].trim())
      const pool = APN_POOL[apn]
      const throttleKbps = Number(/throttled into (\d+)kbps/i.exec(desc)?.[1]) || undefined
      cur = null
      if (data && pool) {
        cur = {
          id, sim: isEsim ? "eSIM" : "SIM", kind, pool, timing: cell(r[iTiming]), throttleKbps, name: cell(r[iName]),
          countries: cell(r[iCountry]).split(",").map(s => s.trim()).filter(Boolean),
          amount: Number(data[1]), unit: data[2].toUpperCase() as DataUnit, operators: Array.from(new Set(operators)), days: [],
        }
        if (cell(r[iRegion]).toLowerCase() === "single" || cur.countries.length === 1) plans.push(cur)
        else cur = null   // gói đa vùng: chưa hỗ trợ
      }
    }
    // Ô Plan ID có thể bị gộp (merged) → dòng tiếp theo trống nhưng vẫn là số ngày của gói hiện tại
    const d = Number(r[iDays])
    if (cur && Number.isFinite(d) && d > 0 && !cur.days.includes(d)) cur.days.push(d)
  }
  return plans
}

/** Đọc 1 file "Purchase information" (eSIM hoặc SIM — nhận diện theo tên sheet). */
export function parsePlanFile(buf: Buffer | ArrayBuffer): CatalogPlan[] {
  const wb = XLSX.read(buf, { type: "buffer" })
  const out: CatalogPlan[] = []
  for (const n of wb.SheetNames) out.push(...parseSheet(n, wb.Sheets[n]))
  if (!out.length) throw new Error(`Không thấy sheet "Daily/Fixed Data eSIM/SIM" nào (file có: ${wb.SheetNames.join(", ")})`)
  return out
}
