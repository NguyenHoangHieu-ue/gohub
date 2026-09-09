// Ghi real-time mọi tin nhắn Lark liên quan Hiếu (tự gửi HOẶC được @mention) vào
// okr_lark_message_log — thay cơ chế quét REST 1 group cấu hình tay trước đây (s167, 0 case cả quý
// vì giới hạn đúng 1 group). Học theo Hieu/lark-sla-bot: bot chỉ cần biết "tin này có liên quan mình
// không", không quan tâm group nào — miễn bot có mặt trong group đó (Lark chỉ gửi event cho group bot
// là thành viên, KHÔNG có cách nào bỏ qua giới hạn này — Hiếu cần tự add bot vào các group liên quan).
//
// Gọi từ api/lark/events/route.ts NGAY SAU khi parse xong userText/mentions, TRƯỚC bước lọc "group
// phải @mention BOT mới trả lời" — vì đây là 2 mối quan tâm khác nhau (bot có nên TRẢ LỜI không, vs
// tin này có nên GHI LẠI để tính SLA không). Fire-and-forget — lỗi ở đây KHÔNG được làm hỏng luồng
// Bé Gấu chính, cùng mức rủi ro chấp nhận được như 2 chỗ fire-and-forget khác đã có sẵn trong file đó.
import { supabaseAdmin } from "@/lib/supabase"
import { getLarkUserOpenId } from "@/lib/lark"

export interface OkrCaptureInput {
  messageId: string
  rootId?: string
  parentId?: string
  chatId: string
  chatType: string
  msgType: string
  senderOpenId: string
  content: string
  mentionOpenIds: string[]   // đã gộp cả msg.mentions (Lark API) lẫn postMentions (parse content)
  createTime: string         // ms epoch string, gốc từ Lark
}

export async function captureForOkrLog(input: OkrCaptureInput): Promise<void> {
  try {
    const myOpenId = await getLarkUserOpenId()
    if (!myOpenId) return   // Hiếu chưa kết nối Lark cá nhân (Creator Settings → Kết nối Lark) → không biết "mình" là ai, bỏ qua an toàn

    const isSelf = input.senderOpenId === myOpenId
    const isMentioned = input.mentionOpenIds.includes(myOpenId)
    if (!isSelf && !isMentioned) return

    const { error } = await supabaseAdmin.from("okr_lark_message_log").upsert({
      message_id:         input.messageId,
      thread_id:           input.rootId || input.messageId,
      parent_id:           input.parentId || null,
      chat_id:             input.chatId,
      chat_type:           input.chatType,
      sender_open_id:      input.senderOpenId,
      is_self_post:        isSelf,
      mentioned_open_ids:   input.mentionOpenIds,
      message_type:         input.msgType,
      content:              input.content.slice(0, 2000),
      create_time_ms:       Number(input.createTime) || Date.now(),
    }, { onConflict: "message_id" })
    if (error) console.error("[okr-lark-capture] upsert failed:", error.message)
  } catch (e: any) {
    console.error("[okr-lark-capture] error:", e?.message)
  }
}
