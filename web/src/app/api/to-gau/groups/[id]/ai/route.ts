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

// Tìm tài liệu KB liên quan đến câu hỏi (top 4 trang)
async function searchKB(question: string, privileged: boolean): Promise<string> {
  const keywords = question.slice(0, 200).replace(/[^a-zA-Z0-9À-ỹ ]/g, " ")

  let query = supabaseAdmin
    .from("kb_wiki_pages")
    .select("title, content, page_type, is_hidden")
    .eq("status", "active")
    .limit(4)

  // User thường không thấy system/tab_guide docs
  if (!privileged) {
    query = query.eq("is_hidden", false).neq("page_type", "tab_guide")
  }

  // Tìm theo keyword trong title hoặc content
  const words = keywords.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 4)
  if (words.length > 0) {
    const orClauses = words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(",")
    query = query.or(orClauses)
  }

  const { data } = await query
  if (!data?.length) return ""

  const snippets = data.map(p => {
    // Lấy phần body (bỏ YAML frontmatter)
    const body = (p.content || "").replace(/^---[\s\S]*?---\n?/, "").slice(0, 600)
    return `### ${p.title}\n${body}`
  })

  return `\n\n---\n**TÀI LIỆU THAM KHẢO NỘI BỘ:**\n${snippets.join("\n\n")}\n---`
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
    searchKB(question, privileged),
  ])

  // Reverse to chronological order
  const history = (recentMsgs ?? []).reverse()

  // Build system prompt
  const basePrompt = `Bạn là Gấu Tổ — trợ lý AI nội bộ GoHub trong nhóm chat. Trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt.

Khi trả lời:
- Ưu tiên dùng thông tin từ TÀI LIỆU THAM KHẢO NỘI BỘ nếu có
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
