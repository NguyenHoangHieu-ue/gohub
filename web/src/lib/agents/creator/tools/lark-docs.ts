import { getLarkUserToken } from "@/lib/lark"

// Tool larkDocs (Gấu Pro, creator-only): tìm/đọc/tạo/ghi tài liệu Lark (Docs mới "docx", Sheets, Wiki) bằng user token
// của creator — chỉ thấy đúng những gì tài khoản Lark của họ thấy. Scope cần trong app + xin ở OAuth start:
// drive:drive, docx:document, docx:document.block:convert, sheets:spreadsheet, wiki:wiki.
const L = "https://open.larksuite.com/open-apis"
const MAX_TEXT = 60_000
const MAX_BLOCKS_PER_CALL = 1000

type Args = {
  action: string
  query?: string
  url_or_token?: string
  title?: string
  content?: string
  range?: string
  values_json?: string
}

type Ref = { type: "docx" | "sheet" | "wiki" | "unknown"; token: string }

async function lk(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${L}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) throw new Error(`Lark API ${d.code}: ${d.msg}`)
  return d.data ?? d
}

// Nhận link dán vào (…/docx/<id>, …/sheets/<id>, …/wiki/<id>) hoặc token trần.
export function parseLarkRef(input: string): Ref {
  const m = input.match(/\/(docx|docs|sheets|wiki)\/([A-Za-z0-9]+)/)
  if (m) return { type: m[1] === "sheets" ? "sheet" : m[1] === "wiki" ? "wiki" : "docx", token: m[2] }
  return { type: "unknown", token: input.trim() }
}

// Wiki node → tài liệu thật bên dưới (docx/sheet).
async function resolveRef(token: string, ref: Ref): Promise<Ref> {
  if (ref.type !== "wiki") return ref
  const d = await lk(token, `/wiki/v2/spaces/get_node?token=${encodeURIComponent(ref.token)}`)
  const n = d.node ?? {}
  return { type: n.obj_type === "sheet" ? "sheet" : n.obj_type === "docx" ? "docx" : "unknown", token: n.obj_token }
}

async function docUrl(token: string, docToken: string, docType: "docx" | "sheet"): Promise<string | undefined> {
  try {
    const d = await lk(token, "/drive/v1/metas/batch_query", {
      method: "POST", body: JSON.stringify({ request_docs: [{ doc_token: docToken, doc_type: docType }], with_url: true }),
    })
    return d.metas?.[0]?.url
  } catch { return undefined }
}

function parseValues(json?: string): unknown[][] {
  if (!json) throw new Error("Thiếu values_json (mảng 2 chiều JSON).")
  const v = JSON.parse(json)
  if (!Array.isArray(v) || !v.every(Array.isArray)) throw new Error("values_json phải là mảng 2 chiều.")
  return v
}

const colLetter = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }

async function firstSheetId(token: string, sheetToken: string): Promise<string> {
  const d = await lk(token, `/sheets/v3/spreadsheets/${sheetToken}/sheets/query`)
  const id = d.sheets?.[0]?.sheet_id
  if (!id) throw new Error("Sheet không có trang tính nào.")
  return id
}

// range người dùng đưa có thể thiếu sheetId ("A1:D10") → gắn sheet đầu tiên.
async function fullRange(token: string, sheetToken: string, range: string | undefined, fallback: string): Promise<string> {
  const r = range || fallback
  return r.includes("!") ? r : `${await firstSheetId(token, sheetToken)}!${r}`
}

// Markdown → block docx (API convert) → chèn vào cuối tài liệu theo lô ≤1000 block.
async function appendMarkdown(token: string, documentId: string, markdown: string): Promise<number> {
  const conv = await lk(token, "/docx/v1/documents/blocks/convert", {
    method: "POST", body: JSON.stringify({ content_type: "markdown", content: markdown }),
  })
  const blocks: any[] = (conv.blocks ?? []).map((b: any) => {
    if (b.table?.property?.merge_info) delete b.table.property.merge_info   // read-only, gửi lên sẽ lỗi (docs)
    return b
  })
  const byId = new Map(blocks.map(b => [b.block_id, b]))
  const subtree = (id: string): any[] => {
    const b = byId.get(id)
    return b ? [b, ...(b.children ?? []).flatMap(subtree)] : []
  }
  let inserted = 0
  let batchIds: string[] = []
  let batch: any[] = []
  const flush = async () => {
    if (!batchIds.length) return
    await lk(token, `/docx/v1/documents/${documentId}/blocks/${documentId}/descendant?document_revision_id=-1`, {
      method: "POST", body: JSON.stringify({ children_id: batchIds, descendants: batch, index: -1 }),
    })
    inserted += batch.length
    batchIds = []; batch = []
  }
  for (const id of conv.first_level_block_ids ?? []) {
    const tree = subtree(id)
    if (batch.length + tree.length > MAX_BLOCKS_PER_CALL) await flush()
    batchIds.push(id); batch.push(...tree)
  }
  await flush()
  return inserted
}

async function run(token: string, a: Args): Promise<any> {
  switch (a.action) {
    case "search": {
      if (!a.query) throw new Error("search cần query.")
      const d = await lk(token, "/suite/docs-api/search/object", {
        method: "POST", body: JSON.stringify({ search_key: a.query, count: 20, offset: 0 }),
      })
      return { total: d.total, files: (d.docs_entities ?? []).map((e: any) => ({ token: e.docs_token, type: e.docs_type, title: e.title })) }
    }

    case "read": {
      if (!a.url_or_token) throw new Error("read cần url_or_token.")
      const ref = await resolveRef(token, parseLarkRef(a.url_or_token))
      if (ref.type === "sheet") {
        const range = await fullRange(token, ref.token, a.range, "A1:Z300")
        const d = await lk(token, `/sheets/v2/spreadsheets/${ref.token}/values/${encodeURIComponent(range)}`)
        return { type: "sheet", token: ref.token, range: d.valueRange?.range, values: d.valueRange?.values ?? [] }
      }
      // docx (hoặc token trần không rõ loại → thử docx)
      const d = await lk(token, `/docx/v1/documents/${ref.token}/raw_content`)
      const text = String(d.content ?? "")
      return { type: "docx", token: ref.token, content: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…(cắt bớt, dài ${text.length} ký tự)` : text }
    }

    case "create_doc": {
      if (!a.title) throw new Error("create_doc cần title.")
      const d = await lk(token, "/docx/v1/documents", { method: "POST", body: JSON.stringify({ title: a.title }) })
      const id = d.document?.document_id
      const blocks = a.content ? await appendMarkdown(token, id, a.content) : 0
      return { token: id, title: a.title, blocks, link: await docUrl(token, id, "docx") }
    }

    case "append_doc": {
      if (!a.url_or_token || !a.content) throw new Error("append_doc cần url_or_token + content.")
      const ref = await resolveRef(token, parseLarkRef(a.url_or_token))
      if (ref.type === "sheet") throw new Error("Đây là Sheet — dùng append_sheet.")
      const blocks = await appendMarkdown(token, ref.token, a.content)
      return { token: ref.token, appended_blocks: blocks, link: await docUrl(token, ref.token, "docx") }
    }

    case "create_sheet": {
      if (!a.title) throw new Error("create_sheet cần title.")
      const d = await lk(token, "/sheets/v3/spreadsheets", { method: "POST", body: JSON.stringify({ title: a.title }) })
      const sheetToken = d.spreadsheet?.spreadsheet_token
      if (a.values_json) {
        const values = parseValues(a.values_json)
        const sid = await firstSheetId(token, sheetToken)
        const cols = Math.max(...values.map(r => r.length), 1)
        await lk(token, `/sheets/v2/spreadsheets/${sheetToken}/values`, {
          method: "PUT", body: JSON.stringify({ valueRange: { range: `${sid}!A1:${colLetter(cols - 1)}${values.length}`, values } }),
        })
      }
      return { token: sheetToken, title: a.title, link: d.spreadsheet?.url ?? await docUrl(token, sheetToken, "sheet") }
    }

    case "write_sheet":
    case "append_sheet": {
      if (!a.url_or_token) throw new Error(`${a.action} cần url_or_token.`)
      const ref = await resolveRef(token, parseLarkRef(a.url_or_token))
      const values = parseValues(a.values_json)
      const cols = Math.max(...values.map(r => r.length), 1)
      const range = await fullRange(token, ref.token, a.range, `A1:${colLetter(cols - 1)}${values.length}`)
      const append = a.action === "append_sheet"
      const d = await lk(token, `/sheets/v2/spreadsheets/${ref.token}/${append ? "values_append?insertDataOption=INSERT_ROWS" : "values"}`, {
        method: append ? "POST" : "PUT", body: JSON.stringify({ valueRange: { range, values } }),
      })
      return { token: ref.token, updated: d.updates?.updatedRange ?? d.updatedRange, cells: d.updates?.updatedCells ?? d.updatedCells, link: await docUrl(token, ref.token, "sheet") }
    }

    default:
      throw new Error("action phải là search | read | create_doc | append_doc | create_sheet | write_sheet | append_sheet.")
  }
}

export async function runLarkDocs(args: Args): Promise<{ result?: any; error?: string }> {
  const token = await getLarkUserToken()
  if (!token) return { error: "Chưa kết nối Lark — bấm \"Kết nối Lark\" ở header Gấu Pro." }
  try {
    return { result: await run(token, args) }
  } catch (e) {
    const msg = (e as Error).message
    // 99991679 = token thiếu scope user — thường do app vừa thêm quyền nhưng chưa cấp quyền lại.
    return { error: /99991679/.test(msg) ? `${msg} → Bấm badge "Đã kết nối Lark" ở Gấu Pro để cấp quyền lại (app đã bật quyền mới).` : msg }
  }
}
