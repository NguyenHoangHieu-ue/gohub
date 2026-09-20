// Logic thuần cho Query Studio (SQL Query kiểu Power BI): suy kiểu cột từ kết quả, gợi ý biểu đồ,
// gom nhóm/tính tổng phía client. Không đụng DB — pg trả numeric/bigint dạng CHUỖI nên phải tự nhận diện.

export type ColKind = "number" | "date" | "text"
export interface ColInfo { name: string; kind: ColKind }
export type Row = Record<string, unknown>

export type VisualType = "table" | "column" | "bar" | "line" | "area" | "donut" | "card"
export type Agg = "sum" | "avg" | "count" | "distinct" | "min" | "max"

export interface ValueField { field: string; agg: Agg }
export interface VisualConfig {
  type: VisualType
  axis: string | null
  legend: string | null
  values: ValueField[]
  topN: number
  stacked: boolean
}

export const AGG_LABEL: Record<Agg, string> = {
  sum: "Sum", avg: "Average", count: "Count", distinct: "Count (distinct)", min: "Min", max: "Max",
}

const NUM_RE = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}.*)?$/

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && NUM_RE.test(v.trim())) return Number(v)
  return null
}

function kindOf(v: unknown): ColKind {
  if (v instanceof Date) return "date"
  if (typeof v === "number") return "number"
  if (typeof v === "string") {
    if (NUM_RE.test(v.trim())) return "number"
    if (DATE_RE.test(v.trim())) return "date"
  }
  return "text"
}

// Kiểu cột = kiểu chiếm tuyệt đại đa số (≥90%) giá trị không null trong 300 dòng đầu; lẫn lộn → text.
export function inferColumns(rows: Row[]): ColInfo[] {
  if (!rows.length) return []
  const sample = rows.slice(0, 300)
  return Object.keys(rows[0]).map(name => {
    const counts: Record<ColKind, number> = { number: 0, date: 0, text: 0 }
    let n = 0
    for (const r of sample) {
      const v = r[name]
      if (v === null || v === undefined || v === "") continue
      counts[kindOf(v)]++; n++
    }
    if (!n) return { name, kind: "text" as ColKind }
    const kind = (["number", "date", "text"] as ColKind[]).find(k => counts[k] / n >= 0.9) ?? "text"
    return { name, kind }
  })
}

const dayKey = (v: unknown): string => {
  const s = v instanceof Date ? v.toISOString() : String(v)
  return s.length > 10 ? s.slice(0, 10) : s
}

// Gợi ý ban đầu giống "Recommended" của Power BI.
export function suggestConfig(cols: ColInfo[], rows: Row[]): VisualConfig {
  const nums = cols.filter(c => c.kind === "number")
  const dims = cols.filter(c => c.kind !== "number")
  const base: VisualConfig = { type: "table", axis: null, legend: null, values: [], topN: 20, stacked: false }
  if (!rows.length) return base
  if (rows.length === 1 && nums.length > 0) {
    return { ...base, type: "card", values: nums.slice(0, 4).map(c => ({ field: c.name, agg: "sum" as Agg })) }
  }
  if (dims.length > 0 && nums.length > 0 && rows.length <= 2000) {
    const axis = dims.find(c => c.kind === "date") ?? dims[0]
    return {
      ...base,
      type: axis.kind === "date" ? "line" : "column",
      axis: axis.name,
      values: nums.slice(0, 1).map(c => ({ field: c.name, agg: "sum" as Agg })),
    }
  }
  return base
}

function aggregateValues(vals: unknown[], agg: Agg): number {
  if (agg === "count") return vals.filter(v => v !== null && v !== undefined && v !== "").length
  if (agg === "distinct") return new Set(vals.filter(v => v !== null && v !== undefined && v !== "").map(String)).size
  const nums = vals.map(toNumber).filter((n): n is number => n !== null)
  if (!nums.length) return 0
  if (agg === "sum") return nums.reduce((a, b) => a + b, 0)
  if (agg === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length
  if (agg === "min") return Math.min(...nums)
  return Math.max(...nums)
}

export const seriesName = (v: ValueField) => `${AGG_LABEL[v.agg]} of ${v.field}`

export interface ChartSeries { dataKey: string; name: string }
export interface ChartData { axisKey: string; series: ChartSeries[]; data: Record<string, string | number>[]; truncated: boolean }

export const AXIS_KEY = "__axis"

// Gom nhóm theo Axis (và Legend nếu có) rồi tính Values — tương đương hàng Axis/Legend/Values của Power BI.
export function aggregateForChart(rows: Row[], cfg: VisualConfig, cols: ColInfo[]): ChartData {
  const empty: ChartData = { axisKey: AXIS_KEY, series: [], data: [], truncated: false }
  if (!cfg.axis || !cfg.values.length) return empty
  const axisKind = cols.find(c => c.name === cfg.axis)?.kind ?? "text"
  const keyOf = (r: Row) => {
    const v = r[cfg.axis!]
    if (v === null || v === undefined || v === "") return "(trống)"
    return axisKind === "date" ? dayKey(v) : String(v)
  }

  const useLegend = !!cfg.legend && cfg.legend !== cfg.axis
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const k = keyOf(r)
    const g = groups.get(k)
    if (g) g.push(r); else groups.set(k, [r])
  }

  let series: ChartSeries[]
  let legendKeys: string[] = []
  const first = cfg.values[0]
  if (useLegend) {
    const totals = new Map<string, number>()
    for (const r of rows) {
      const lk = r[cfg.legend!] === null || r[cfg.legend!] === undefined ? "(trống)" : String(r[cfg.legend!])
      totals.set(lk, (totals.get(lk) ?? 0) + Math.abs(toNumber(r[first.field]) ?? 0))
    }
    legendKeys = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0])
    series = legendKeys.map(k => ({ dataKey: k, name: k }))
  } else {
    series = cfg.values.map((v, i) => ({ dataKey: `v${i}`, name: seriesName(v) }))
  }

  let data = [...groups.entries()].map(([key, grp]) => {
    const point: Record<string, string | number> = { [AXIS_KEY]: key }
    if (useLegend) {
      for (const lk of legendKeys) {
        const sub = grp.filter(r => (r[cfg.legend!] === null || r[cfg.legend!] === undefined ? "(trống)" : String(r[cfg.legend!])) === lk)
        point[lk] = aggregateValues(sub.map(r => r[first.field]), first.agg)
      }
    } else {
      cfg.values.forEach((v, i) => { point[`v${i}`] = aggregateValues(grp.map(r => r[v.field]), v.agg) })
    }
    return point
  })

  const total = (p: Record<string, string | number>) => series.reduce((s, x) => s + (Number(p[x.dataKey]) || 0), 0)
  if (axisKind === "text") {
    data.sort((a, b) => total(b) - total(a))
  } else {
    data.sort((a, b) => String(a[AXIS_KEY]).localeCompare(String(b[AXIS_KEY]), undefined, { numeric: true }))
  }
  const cap = cfg.topN > 0 ? cfg.topN : 500
  const truncated = data.length > cap
  if (truncated) data = axisKind === "text" ? data.slice(0, cap) : data.slice(-cap)
  return { axisKey: AXIS_KEY, series, data, truncated }
}

export interface CardValue { label: string; value: number }
export function computeCards(rows: Row[], cfg: VisualConfig): CardValue[] {
  return cfg.values.map(v => ({ label: seriesName(v), value: aggregateValues(rows.map(r => r[v.field]), v.agg) }))
}

export function sortRows(rows: Row[], col: string, dir: "asc" | "desc", kind: ColKind): Row[] {
  const mul = dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = a[col], vb = b[col]
    const an = va === null || va === undefined || va === "", bn = vb === null || vb === undefined || vb === ""
    if (an || bn) return an === bn ? 0 : an ? 1 : -1 // null luôn xuống cuối
    if (kind === "number") return ((toNumber(va) ?? 0) - (toNumber(vb) ?? 0)) * mul
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * mul
  })
}

export function columnTotals(rows: Row[], cols: ColInfo[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cols) if (c.kind === "number") out[c.name] = aggregateValues(rows.map(r => r[c.name]), "sum")
  return out
}

export function filterRows(rows: Row[], term: string): Row[] {
  const t = term.trim().toLowerCase()
  if (!t) return rows
  return rows.filter(r => Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(t)))
}
