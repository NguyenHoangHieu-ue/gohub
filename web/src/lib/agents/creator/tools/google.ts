import { getGoogleAccessToken } from "@/lib/google-oauth"

// Tool googleWorkspace (Gấu Pro, creator-only): tìm/đọc/tạo/sửa Google Drive, Docs, Sheets bằng token OAuth của
// creator (lib/google-oauth.ts). Gọi REST thẳng — không thêm SDK googleapis (nặng, chỉ cần vài endpoint).
const DRIVE = "https://www.googleapis.com/drive/v3"
const DOCS = "https://docs.googleapis.com/v1/documents"
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets"
const MAX_TEXT = 60_000

const MIME_DOC = "application/vnd.google-apps.document"
const MIME_SHEET = "application/vnd.google-apps.spreadsheet"

type Args = {
  action: string
  query?: string
  file_id?: string
  title?: string
  content?: string
  find?: string
  replace?: string
  range?: string
  values_json?: string
}

async function g(token: string, url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 300)
    try { msg = JSON.parse(text).error?.message ?? msg } catch { /* giữ text thô */ }
    throw new Error(`Google API ${res.status}: ${msg}`)
  }
  try { return JSON.parse(text) } catch { return text }
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n…(cắt bớt, file dài ${s.length} ký tự)` : s)
const docLink = (id: string) => `https://docs.google.com/document/d/${id}/edit`
const sheetLink = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`

function parseValues(json?: string): string[][] {
  if (!json) throw new Error("Thiếu values_json (mảng 2 chiều JSON, vd [[\"A\",\"B\"],[1,2]]).")
  const v = JSON.parse(json)
  if (!Array.isArray(v) || !v.every(Array.isArray)) throw new Error("values_json phải là mảng 2 chiều.")
  return v
}

async function firstSheetRange(token: string, id: string): Promise<string> {
  const meta = await g(token, `${SHEETS}/${id}?fields=sheets.properties.title`)
  const title = meta.sheets?.[0]?.properties?.title ?? "Sheet1"
  return `'${title.replace(/'/g, "''")}'!A1:Z500`
}

async function run(token: string, a: Args): Promise<any> {
  switch (a.action) {
    case "search": {
      const term = (a.query ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
      const q = term
        ? `(name contains '${term}' or fullText contains '${term}') and trashed = false`
        : "trashed = false"
      const r = await g(token, `${DRIVE}/files?${new URLSearchParams({
        q, pageSize: "20", orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))",
      })}`)
      return { files: r.files ?? [] }
    }

    case "read": {
      if (!a.file_id) throw new Error("Thiếu file_id.")
      const meta = await g(token, `${DRIVE}/files/${a.file_id}?fields=id,name,mimeType,webViewLink`)
      if (meta.mimeType === MIME_DOC) {
        const md = await g(token, `${DRIVE}/files/${a.file_id}/export?mimeType=${encodeURIComponent("text/markdown")}`)
        return { ...meta, content: clip(String(md)) }
      }
      if (meta.mimeType === MIME_SHEET) {
        const range = a.range || await firstSheetRange(token, a.file_id)
        const r = await g(token, `${SHEETS}/${a.file_id}/values/${encodeURIComponent(range)}`)
        return { ...meta, range: r.range, values: r.values ?? [] }
      }
      if (/^text\/|json|csv|xml/.test(meta.mimeType)) {
        const body = await g(token, `${DRIVE}/files/${a.file_id}?alt=media`)
        return { ...meta, content: clip(typeof body === "string" ? body : JSON.stringify(body)) }
      }
      return { ...meta, error: `Chưa đọc được loại file ${meta.mimeType} — chỉ Docs/Sheets/file text.` }
    }

    case "create_doc": {
      if (!a.title) throw new Error("Thiếu title.")
      // Upload markdown kèm mimeType Google Doc → Drive tự chuyển thành Doc có heading/bảng/bullet.
      const boundary = `gp${Date.now()}`
      const body = [
        `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "",
        JSON.stringify({ name: a.title, mimeType: MIME_DOC }),
        `--${boundary}`, "Content-Type: text/markdown; charset=UTF-8", "",
        a.content ?? "", `--${boundary}--`,
      ].join("\r\n")
      const f = await g(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
        method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
      })
      return { id: f.id, name: f.name, link: docLink(f.id) }
    }

    case "append_doc": {
      if (!a.file_id || !a.content) throw new Error("append_doc cần file_id + content.")
      await g(token, `${DOCS}/${a.file_id}:batchUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${a.content}` } }] }),
      })
      return { id: a.file_id, link: docLink(a.file_id), appended_chars: a.content.length }
    }

    case "replace_in_doc": {
      if (!a.file_id || !a.find || typeof a.replace !== "string") throw new Error("replace_in_doc cần file_id + find + replace.")
      const r = await g(token, `${DOCS}/${a.file_id}:batchUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ replaceAllText: { containsText: { text: a.find, matchCase: true }, replaceText: a.replace } }] }),
      })
      return { id: a.file_id, link: docLink(a.file_id), replaced: r.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0 }
    }

    case "create_sheet": {
      if (!a.title) throw new Error("Thiếu title.")
      const s = await g(token, SHEETS, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { title: a.title } }),
      })
      if (a.values_json) {
        const values = parseValues(a.values_json)
        await g(token, `${SHEETS}/${s.spreadsheetId}/values/${encodeURIComponent("A1")}?valueInputOption=USER_ENTERED`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
        })
      }
      return { id: s.spreadsheetId, link: sheetLink(s.spreadsheetId) }
    }

    case "write_sheet":
    case "append_sheet": {
      if (!a.file_id || !a.range) throw new Error(`${a.action} cần file_id + range (vd 'Sheet1'!A1).`)
      const values = parseValues(a.values_json)
      const append = a.action === "append_sheet"
      const url = `${SHEETS}/${a.file_id}/values/${encodeURIComponent(a.range)}${append ? ":append" : ""}` +
        `?valueInputOption=USER_ENTERED${append ? "&insertDataOption=INSERT_ROWS" : ""}`
      const r = await g(token, url, {
        method: append ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
      })
      return { id: a.file_id, link: sheetLink(a.file_id), updated: r.updates?.updatedRange ?? r.updatedRange, cells: r.updates?.updatedCells ?? r.updatedCells }
    }

    default:
      throw new Error("action phải là search | read | create_doc | append_doc | replace_in_doc | create_sheet | write_sheet | append_sheet.")
  }
}

export async function runGoogleWorkspace(args: Args): Promise<{ result?: any; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: "Chưa kết nối Google — bấm nút \"Kết nối Google\" ở header Gấu Pro." }
  try {
    return { result: await run(token, args) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
