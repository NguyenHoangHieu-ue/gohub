// Hàm THUẦN tách khỏi api/to-gau/groups/[id]/ai/route.ts (s196+18, đề xuất F roadmap audit Tổ Gấu
// s196+5) — cho eval harness/unit test được, không cần import trực tiếp 1 file route.ts (kéo theo
// next/server) và không cần Gemini/DB thật. Không đổi hành vi, chỉ tách vị trí.
import { supabaseAdmin } from "@/lib/supabase"

export const AI_EMAIL = "ai@to-gau"
export const AI_NAME  = "Gấu Tổ"

// Gemini bắt buộc: (1) turn ĐẦU TIÊN của history phải là "user" — lỗi thật đã gặp trên staging
// ("First content should be with role 'user', got model") khi tin nhắn cũ nhất trong N tin gần nhất
// tình cờ là câu trả lời AI; (2) role phải luân phiên user/model — group chat thật có N người nói liền
// nhau cùng role "user" không xen AI ở giữa, không tự alternate. Merge các turn liên tiếp CÙNG role
// thành 1 rồi cắt bỏ turn "model" đứng đầu để luôn thoả cả 2 điều kiện.
export function buildChatHistory(
  rawHistory: { role: "user" | "model"; text: string }[],
): { role: "user" | "model"; parts: { text: string }[] }[] {
  const chatHistory: { role: "user" | "model"; parts: { text: string }[] }[] = []
  for (const turn of rawHistory) {
    const last = chatHistory[chatHistory.length - 1]
    if (last && last.role === turn.role) {
      last.parts[0].text += `\n${turn.text}`
    } else {
      chatHistory.push({ role: turn.role, parts: [{ text: turn.text }] })
    }
  }
  while (chatHistory.length && chatHistory[0].role === "model") chatHistory.shift()
  return chatHistory
}

// "tóm tắt hộ 50 tin gần nhất" (s196+15) — nới giới hạn lịch sử khi phát hiện ý định tóm tắt.
export function isSummaryRequest(question: string): boolean {
  return /tóm tắt|tóm lược|summar/i.test(question)
}

// Tìm tài liệu liên quan đến câu hỏi — gộp Wiki (toàn hệ thống) + Docs/Notes của CHÍNH group này
// (s194+6 — trước đây chỉ tìm Wiki). Group-scoping của Docs/Notes qua `.eq("group_id", groupId)` là
// điểm nhạy cảm nhất (leak chéo group nếu quên) — test trực tiếp bằng mock ở to-gau-ai-helpers.test.ts.
export async function searchKB(question: string, privileged: boolean, groupId: string): Promise<string> {
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
