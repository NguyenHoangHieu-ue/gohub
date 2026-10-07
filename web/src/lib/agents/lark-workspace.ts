// Bé Gấu "mức A" (Hiếu chốt s227d): tạo Doc / Sheet / task trong Lark cho NGƯỜI ĐANG HỎI bằng token của BOT — không cần
// người dùng kết nối thêm gì, chỉ cần lark_open_id (lưu khi đăng nhập bằng Lark). File tạo xong được chuyển quyền sở hữu
// cho người hỏi (nằm trong Lark của họ); không chuyển được thì cấp quyền sửa. Bot KHÔNG đọc/sửa file riêng của họ.
// Thứ tự theo yêu cầu Hiếu: DM báo trước → làm → DM kèm link (câu trả lời cũng phải có link).
import { SchemaType } from "@google/generative-ai"
import { getLarkToken, sendLarkDM } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"
import { runLarkDocsWithToken } from "./creator/tools/lark-docs"
import { dueMs } from "./creator/tools/lark"

const L = "https://open.larksuite.com/open-apis"

export const larkWorkspaceDecl = {
  name: "larkWorkspace",
  description: "Tạo tài liệu (Lark Docs), bảng tính (Lark Sheets) hoặc việc cần làm (Lark Task) trong Lark CỦA NGƯỜI ĐANG HỎI. Dùng khi họ nhờ làm báo cáo/tài liệu/file trong Lark, đưa bảng số liệu vào Lark Sheets, hoặc tạo task/nhắc việc cho chính họ. Người hỏi được nhắn Lark báo trước và nhận link khi xong. Kết quả có `link` — BẮT BUỘC đưa link vào câu trả lời.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: { type: SchemaType.STRING, description: "create_doc | create_sheet | create_task" },
      title: { type: SchemaType.STRING, description: "Tên tài liệu / bảng tính / việc" },
      content: { type: SchemaType.STRING, description: "create_doc: nội dung markdown đầy đủ (tiêu đề #, bảng markdown, danh sách). create_task: mô tả việc." },
      values_json: { type: SchemaType.STRING, description: "create_sheet: mảng 2 chiều JSON, dòng đầu là tiêu đề cột. Số để dạng số thô (không dấu phân cách)." },
      due: { type: SchemaType.STRING, description: "create_task: hạn, dạng YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm (giờ Việt Nam)" },
    },
    required: ["action", "title"],
  },
}

type Args = { action?: string; title?: string; content?: string; values_json?: string; due?: string }

async function lk(token: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${L}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) throw new Error(`Lark API ${d.code}: ${d.msg}`)
  return d.data ?? d
}

async function giveToUser(token: string, fileToken: string, type: "docx" | "sheet", openId: string): Promise<"owner" | "editor"> {
  try {
    await lk(token, `/drive/v1/permissions/${fileToken}/members/transfer_owner?type=${type}&need_notification=false&remove_old_owner=false`,
      { member_type: "openid", member_id: openId })
    return "owner"
  } catch {
    await lk(token, `/drive/v1/permissions/${fileToken}/members?type=${type}&need_notification=false`,
      { member_type: "openid", member_id: openId, perm: "full_access" })
    return "editor"
  }
}

/** open_id Lark của người dùng web (username hoặc email đăng nhập) — null nếu chưa từng đăng nhập bằng Lark. */
export async function larkOpenIdOf(identity: string | null | undefined): Promise<string | null> {
  if (!identity) return null
  const col = identity.includes("@") ? "email" : "username"
  const { data } = await supabaseAdmin.from("users").select("lark_open_id").eq(col, identity).maybeSingle()
  return (data?.lark_open_id as string | null) ?? null
}

const LABEL: Record<string, string> = { create_doc: "tài liệu", create_sheet: "bảng tính", create_task: "việc cần làm" }

export async function runLarkWorkspace(a: Args, openId: string | null): Promise<Record<string, unknown>> {
  const label = LABEL[a.action ?? ""]
  if (!label) return { error: "action phải là create_doc | create_sheet | create_task" }
  if (!a.title?.trim()) return { error: "Thiếu title" }
  if (!openId) return { error: "Tài khoản này chưa liên kết Lark — đăng nhập GoHub Intel bằng Lark một lần để Bé Gấu tạo được file/task cho bạn." }
  const title = a.title.trim()

  await sendLarkDM(openId, `🐻 Bé Gấu nhận yêu cầu tạo ${label} **${title}**. Em đang làm, xong em gửi link ở đây nhé.`)
  try {
    const token = await getLarkToken()
    let link: string | undefined
    let access: "owner" | "editor" | "assignee"
    if (a.action === "create_task") {
      const body: Record<string, unknown> = { summary: title, members: [{ id: openId, type: "user", role: "assignee" }] }
      if (a.content) body.description = a.content
      if (a.due) body.due = { timestamp: dueMs(a.due), is_all_day: !/T\d{2}:\d{2}/.test(a.due) }
      const d = await lk(token, "/task/v2/tasks?user_id_type=open_id", body)
      link = d.task?.url
      access = "assignee"
    } else {
      const isDoc = a.action === "create_doc"
      if (isDoc && !a.content?.trim()) return { error: "create_doc cần content (markdown)" }
      if (!isDoc && !a.values_json) return { error: "create_sheet cần values_json" }
      const r = await runLarkDocsWithToken(token, isDoc
        ? { action: "create_doc", title, content: a.content }
        : { action: "create_sheet", title, values_json: a.values_json })
      link = r.link
      access = await giveToUser(token, r.token, isDoc ? "docx" : "sheet", openId)
    }
    const where = access === "owner" ? "nằm trong Lark của anh/chị" : access === "editor" ? "đã chia sẻ quyền sửa cho anh/chị" : "đã giao cho anh/chị"
    await sendLarkDM(openId, `✅ Đã tạo ${label} **${title}** (${where}).${link ? `\n[Mở ${label}](${link})` : ""}`)
    return { ok: true, title, link: link ?? null, access, note: link ? "Đưa link này vào câu trả lời." : "Lark không trả link — báo người dùng mở Lark để xem." }
  } catch (e) {
    const msg = (e as Error).message
    await sendLarkDM(openId, `⚠️ Bé Gấu chưa tạo được ${label} **${title}**: ${msg}`)
    return { error: msg }
  }
}
