import { createHash } from "node:crypto"
import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET, ensureArgonBucket } from "./server"
import { extractReports } from "./report"

// Kho báo cáo của Creator: HTML lưu ở Storage (bucket argon-room, `<username>/reports/<id>.html`), mục lục ở app_settings `argon_reports:<username>`
// (không cần migration). Report tự vào kho khi lượt chạy xong; có thể đánh dấu "mẫu" để dựng lại với số liệu mới.
export interface ReportMeta {
  id: string; title: string; projectId: string | null; runId: string | null; createdAt: string; size: number; hash: string; template: boolean
}
export const MAX_REPORTS = 200

const key = (username: string) => `argon_reports:${username}`
const pathOf = (username: string, id: string) => `${username}/reports/${id}.html`
const hashOf = (html: string) => createHash("sha256").update(html).digest("hex").slice(0, 16)

export async function loadReportIndex(username: string): Promise<ReportMeta[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key(username)).maybeSingle()
  try { const v = JSON.parse(data?.value ?? "[]"); return Array.isArray(v) ? v : [] } catch { return [] }
}

async function saveIndex(username: string, list: ReportMeta[]) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: key(username), value: JSON.stringify(list), category: "argon", label: "Kho báo cáo Phòng Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

/** Lưu 1 report (bỏ qua nếu cùng nội dung đã có trong cùng dự án). Quá MAX_REPORTS thì xoá report cũ nhất không phải mẫu. Trả meta (mới hoặc đã có). */
export async function saveReport(username: string, r: { title: string; html: string; projectId?: string | null; runId?: string | null }): Promise<ReportMeta> {
  const hash = hashOf(r.html)
  const list = await loadReportIndex(username)
  const dup = list.find(x => x.hash === hash && x.projectId === (r.projectId ?? null))
  if (dup) return dup
  await ensureArgonBucket()
  const id = crypto.randomUUID().slice(0, 12)
  const up = await supabaseAdmin.storage.from(ARGON_BUCKET).upload(pathOf(username, id), Buffer.from(r.html, "utf8"), { contentType: "text/html; charset=utf-8" })
  if (up.error) throw new Error(`Lưu report lỗi: ${up.error.message}`)
  const meta: ReportMeta = { id, title: r.title.slice(0, 120), projectId: r.projectId ?? null, runId: r.runId ?? null, createdAt: new Date().toISOString(), size: Buffer.byteLength(r.html), hash, template: false }
  const next = [meta, ...list]
  const drop: ReportMeta[] = []
  while (next.length > MAX_REPORTS) {
    const i = [...next].reverse().findIndex(x => !x.template)
    if (i < 0) break
    drop.push(...next.splice(next.length - 1 - i, 1))
  }
  await saveIndex(username, next)
  if (drop.length) await supabaseAdmin.storage.from(ARGON_BUCKET).remove(drop.map(d => pathOf(username, d.id)))
  return meta
}

/** Tự lưu mọi report hoàn chỉnh trong 1 câu trả lời. Không bao giờ ném lỗi (lưu kho hỏng không được làm hỏng lượt chạy). */
export async function autoSaveReports(username: string, projectId: string, runId: string, answer: string): Promise<number> {
  try {
    const blocks = extractReports(answer)
    for (const b of blocks) await saveReport(username, { title: b.title, html: b.html, projectId, runId })
    return blocks.length
  } catch (e) { console.error("[argon reports] autosave:", (e as Error).message); return 0 }
}

export async function getReportHtml(username: string, id: string): Promise<{ meta: ReportMeta; html: string } | null> {
  const meta = (await loadReportIndex(username)).find(x => x.id === id)
  if (!meta) return null
  const { data, error } = await supabaseAdmin.storage.from(ARGON_BUCKET).download(pathOf(username, id))
  if (error || !data) return null
  return { meta, html: await data.text() }
}

export async function updateReport(username: string, id: string, patch: { title?: string; template?: boolean }): Promise<ReportMeta | null> {
  const list = await loadReportIndex(username)
  const m = list.find(x => x.id === id)
  if (!m) return null
  if (typeof patch.title === "string" && patch.title.trim()) m.title = patch.title.trim().slice(0, 120)
  if (typeof patch.template === "boolean") m.template = patch.template
  await saveIndex(username, list)
  return m
}

export async function deleteReport(username: string, id: string): Promise<boolean> {
  const list = await loadReportIndex(username)
  if (!list.some(x => x.id === id)) return false
  await saveIndex(username, list.filter(x => x.id !== id))
  await supabaseAdmin.storage.from(ARGON_BUCKET).remove([pathOf(username, id)])
  return true
}

/** Phần nối vào yêu cầu khi dựng lại report từ mẫu: nhúng HTML mẫu làm DỮ LIỆU tham chiếu kiểu dáng/bố cục (số liệu cũ trong mẫu không được dùng). */
export function templateSuffix(title: string, html: string): string {
  return `\n\n<report_mau ten="${title.replace(/"/g, "'")}">\n${html}\n</report_mau>\nDựng lại report theo mẫu trên: GIỮ bố cục, kiểu dáng, cách tương tác; nhưng số liệu phải lấy MỚI NHẤT từ các nguồn của dự án (số trong mẫu chỉ là ví dụ, không dùng lại), cập nhật tiêu đề/thời điểm dữ liệu. Trả đủ MỘT khối html hoàn chỉnh.`
}
