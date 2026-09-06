import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { GoogleGenerativeAI }         from "@google/generative-ai"

const AI_EMAIL = "ai@to-gau"
const AI_NAME  = "Gấu Tổ"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email lưu USERNAME, không phải email thật.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

// Tìm tài liệu liên quan đến câu hỏi — gộp Wiki (toàn hệ thống) + Docs/Notes của CHÍNH group này
// (trước đây chỉ tìm Wiki, nên nội dung lưu vào Docs/Notes của nhóm không có tác dụng gì với AI —
// đây là gap s194+6 yêu cầu vá: lưu tài liệu mới → AI dùng được ngay, không cần bước re-index riêng
// vì search chạy trực tiếp trên bảng sống mỗi lần hỏi).
async function searchKB(question: string, privileged: boolean, groupId: string): Promise<string> {
  const keywords = question.slice(0, 200).replace(/[^a-zA-Z0-9À-ỹ ]/g, " ")
  const words = keywords.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 4)

  let wikiQuery = supabaseAdmin
    .from("kb_wiki_pages")
    .select("title, content, page_type, is_hidden")
    .eq("status", "active")
    .limit(4)

  // User thường không thấy system/tab_guide docs
  if (!privileged) {
    wikiQuery = wikiQuery.eq("is_hidden", false).neq("page_type", "tab_guide")
  }
  if (words.length > 0) {
    wikiQuery = wikiQuery.or(words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(","))
  }

  let docsQuery = supabaseAdmin
    .from("chat_docs")
    .select("title, description")
    .eq("group_id", groupId)
    .limit(4)
  if (words.length > 0) {
    docsQuery = docsQuery.or(words.map(w => `title.ilike.%${w}%,description.ilike.%${w}%`).join(","))
  }

  let notesQuery = supabaseAdmin
    .from("chat_notes")
    .select("content, creator_name, created_at")
    .eq("group_id", groupId)
    .limit(4)
  if (words.length > 0) {
    notesQuery = notesQuery.or(words.map(w => `content.ilike.%${w}%`).join(","))
  }

  const [{ data: wikiRows }, { data: docRows }, { data: noteRows }] = await Promise.all([
    words.length > 0 ? wikiQuery : Promise.resolve({ data: [] as { title: string; content: string }[] }),
    words.length > 0 ? docsQuery : Promise.resolve({ data: [] as { title: string; description: string | null }[] }),
    words.length > 0 ? notesQuery : Promise.resolve({ data: [] as { content: string; creator_name: string | null; created_at: string }[] }),
  ])

  const sections: string[] = []
  if (wikiRows?.length) {
    sections.push(...wikiRows.map(p => {
      const body = (p.content || "").replace(/^---[\s\S]*?---\n?/, "").slice(0, 600)
      return `### [Wiki] ${p.title}\n${body}`
    }))
  }
  if (docRows?.length) {
    sections.push(...docRows.map(d => `### [Tài liệu nhóm] ${d.title}\n${d.description || "(không có mô tả)"}`))
  }
  if (noteRows?.length) {
    sections.push(...noteRows.map(n => `### [Ghi chú nhóm — ${n.creator_name || "?"}]\n${n.content.slice(0, 600)}`))
  }

  if (!sections.length) return ""
  return `\n\n---\n**TÀI LIỆU THAM KHẢO NỘI BỘ (trích nguồn khi trả lời để người hỏi kiểm chứng lại):**\n${sections.join("\n\n")}\n---`
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username   = session.user.username || ""
  const role       = session.user.role     || ""
  const privileged = isPrivileged(role)
  const { id }     = params

  if (!privileged && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const question = (body.question ?? "").trim()
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 })

  // Fetch group config
  const { data: group, error: groupErr } = await supabaseAdmin
    .from("chat_groups")
    .select("ai_enabled, ai_scope, ai_system_prompt_append")
    .eq("id", id)
    .single()

  if (groupErr || !group) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 })
  if (!group.ai_enabled)  return NextResponse.json({ error: "AI đã tắt trong nhóm này" }, { status: 403 })

  // Fetch last 20 messages (for history) + search KB — chạy song song
  const [{ data: recentMsgs }, kbContext] = await Promise.all([
    supabaseAdmin
      .from("chat_messages")
      .select("sender_email, content, msg_type")
      .eq("group_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    searchKB(question, privileged, id),
  ])

  // Reverse to chronological order
  const history = (recentMsgs ?? []).reverse()

  // Build system prompt
  const basePrompt = `Bạn là Gấu Tổ — trợ lý AI nội bộ GoHub trong nhóm chat. Trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt.

Khi trả lời:
- Ưu tiên dùng thông tin từ TÀI LIỆU THAM KHẢO NỘI BỘ nếu có
- Nếu dùng thông tin từ tài liệu tham khảo, LUÔN ghi rõ nguồn ở cuối câu trả lời theo dạng
  "(Nguồn: [Wiki] Tên trang)" hoặc "(Nguồn: [Tài liệu nhóm] Tên file)" hoặc "(Nguồn: [Ghi chú nhóm] người viết)"
  để người hỏi bấm vào tab Docs/Notes/Wiki kiểm chứng lại nguyên văn, không bịa nguồn nếu không có
- Không tiết lộ thông tin nhạy cảm (COGS, margin, chiến lược kinh doanh) trừ khi ai_scope cho phép
- Nếu không biết → nói thẳng "Em chưa có thông tin về việc này, anh/chị hỏi trực tiếp bộ phận phụ trách nhé"`

  const scopePrompt = group.ai_scope
    ? `\nGIỚI HẠN PHẠM VI: ${group.ai_scope}. Câu hỏi ngoài phạm vi → lịch sự từ chối và hướng dẫn hỏi trực tiếp.`
    : ""

  const appendPrompt = group.ai_system_prompt_append
    ? `\n${group.ai_system_prompt_append}`
    : ""

  const systemInstruction = basePrompt + scopePrompt + appendPrompt + kbContext

  // Build Gemini chat history
  const chatHistory: { role: "user" | "model"; parts: { text: string }[] }[] = []
  for (const msg of history) {
    if (!msg.content) continue
    const isAI = msg.sender_email === AI_EMAIL
    chatHistory.push({
      role:  isAI ? "model" : "user",
      parts: [{ text: msg.content }],
    })
  }

  // Call Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction,
  })

  const chat   = model.startChat({ history: chatHistory })
  const result = await chat.sendMessage(question)
  const aiText = result.response.text().trim()

  // Save AI response to chat_messages
  const { data: saved, error: saveErr } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      group_id:     id,
      sender_email: AI_EMAIL,
      sender_name:  AI_NAME,
      content:      aiText,
      msg_type:     "ai",
      attachments:  [],
    })
    .select()
    .single()

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })
  return NextResponse.json({ data: saved })
}
