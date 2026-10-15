import { getLarkUserToken } from "@/lib/lark"

// Đọc tài liệu Lark của Creator (token Lark của Hiếu) thành văn bản cho Phòng Argon: docx · sheet (mọi trang tính, đủ dòng) · wiki (→ docx/sheet) · Base (bảng) ·
// thư mục (liệt kê file con). KHÁC tool larkDocs của Gấu Pro: không cắt 60.000 ký tự, đọc đủ mọi sheet, chỉ đọc (không ghi).
const L = "https://open.larksuite.com/open-apis"
const MAX_SHEET_ROWS = 5000
const MAX_SHEET_COLS = 60
const ROWS_PER_CALL = 500
const MAX_BASE_RECORDS = 5000

export type LarkKind = "docx" | "sheet" | "wiki" | "base" | "folder" | "minutes" | "unknown"
export interface LarkRef { kind: LarkKind; token: string; tableId?: string }
export interface LarkContent { kind: "docx" | "sheet" | "base" | "minutes"; token: string; title: string; text: string; url?: string }
export interface LarkFolderItem { token: string; type: string; name: string; url?: string }

async function lk(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${L}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) } })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) {
    const need = String(d.msg ?? "").match(/required one of these privileges[^:]*:\s*(\[[^\]]*\])/)
    throw new Error(d.code === 99991679 ? `Token Lark thiếu quyền ${need ? need[1] : ""} — bấm "Kết nối Lark" lại ở Creator Settings` : `Lark ${d.code}: ${d.msg}`)
  }
  return d.data ?? d
}

export function parseLarkUrl(input: string): LarkRef {
  const s = input.trim()
  const table = s.match(/[?&]table=([A-Za-z0-9]+)/)?.[1]
  const m = s.match(/\/(docx|docs|sheets|wiki|base|folder|minutes)\/([A-Za-z0-9]+)/)
  if (!m) return { kind: "unknown", token: s }
  const kind: LarkKind = m[1] === "sheets" ? "sheet" : m[1] === "docs" ? "docx" : (m[1] as LarkKind)
  return { kind, token: m[2], tableId: table }
}

async function resolveWiki(token: string, ref: LarkRef): Promise<LarkRef> {
  if (ref.kind !== "wiki") return ref
  const d = await lk(token, `/wiki/v2/spaces/get_node?token=${encodeURIComponent(ref.token)}`)
  const n = d.node ?? {}
  const kind: LarkKind = n.obj_type === "sheet" ? "sheet" : n.obj_type === "docx" ? "docx" : n.obj_type === "bitable" ? "base" : "unknown"
  if (kind === "unknown") throw new Error(`Trang Wiki loại "${n.obj_type ?? "?"}" chưa hỗ trợ`)
  return { kind, token: n.obj_token, tableId: ref.tableId }
}

const csvCell = (v: unknown): string => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Ô sheet Lark có thể là chuỗi, số hoặc mảng đoạn rich-text ({text}/{link}). */
function cellText(v: unknown): string {
  if (Array.isArray(v)) return v.map(x => (x && typeof x === "object" ? ((x as { text?: string }).text ?? (x as { link?: string }).link ?? "") : String(x ?? ""))).join("")
  if (v && typeof v === "object") return String((v as { text?: string }).text ?? JSON.stringify(v))
  return v == null ? "" : String(v)
}

const colLetter = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }

async function readSheet(token: string, sheetToken: string): Promise<{ title: string; text: string }> {
  const meta = await lk(token, `/sheets/v3/spreadsheets/${sheetToken}`).catch(() => null)
  const title = String(meta?.spreadsheet?.title ?? "Bảng tính Lark")
  const q = await lk(token, `/sheets/v3/spreadsheets/${sheetToken}/sheets/query`)
  const parts: string[] = []
  for (const sh of (q.sheets ?? []) as { sheet_id: string; title: string; hidden?: boolean; grid_properties?: { row_count?: number; column_count?: number } }[]) {
    if (sh.hidden) continue
    const rows = Math.min(sh.grid_properties?.row_count ?? 0, MAX_SHEET_ROWS)
    const cols = Math.min(sh.grid_properties?.column_count ?? 0, MAX_SHEET_COLS)
    if (!rows || !cols) continue
    const lines: string[] = []
    for (let start = 1; start <= rows; start += ROWS_PER_CALL) {
      const end = Math.min(start + ROWS_PER_CALL - 1, rows)
      const range = encodeURIComponent(`${sh.sheet_id}!A${start}:${colLetter(cols - 1)}${end}`)
      const d = await lk(token, `/sheets/v2/spreadsheets/${sheetToken}/values/${range}?valueRenderOption=ToString`)
      for (const r of (d.valueRange?.values ?? []) as unknown[][]) lines.push(r.map(c => csvCell(cellText(c))).join(","))
    }
    while (lines.length && /^,*$/.test(lines[lines.length - 1])) lines.pop()
    if (lines.length) parts.push(`=== Sheet: ${sh.title} ===\n${lines.join("\n")}`)
  }
  return { title, text: parts.join("\n\n") || "(Bảng tính trống)" }
}

async function readDocx(token: string, docToken: string): Promise<{ title: string; text: string }> {
  const [meta, raw] = await Promise.all([
    lk(token, `/docx/v1/documents/${docToken}`).catch(() => null),
    lk(token, `/docx/v1/documents/${docToken}/raw_content`),
  ])
  return { title: String(meta?.document?.title ?? "Tài liệu Lark"), text: String(raw.content ?? "") }
}

async function readBase(token: string, appToken: string, tableId?: string): Promise<{ title: string; text: string }> {
  const app = await lk(token, `/bitable/v1/apps/${appToken}`).catch(() => null)
  const title = String(app?.app?.name ?? "Lark Base")
  const tables = tableId ? [{ table_id: tableId, name: tableId }] : ((await lk(token, `/bitable/v1/apps/${appToken}/tables?page_size=100`)).items ?? []) as { table_id: string; name: string }[]
  const parts: string[] = []
  for (const t of tables.slice(0, 20)) {
    const fields = ((await lk(token, `/bitable/v1/apps/${appToken}/tables/${t.table_id}/fields?page_size=100`)).items ?? []) as { field_name: string }[]
    const names = fields.map(f => f.field_name)
    const lines = [names.map(csvCell).join(",")]
    let pageToken = "", n = 0
    do {
      const d = await lk(token, `/bitable/v1/apps/${appToken}/tables/${t.table_id}/records?page_size=500${pageToken ? `&page_token=${pageToken}` : ""}`)
      for (const rec of (d.items ?? []) as { fields: Record<string, unknown> }[]) { lines.push(names.map(nm => csvCell(cellText(rec.fields?.[nm]))).join(",")); n++ }
      pageToken = d.has_more ? d.page_token : ""
    } while (pageToken && n < MAX_BASE_RECORDS)
    parts.push(`=== Sheet: ${t.name} ===\n${lines.join("\n")}`)
  }
  return { title, text: parts.join("\n\n") || "(Base trống)" }
}

/** Biên bản họp Lark Minutes: tiêu đề + thông tin + bản ghi lời (có người nói, mốc thời gian). Cần scope minutes (Kết nối Lark lại nếu thiếu). */
async function readMinutes(token: string, minuteToken: string): Promise<{ title: string; text: string }> {
  const meta = await lk(token, `/minutes/v1/minutes/${minuteToken}`)
  const m = (meta.minute ?? meta) as { title?: string; duration?: string | number; create_time?: string | number; owner_id?: string }
  const res = await fetch(`${L}/minutes/v1/minutes/${minuteToken}/transcript?need_speaker=true&need_timestamp=true&file_format=txt`, { headers: { Authorization: `Bearer ${token}` } })
  const ct = res.headers.get("content-type") ?? ""
  const raw = await res.text()
  if (ct.includes("json")) {
    const d = JSON.parse(raw) as { code?: number; msg?: string }
    if (d.code) throw new Error(d.code === 99991679 ? `Token Lark thiếu quyền Minutes — bấm "Kết nối Lark" lại ở Creator Settings (${d.msg ?? ""})` : `Lark ${d.code}: ${d.msg}`)
  }
  if (!res.ok) throw new Error(`Lark Minutes HTTP ${res.status}`)
  const title = String(m.title ?? "Cuộc họp Lark")
  const dur = m.duration != null ? ` · thời lượng ${Math.round(Number(m.duration) / 60000)} phút` : ""
  return { title, text: `Biên bản họp: ${title}${dur}\n\n${raw.trim() || "(Chưa có bản ghi lời)"}` }
}

/** Liệt kê file trong thư mục Lark (1 cấp; thư mục con trả về với type "folder" để gọi tiếp). */
export async function listFolder(token: string, folderToken: string): Promise<LarkFolderItem[]> {
  const out: LarkFolderItem[] = []
  let pageToken = ""
  do {
    const d = await lk(token, `/drive/v1/files?folder_token=${folderToken}&page_size=200${pageToken ? `&page_token=${pageToken}` : ""}`)
    for (const f of (d.files ?? []) as { token: string; type: string; name: string; url?: string }[]) out.push({ token: f.token, type: f.type, name: f.name, url: f.url })
    pageToken = d.has_more ? d.next_page_token : ""
  } while (pageToken && out.length < 500)
  return out
}

/** Đọc 1 tài liệu theo URL/token. Thư mục không đọc ở đây (dùng listFolder). */
export async function readLark(input: string | LarkRef, token?: string): Promise<LarkContent> {
  const tk = token ?? (await getLarkUserToken())
  if (!tk) throw new Error('Chưa kết nối Lark của Creator — bấm "Kết nối Lark" ở Creator Settings')
  const ref = await resolveWiki(tk, typeof input === "string" ? parseLarkUrl(input) : input)
  if (ref.kind === "minutes") return { kind: "minutes", token: ref.token, ...(await readMinutes(tk, ref.token)) }
  if (ref.kind === "sheet") return { kind: "sheet", token: ref.token, ...(await readSheet(tk, ref.token)) }
  if (ref.kind === "base") return { kind: "base", token: ref.token, ...(await readBase(tk, ref.token, ref.tableId)) }
  if (ref.kind === "docx" || ref.kind === "unknown") return { kind: "docx", token: ref.token, ...(await readDocx(tk, ref.token)) }
  throw new Error("Link thư mục: dùng thêm cả thư mục, không đọc trực tiếp")
}

export async function larkToken(): Promise<string> {
  const t = await getLarkUserToken()
  if (!t) throw new Error('Chưa kết nối Lark của Creator — bấm "Kết nối Lark" ở Creator Settings')
  return t
}
