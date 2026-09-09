// Phân loại 1 thread Lark: có phải Product Request (SLA) hay Vendor Rate Query (Vendor Selection
// Speed) không, và nếu có thì tin nào là lúc "xong việc" — dùng để tự tính SLA/Vendor Speed thay
// Hiếu nhập tay. Theo đúng convention Gemini JSON-mode của repo (xem web/src/lib/agents/classifier.ts):
// temperature 0, responseMimeType application/json, parse thủ công, fallback an toàn khi lỗi.
import { GoogleGenerativeAI } from "@google/generative-ai"
import type { LarkThread } from "./lark-thread-scan"

export interface LarkClassifyResult {
  is_match: boolean
  metric: "sla" | "vendor_speed" | null
  completion_reply_index: number | null   // index trong replies[] là tin "hoàn thành"; null = chưa xong
  reason: string
}

const SYSTEM_PROMPT = `Bạn là bộ phân loại thread trong group Lark nội bộ của team Product Ops (GoHub — dịch vụ SIM/eSIM du lịch). Nhiệm vụ: đọc 1 thread (tin gốc + các reply theo thứ tự thời gian) và xác định thread này có phải 1 trong 2 loại việc sau không:

1. "sla" — PRODUCT REQUEST / SUPPORT: đồng nghiệp (Sales/CS/BD/PIC...) nhờ Product Ops xử lý 1 việc liên quan sản phẩm, chờ Product Ops trả lời/xử lý xong mới tiếp tục được việc của họ. Gồm NHIỀU dạng, không giới hạn đúng các ví dụ sau — nếu đúng TINH THẦN "nhờ Product Ops làm/kiểm tra/xác nhận gì đó" thì match, kể cả không đúng từ khoá:
   - **Tạo/thêm/add sản phẩm**: yêu cầu tạo/thêm/add/onboard SKU, gói, sản phẩm mới (SIM/eSIM) cho 1 nước/gói chưa có trong hệ thống.
   - **Cung cấp/kiểm tra/xác nhận thông tin**: hỏi SKU/gói đã có chưa, có sẵn cho nước nào, giá/COGS/APN/chính sách data của 1 SKU, tình trạng khuyến mãi, hoặc bất kỳ câu hỏi nào cần Product Ops tra cứu rồi trả lời.
   - **Báo lỗi/sự cố sản phẩm**: sai giá, thiếu SKU, sai APN, dữ liệu lỗi cần Product Ops sửa.
   - Các dạng khác cùng bản chất "nhờ Product Ops xử lý" mà không rơi vào 3 nhóm trên vẫn match — đọc theo ngữ cảnh, đừng chỉ so khớp từ khoá cứng.
   Việc "xong" là khi Product Ops trả lời XÁC NHẬN đã tạo/kiểm tra/cung cấp xong (không phải chỉ "để anh/em kiểm tra rồi báo lại" — đó vẫn CHƯA xong, is_match vẫn true nhưng completion_reply_index=null).
2. "vendor_speed" — VENDOR RATE QUERY: hỏi so sánh giá/rate từ nhà cung cấp (3HK, Worldmove, JoyTel, CMLink...), hỏi chọn vendor nào rẻ/tốt nhất cho 1 nước/gói. Việc "xong" là khi có câu trả lời đưa ra rate/vendor cụ thể được chọn.

KHÔNG match (is_match=false) nếu: thread chỉ là chat xã giao, thông báo chung, câu hỏi không liên quan sourcing/product request, hoặc thread không có ai thật sự NHỜ Product Ops làm gì (chỉ bàn luận/thông tin chung).

Trả JSON THUẦN, không markdown:
{"is_match": true|false, "metric": "sla"|"vendor_speed"|null, "completion_reply_index": <số thứ tự reply (bắt đầu từ 0) là tin hoàn thành việc, hoặc null nếu chưa xong>, "reason": "<1 câu giải thích ngắn bằng tiếng Việt>"}

Nếu is_match=false thì metric=null và completion_reply_index=null.`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

function buildThreadText(thread: LarkThread): string {
  const lines = [`[0] (tin gốc, ${thread.sender_name}): ${thread.content}`]
  thread.replies.forEach((r, i) => lines.push(`[reply ${i}] (${r.name}): ${r.content}`))
  return lines.join("\n")
}

export async function classifyLarkThread(thread: LarkThread): Promise<LarkClassifyResult | null> {
  if (!process.env.GEMINI_KEY) {
    console.error("[Lark classify] GEMINI_KEY chưa set — bỏ qua thread", thread.message_id)
    return null
  }
  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0,
        // gemini-3.6-flash mặc định "thinking" — token ẩn đó TÍNH VÀO maxOutputTokens, ăn hết ngân sách
        // trước khi tới JSON thật → response.text() bị cắt cụt giữa chừng (root cause thật của
        // "Gemini không trả JSON", xác nhận qua raw text log s177: JSON đúng cấu trúc nhưng đứt giữa
        // field). Từng thử thinkingConfig:{thinkingBudget:0} (đúng pattern api/config/schema/
        // ai-suggest/route.ts) nhưng model NÀY trả 400 "invalid argument" với field đó — không phải
        // model nào cũng nhận thinkingBudget=0. Đổi hướng: bump maxOutputTokens đủ lớn để chứa được cả
        // thinking lẫn JSON thật, khớp đúng con số `lib/weekly-report/narrative.ts` đã dùng ổn với cùng
        // model (Hiếu xác nhận chạy thật s170(c)), không tự đoán số mới.
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
      },
    })

    const result = await model.generateContent(buildThreadText(thread))
    const text   = result.response.text().trim()
    let parsed: {
      is_match?: boolean
      metric?: string | null
      completion_reply_index?: number | null
      reason?: string
    }
    try {
      parsed = JSON.parse(text)
    } catch {
      // responseMimeType "application/json" không luôn đảm bảo text() là JSON THUẦN (từng thấy có tiền
      // tố lạ dù request đúng mime type) — cứu 1 lần bằng cách cắt substring { ... } đầu-cuối trước khi
      // bỏ cuộc. Log FULL text (không phải message lỗi JSON.parse bị cắt cụt) để lần sau còn tra được.
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) {
        console.error("[Lark classify] Gemini không trả JSON, thread", thread.message_id, "— raw text:", text.slice(0, 500))
        return null
      }
      try {
        parsed = JSON.parse(m[0])
      } catch {
        console.error("[Lark classify] Gemini trả JSON hỏng, thread", thread.message_id, "— raw text:", text.slice(0, 500))
        return null
      }
    }

    if (!parsed.is_match) return { is_match: false, metric: null, completion_reply_index: null, reason: parsed.reason ?? "" }

    const metric = parsed.metric === "sla" || parsed.metric === "vendor_speed" ? parsed.metric : null
    if (!metric) return { is_match: false, metric: null, completion_reply_index: null, reason: parsed.reason ?? "" }

    const idx = typeof parsed.completion_reply_index === "number" ? parsed.completion_reply_index : null
    const validIdx = idx !== null && idx >= 0 && idx < thread.replies.length ? idx : null

    return { is_match: true, metric, completion_reply_index: validIdx, reason: parsed.reason ?? "" }
  } catch (e: any) {
    // Lỗi Gemini/parse trước đây bị nuốt im lặng (catch rỗng) → thread biến mất không dấu vết, không
    // cách nào biết vì sao "quét thấy N mà không case nào vào hàng chờ duyệt". Log rõ để tra Vercel log.
    console.error("[Lark classify] lỗi phân loại thread", thread.message_id, "chat", thread.chat_id, ":", e?.message ?? e)
    return null
  }
}
