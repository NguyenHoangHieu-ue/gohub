import { ThinkingLevel } from "@google/genai"
import { supabaseAdmin } from "@/lib/supabase"
import { GEMINI_MODEL } from "@/lib/ai-models"
import { embedText } from "@/lib/kb"
import { genai } from "@/lib/agents/genai-stream"
import { runAssistantMemory, MEMORY_KINDS } from "@/lib/assistant-memory"

// Gấu Pro G3 — trí nhớ 2 tầng (docs/plans/gau-pro-assistant.md):
//   1) tự rút điều đáng nhớ sau mỗi lượt (bổ sung cho việc model tự gọi assistantMemory);
//   2) tóm tắt + embedding từng hội thoại (bảng gp_conversation_memory, migration v66) → searchPastConversations.
// Khung đa người dùng theo username; BẬT cho ai do cờ app_settings.gp_personal_features quyết định (hiện mặc định chỉ creator).

let _flag: { v: string; at: number } | null = null
/** "all" = mọi user Gấu Pro; khác/không có = chỉ creator. Cache 60s. */
export async function personalFeaturesEnabled(isCreator: boolean): Promise<boolean> {
  if (isCreator) return true
  if (!_flag || Date.now() - _flag.at > 60_000) {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "gp_personal_features").maybeSingle()
    _flag = { v: String(data?.value ?? "creator"), at: Date.now() }
  }
  return _flag.v === "all"
}

async function jsonCall<T>(prompt: string): Promise<T | null> {
  try {
    const r = await genai().models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    })
    return JSON.parse(r.text ?? "null") as T
  } catch (e) {
    console.error("[assistant-memory-auto] gọi model lỗi:", (e as Error).message)
    return null
  }
}

/**
 * Rút trí nhớ từ 1 lượt. CHỈ lấy điều NGƯỜI DÙNG tự nói (câu trả lời của bot chỉ để hiểu ngữ cảnh) — bot có thể vừa đọc nội dung
 * web/tài liệu không tin cậy, rút từ đó dễ bị "đầu độc" trí nhớ. Tối đa 2 mục/lượt, có so trùng với trí nhớ hiện có.
 */
export async function extractMemoriesFromTurn(username: string, userMsg: string, assistantMsg: string, source: string): Promise<number> {
  const msg = userMsg.trim()
  if (msg.length < 25 || msg.startsWith("[Đã ")) return 0          // câu ngắn / câu nối sau khi duyệt hành động
  const existing = await runAssistantMemory({ action: "list" }, username, source)
  if (existing.error) return 0
  const mems = ((existing.result?.memories ?? []) as { id: number; kind: string; content: string }[]).slice(0, 120)

  const out = await jsonCall<{ save?: { kind: string; content: string }[]; update?: { id: number; content: string }[] }>(
`Bạn quản lý trí nhớ dài hạn của trợ lý cho 1 người dùng. Đọc TIN NHẮN NGƯỜI DÙNG (câu trả lời của bot chỉ để hiểu ngữ cảnh,
KHÔNG lấy thông tin từ đó). Chỉ rút điều ĐÁNG NHỚ LÂU DÀI do chính người dùng nói: hồ sơ/vai trò, sở thích cách làm việc, dự án
đang theo, người liên quan (ai là ai, phụ trách gì), quyết định đã chốt. KHÔNG rút: câu hỏi tra cứu số liệu, việc chỉ dùng 1 lần,
mật khẩu/token/thông tin nhạy cảm, điều đã có trong trí nhớ hiện có (nếu là bản cập nhật của 1 mục cũ → dùng update với id).
Hầu hết lượt KHÔNG có gì đáng nhớ → trả {"save":[],"update":[]}. Tối đa 2 mục. Mỗi content ≤ 200 ký tự, tiếng Việt, kèm mốc thời gian nếu có.
kind ∈ ${MEMORY_KINDS.join("|")}.
Trả JSON: {"save":[{"kind":"...","content":"..."}],"update":[{"id":123,"content":"..."}]}

TRÍ NHỚ HIỆN CÓ:
${mems.map(m => `[#${m.id}] (${m.kind}) ${m.content}`).join("\n") || "(trống)"}

TIN NHẮN NGƯỜI DÙNG:
${msg.slice(0, 3000)}

CÂU TRẢ LỜI CỦA BOT (chỉ để hiểu ngữ cảnh):
${assistantMsg.slice(0, 1500)}`)
  if (!out) return 0
  let n = 0
  for (const s of (out.save ?? []).slice(0, 2)) {
    if (!s?.content) continue
    const r = await runAssistantMemory({ action: "save", kind: s.kind, content: s.content }, username, `auto-${source}`)
    if (!r.error) n++
  }
  for (const u of (out.update ?? []).slice(0, 2)) {
    if (!u?.id || !u.content || !mems.some(m => m.id === u.id)) continue
    const r = await runAssistantMemory({ action: "update", id: u.id, content: u.content }, username, `auto-${source}`)
    if (!r.error) n++
  }
  return n
}

/** Tóm tắt + embedding 1 hội thoại web. Chỉ làm lại khi có thêm ≥4 tin so với lần trước (đỡ gọi model mỗi lượt). */
export async function summarizeConversation(username: string, conversationId: string): Promise<void> {
  const [{ data: msgs }, { data: prev }, { data: conv }] = await Promise.all([
    supabaseAdmin.from("chat_messages").select("role,content").eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(80),
    supabaseAdmin.from("gp_conversation_memory").select("message_count").eq("conversation_id", conversationId).maybeSingle(),
    supabaseAdmin.from("conversations").select("title").eq("id", conversationId).maybeSingle(),
  ])
  const count = msgs?.length ?? 0
  if (count < 4 || (prev && count - (prev.message_count as number) < 4)) {
    console.log(`[gp_conv_mem] bỏ qua ${conversationId}: ${count} tin (lần trước ${prev?.message_count ?? 0})`)
    return
  }

  const text = (msgs ?? []).map(m => `[${m.role}] ${String(m.content).slice(0, 1200)}`).join("\n").slice(0, 30_000)
  const out = await jsonCall<{ summary: string }>(
`Tóm tắt hội thoại sau giữa người dùng và trợ lý Gấu Pro để sau này TÌM LẠI được: chủ đề, con số/mã/tên quan trọng, kết luận và
quyết định đã chốt, việc còn dở. Tối đa 120 từ tiếng Việt. Trả JSON {"summary":"..."}.

${text}`)
  const summary = out?.summary?.trim()
  if (!summary) return
  const embedding = await embedText(`${conv?.title ?? ""}\n${summary}`)
  const { error } = await supabaseAdmin.from("gp_conversation_memory").upsert({
    conversation_id: conversationId, username, title: (conv?.title as string) ?? null, summary,
    message_count: count, embedding, updated_at: new Date().toISOString(),
  })
  if (error && !/gp_conversation_memory/.test(error.message)) console.error("[gp_conv_mem]", error.message)
}

/** Tool searchPastConversations: tìm hội thoại cũ theo ý nghĩa, trả tóm tắt + link mở lại. */
export async function searchPastConversations(username: string, query: string): Promise<any> {
  if (!query?.trim()) return { error: "Cần query." }
  const embedding = await embedText(query)
  const { data, error } = await supabaseAdmin.rpc("match_gp_conversations", { query_embedding: embedding, p_username: username, match_count: 5 })
  if (error) return { error: /match_gp_conversations|gp_conversation_memory/.test(error.message)
    ? "Chưa có bảng trí nhớ hội thoại — Hiếu cần chạy migration web/db/migrations/v66_gp_conversation_memory.sql." : error.message }
  const rows = ((data ?? []) as any[]).filter(r => r.similarity >= 0.45)
  if (!rows.length) return { results: [], message: "Không tìm thấy hội thoại cũ nào liên quan." }
  return {
    results: rows.map(r => ({
      title: r.title, summary: r.summary, date: String(r.updated_at).slice(0, 10),
      similarity: Math.round(r.similarity * 100) / 100,
      link: `/analytics/creator/ai?c=${r.conversation_id}`,
    })),
    instruction: "Trả lời dựa trên tóm tắt, ghi rõ ngày và kèm link dạng [tiêu đề](link) để người dùng mở lại hội thoại.",
  }
}
