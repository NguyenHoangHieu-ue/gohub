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
  if (!process.env.GEMINI_KEY) return null
  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
      },
    })

    const result = await model.generateContent(buildThreadText(thread))
    const text   = result.response.text().trim()
    const parsed = JSON.parse(text) as {
      is_match?: boolean
      metric?: string | null
      completion_reply_index?: number | null
      reason?: string
    }

    if (!parsed.is_match) return { is_match: false, metric: null, completion_reply_index: null, reason: parsed.reason ?? "" }

    const metric = parsed.metric === "sla" || parsed.metric === "vendor_speed" ? parsed.metric : null
    if (!metric) return { is_match: false, metric: null, completion_reply_index: null, reason: parsed.reason ?? "" }

    const idx = typeof parsed.completion_reply_index === "number" ? parsed.completion_reply_index : null
    const validIdx = idx !== null && idx >= 0 && idx < thread.replies.length ? idx : null

    return { is_match: true, metric, completion_reply_index: validIdx, reason: parsed.reason ?? "" }
  } catch {
    return null   // lỗi Gemini/parse → coi như không phân loại được, cron bỏ qua thread này lần này
  }
}
