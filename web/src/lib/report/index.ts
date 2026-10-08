import { supabaseAdmin } from "@/lib/supabase"
import { normalizeSpec, resolveData, fileBase, type ReportFormat, type ReportSpec } from "./spec"
import { chartPng } from "./charts"
import { buildReportDocx } from "./docx"
import { buildReportXlsx } from "./xlsx"
import { buildReportPptx } from "./pptx"
import { buildReportPdf } from "./pdf"

// Bộ dựng báo cáo (plan be-gau-upgrade.md U2): khung JSON → Word/Excel/PowerPoint/PDF theo mẫu GoHub. File lưu bucket RIÊNG TƯ "reports"
// theo thư mục người tạo; tải qua /api/chat/report-file (kiểm đăng nhập + đúng người) — báo cáo chứa số kinh doanh, không để link công khai.
export const REPORT_BUCKET = "reports"
const MIME: Record<ReportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
}
export const ownerFolder = (owner: string) => owner.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "anon"

async function upload(path: string, buf: Buffer, contentType: string) {
  let { error } = await supabaseAdmin.storage.from(REPORT_BUCKET).upload(path, buf, { contentType, upsert: true })
  if (error && /bucket/i.test(error.message)) {
    await supabaseAdmin.storage.createBucket(REPORT_BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 })
    ;({ error } = await supabaseAdmin.storage.from(REPORT_BUCKET).upload(path, buf, { contentType, upsert: true }))
  }
  if (error) throw new Error(error.message)
}

export interface BuiltFile { format: ReportFormat; filename: string; url: string }

export async function buildReport(raw: unknown, formats: ReportFormat[], opts: {
  owner: string
  runSql: (sql: string) => Promise<{ rows?: Record<string, unknown>[]; error?: string }>
}): Promise<{ files?: BuiltFile[]; spec?: ReportSpec; warnings?: string[]; error?: string }> {
  const { spec, error } = normalizeSpec(raw)
  if (!spec) return { error }
  const warnings = await resolveData(spec, opts.runSql)
  const want = formats.length ? [...new Set(formats)] : (["docx", "xlsx"] as ReportFormat[])

  const charts = new Map<number, Buffer>()
  if (want.includes("docx") || want.includes("xlsx")) {
    await Promise.all(spec.sections.map(async (s, i) => {
      if (s.chart?.data?.length) charts.set(i, await chartPng(s.chart).catch(e => { warnings.push(`Biểu đồ "${s.chart!.title}": ${e.message}`); return Buffer.alloc(0) }))
    }))
    for (const [k, v] of charts) if (!v.length) charts.delete(k)
  }

  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "")
  const base = `${fileBase(spec.title)}_${stamp}`
  const files: BuiltFile[] = []
  for (const f of want) {
    try {
      const buf = f === "docx" ? await buildReportDocx(spec, charts)
        : f === "xlsx" ? await buildReportXlsx(spec, charts)
        : f === "pptx" ? await buildReportPptx(spec)
        : await buildReportPdf(spec)
      const path = `${ownerFolder(opts.owner)}/${base}.${f}`
      await upload(path, buf, MIME[f])
      files.push({ format: f, filename: `${base}.${f}`, url: `/api/chat/report-file?p=${encodeURIComponent(path)}` })
    } catch (e: any) {
      warnings.push(`Không tạo được bản ${f.toUpperCase()}: ${e?.message || e}`)
    }
  }
  return { files, spec, warnings }
}
