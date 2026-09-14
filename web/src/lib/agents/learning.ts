// Self-learning: phát hiện thông tin thực tế từ tin nhắn user (không phải câu hỏi) qua bất kỳ bot nào
// (Bé Gấu, Gấu Tổ...) — dùng LLM phân loại NEW/CONFLICT/CONFIRM, log chatbot_learning_log + DM creator
// qua Lark để duyệt (Gấu Pro → "review pending learning <id>"). Tách từ be-gau.ts (s196+4) khi thêm cho
// Gấu Tổ — tránh chép lại y hệt logic (đúng bài học "duplicate code" audit s195+17 từng bắt ở chỗ khác).
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin }      from "@/lib/supabase"
import { sendLarkDM }         from "@/lib/lark"

const LEARNING_COOLDOWN = 5 * 60_000
const _learningRL = new Map<string, number>()

export async function detectAndLogLearning(opts: {
  userMsg:     string
  role:        string
  userId:      string
  userName:    string
  sessionId?:  string
  sourceLabel?: string  // vd "Tổ Gấu (Nhóm ABC)" — hiện trong DM Lark để biết nguồn gốc, mặc định "Bé Gấu"
}): Promise<void> {
  const { userMsg, role, userId, userName, sessionId, sourceLabel = "Bé Gấu" } = opts
  if (!userMsg || userMsg.length < 30 || role === "creator") return
  if (userMsg.trim().endsWith("?")) return
  // Fix #5: rate-limit — 1 lần/user/5 phút để tránh spam Lark DM (dùng chung mọi nguồn: Bé Gấu + Gấu Tổ)
  const lastLog = _learningRL.get(userId)
  if (lastLog && Date.now() - lastLog < LEARNING_COOLDOWN) return
  _learningRL.set(userId, Date.now())

  try {
    // Đọc creator_kb để so sánh
    const { data: kbRows } = await supabaseAdmin
      .from("creator_kb")
      .select("key,title,content")
      .limit(50)
    const kbSummary = (kbRows || []).map((r: any) => `[${r.key}] ${r.title}: ${r.content?.slice(0, 200)}`).join("\n")

    // 1-shot LLM classify
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    // thinkingLevel "minimal": gemini-3.8-flash mặc định thinking=medium (tiêu hao token/latency ẩn) —
    // call này chỉ cần JSON 1-shot xác định, không cần suy luận sâu. SDK v0.21.0 pin cứng chưa có type
    // cho field này (ra đời sau SDK) → "as any". Xem chatbot-agents-guardian.md (bài học gemini-3.5-flash
    // thinking model cần thinkingBudget=0 mới ổn định JSON — né lặp lại đúng lớp sự cố).
    const model = genAI.getGenerativeModel({
      model: "gemini-3.8-flash",
      generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } } as any,
    })
    const prompt = `Phân tích xem câu sau của user có chứa THÔNG TIN THỰC TẾ có thể học không (không phải câu hỏi).

User (role=${role}): "${userMsg.slice(0, 500)}"

Kiến thức hiện có (creator_kb tóm tắt):
${kbSummary}

Trả JSON (KHÔNG giải thích gì khác):
{
  "should_log": true/false,
  "learning_type": "NEW" | "CONFLICT" | "CONFIRM",
  "detected_info": "mô tả ngắn thông tin user nêu",
  "existing_kb_key": "key của KB entry liên quan hoặc null",
  "conflict_detail": "mô tả mâu thuẫn hoặc null",
  "severity": "HIGH" | "MEDIUM" | "LOW"
}`

    const res = await model.generateContent(prompt)
    let raw = res.response.text().trim()
    // Bóc JSON từ markdown code block nếu có
    const jsonMatch = raw.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (jsonMatch) raw = jsonMatch[1]
    const result = JSON.parse(raw)
    if (!result.should_log) return

    // Ghi vào chatbot_learning_log
    const { data: inserted } = await supabaseAdmin.from("chatbot_learning_log").insert({
      user_id: userId, user_role: role, user_name: userName, session_id: sessionId || null,
      message_content: userMsg.slice(0, 2000),
      detected_info: result.detected_info || "",
      learning_type: result.learning_type || "NEW",
      existing_kb_key: result.existing_kb_key || null,
      conflict_detail: result.conflict_detail || null,
      severity: result.severity || "MEDIUM",
    }).select("id").single()

    const id = (inserted as any)?.id || "unknown"
    const severity = result.severity || "MEDIUM"
    const sevLabel = severity === "HIGH" ? "⚠️ CAO" : severity === "MEDIUM" ? "🔵 TB" : "🔘 THẤP"
    const typeLabel = result.learning_type === "CONFLICT" ? "❌ MÂU THUẪN" : result.learning_type === "CONFIRM" ? "✅ XÁC NHẬN" : "🆕 MỚI"

    // DM creator qua Lark — ENV → app_settings → users(role=creator).lark_open_id → hardcode
    let creatorLarkId = process.env.LARK_CREATOR_USER_ID
    if (!creatorLarkId) {
      const { data: s } = await supabaseAdmin.from("app_settings").select("value").eq("key","creator_lark_user_id").maybeSingle()
      creatorLarkId = s?.value || undefined
    }
    if (!creatorLarkId) {
      // Nguồn tin cậy nhất: open_id thật lưu trong users (đồng bộ từ Lark chat events)
      const { data: u } = await supabaseAdmin.from("users").select("lark_open_id").eq("role","creator").not("lark_open_id","is",null).limit(1).maybeSingle()
      creatorLarkId = u?.lark_open_id || "ou_e5af3c7f447984052c1c5a5c2f594127"
    }
    if (creatorLarkId) {
      const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
      let msg = `🔔 ${sourceLabel} phát hiện học liệu [${typeLabel}]\n${sevLabel}\n\n👤 User: ${userName || userId} (role: ${role})\n📅 ${now}\n💬 Nói: "${userMsg.slice(0, 200)}"\n\n🧠 Phát hiện: "${result.detected_info}"`
      if (result.learning_type === "CONFLICT" && result.existing_kb_key) {
        msg += `\n❌ Mâu thuẫn với KB[${result.existing_kb_key}]`
        if (result.conflict_detail) msg += `: ${result.conflict_detail}`
      }
      msg += `\n\n→ Mở Gấu Pro → "review pending learning ${id}" để xử lý`
      await sendLarkDM(creatorLarkId, msg)
    }
  } catch { /* learning detection không được làm chậm/break response */ }
}
