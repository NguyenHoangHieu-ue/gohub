// Khung báo cáo (plan be-gau-upgrade.md U2): model trả JSON theo khung này → server dựng Word/Excel/PowerPoint/PDF theo mẫu GoHub.
// Bảng có thể kèm `sql` → server tự chạy lấy số thật (không để model gõ lại số) → số trong file khớp SQL.

export type ColType = "text" | "number" | "money" | "percent"
export interface ReportColumn { key: string; label: string; type?: ColType }
export interface ReportTable { title?: string; columns: ReportColumn[]; rows?: Record<string, unknown>[]; sql?: string; totalRow?: boolean }
export interface ReportChart {
  type: "bar" | "line" | "pie" | "stacked"
  title: string
  x: string                                   // cột làm trục X / nhãn lát (pie)
  series: { key: string; label: string }[]    // pie: chỉ dùng series[0]
  data?: Record<string, unknown>[]            // bỏ trống = dùng dữ liệu bảng cùng mục
}
export interface ReportKpi { label: string; value: number | string; type?: ColType; change?: number; sql?: string }   // sql: lấy số thật (ô đầu dòng đầu)
export interface ReportSection { heading: string; text?: string; bullets?: string[]; kpis?: ReportKpi[]; table?: ReportTable; chart?: ReportChart }
export interface ReportSpec {
  title: string
  subtitle?: string
  period?: string            // kỳ dữ liệu, vd "01/07/2026 – 30/09/2026"
  summary: string[]          // kết luận trước (1–5 ý)
  sections: ReportSection[]
  actions?: string[]         // việc nên làm
  notes?: string[]           // nguồn / ghi chú định nghĩa
}
export type ReportFormat = "docx" | "xlsx" | "pptx" | "pdf"

export const BRAND = { primary: "#1446A5", dark: "#003A93", light: "#009CE0", text: "#0F1012", bg: "#F7F8F8" }
export const PALETTE = ["#1446A5", "#009CE0", "#F59E0B", "#10B981", "#003A93", "#7FB2E5", "#94A3B8", "#EF4444"]

const MAX_ROWS = 500

/** Chuẩn hoá + kiểm khung model gửi. Trả lỗi tiếng Việt để model sửa lại. */
export function normalizeSpec(raw: any): { spec?: ReportSpec; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Thiếu khung báo cáo." }
  const title = String(raw.title ?? "").trim()
  if (!title) return { error: "Thiếu title." }
  const sections = Array.isArray(raw.sections) ? raw.sections : []
  if (!sections.length) return { error: "Cần ít nhất 1 mục trong sections." }
  const strs = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x ?? "").trim()).filter(Boolean)
  const types = new Set(["text", "number", "money", "percent"])
  const spec: ReportSpec = {
    title: title.slice(0, 160),
    subtitle: raw.subtitle ? String(raw.subtitle).slice(0, 200) : undefined,
    period: raw.period ? String(raw.period).slice(0, 120) : undefined,
    summary: strs(raw.summary).slice(0, 8),
    actions: strs(raw.actions).slice(0, 10),
    notes: strs(raw.notes).slice(0, 10),
    sections: sections.slice(0, 20).map((s: any) => {
      const sec: ReportSection = { heading: String(s?.heading ?? "").slice(0, 160) || "Mục" }
      if (s?.text) sec.text = String(s.text).slice(0, 4000)
      if (Array.isArray(s?.bullets)) sec.bullets = strs(s.bullets).slice(0, 15)
      if (Array.isArray(s?.kpis)) sec.kpis = s.kpis.slice(0, 8).map((k: any) => ({
        label: String(k?.label ?? ""), value: typeof k?.value === "number" ? k.value : String(k?.value ?? ""),
        type: types.has(k?.type) ? k.type : undefined, change: typeof k?.change === "number" ? k.change : undefined,
        sql: typeof k?.sql === "string" && k.sql.trim() ? k.sql.trim() : undefined,
      }))
      if (s?.table) {
        const cols = (Array.isArray(s.table.columns) ? s.table.columns : []).map((c: any) => ({
          key: String(c?.key ?? ""), label: String(c?.label ?? c?.key ?? ""), type: types.has(c?.type) ? c.type : undefined,
        })).filter((c: ReportColumn) => c.key)
        sec.table = {
          title: s.table.title ? String(s.table.title) : undefined, columns: cols,
          rows: Array.isArray(s.table.rows) ? s.table.rows.slice(0, MAX_ROWS) : undefined,
          sql: typeof s.table.sql === "string" && s.table.sql.trim() ? s.table.sql.trim() : undefined,
          totalRow: s.table.totalRow === true,
        }
      }
      if (s?.chart && ["bar", "line", "pie", "stacked"].includes(s.chart.type)) {
        sec.chart = {
          type: s.chart.type, title: String(s.chart.title ?? sec.heading), x: String(s.chart.x ?? ""),
          series: (Array.isArray(s.chart.series) ? s.chart.series : []).slice(0, 6)
            .map((x: any) => ({ key: String(x?.key ?? ""), label: String(x?.label ?? x?.key ?? "") })).filter((x: any) => x.key),
          data: Array.isArray(s.chart.data) ? s.chart.data.slice(0, 60) : undefined,
        }
      }
      return sec
    }),
  }
  return { spec }
}

/** Chạy SQL của các bảng (qua hàm của trợ lý — đã áp quyền vai trò/giá vốn) và gắn dữ liệu biểu đồ lấy từ bảng. */
export async function resolveData(spec: ReportSpec, runSql: (sql: string) => Promise<{ rows?: Record<string, unknown>[]; error?: string }>): Promise<string[]> {
  const errors: string[] = []
  for (const sec of spec.sections) {
    for (const k of sec.kpis ?? []) {
      if (!k.sql) continue
      const r = await runSql(k.sql)
      const v = r.rows?.[0] ? Object.values(r.rows[0]).find(x => num(x) !== null) : undefined
      if (r.error || v === undefined) errors.push(`Ô số "${k.label}": ${r.error || "SQL không trả số"}`)
      else k.value = num(v)!
    }
    const t = sec.table
    if (t?.sql) {
      const r = await runSql(t.sql)
      if (r.error) { errors.push(`Mục "${sec.heading}": ${r.error}`); continue }
      t.rows = (r.rows ?? []).slice(0, MAX_ROWS)
      if (!t.columns.length && t.rows.length) t.columns = Object.keys(t.rows[0]).map(k => ({ key: k, label: k }))
    }
    if (sec.chart && !sec.chart.data?.length && t?.rows?.length) sec.chart.data = t.rows.slice(0, 60)
  }
  return errors
}

const num = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null

export function formatValue(v: unknown, type?: ColType): string {
  const n = num(v)
  if (n === null || type === "text") return v == null ? "" : String(v)
  if (type === "percent") return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`
  if (type === "money") return Math.round(n).toLocaleString("vi-VN")
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
}

/** Số gọn cho trục biểu đồ: 6,27 tỷ · 512 tr · 12 k. */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} k`
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })
}

export const toNumber = (v: unknown) => num(v) ?? 0

/** Dòng tổng của bảng: cộng cột số/tiền; cột % để trống (không cộng phần trăm). */
export function totalRow(t: ReportTable): Record<string, unknown> | null {
  if (!t.totalRow || !t.rows?.length) return null
  const out: Record<string, unknown> = {}
  t.columns.forEach((c, i) => {
    if (i === 0) out[c.key] = "Tổng"
    else if (c.type === "number" || c.type === "money") out[c.key] = t.rows!.reduce((s, r) => s + toNumber(r[c.key]), 0)
    else out[c.key] = ""
  })
  return out
}

export function fileBase(title: string): string {
  return title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "Bao_cao"
}
