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

async function isMember(groupId: string, email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", email)
    .maybeSingle()
  return !!data
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email   = session.user.email || ""
  const role    = session.user.role  || ""
  const { id }  = params

  if (!isPrivileged(role) && !(await isMember(id, email))) {
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

  // Fetch last 20 messages (for history)
  const { data: recentMsgs } = await supabaseAdmin
    .from("chat_messages")
    .select("sender_email, content, msg_type")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Reverse to chronological order
  const history = (recentMsgs ?? []).reverse()

  // Build system prompt
  const basePrompt = `Bạn là trợ lý AI trong nhóm chat nội bộ GoHub. Trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt.
Không tiết lộ thông tin nội bộ nhạy cảm (COGS, margin, chiến lược kinh doanh) trừ khi được cho phép.`

  const scopePrompt = group.ai_scope
    ? `\nGIỚI HẠN PHẠM VI: ${group.ai_scope}. Nếu câu hỏi ngoài phạm vi này, lịch sự từ chối và hướng dẫn hỏi trực tiếp Hiếu.`
    : ""

  const appendPrompt = group.ai_system_prompt_append
    ? `\n${group.ai_system_prompt_append}`
    : ""

  const systemInstruction = basePrompt + scopePrompt + appendPrompt

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
    model: "gemini-3.6-flash",
    systemInstruction,
  })

  const chat = model.startChat({ history: chatHistory })
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
