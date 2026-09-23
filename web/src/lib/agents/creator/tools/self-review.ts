import { GoogleGenerativeAI } from "@google/generative-ai"
import { GEMINI_MODEL } from "@/lib/ai-models"

// Second-opinion pass (ý tưởng #7, roadmap audit s196+5) — 1 lượt Gemini ĐỘC LẬP (không thấy lịch sử
// hội thoại/tool-call trước đó) phản biện lại số liệu trước khi Gấu Pro trình bày báo cáo quan trọng.
// "Thử nghiệm giới hạn": chỉ nên gọi cho báo cáo/số liệu lớn (system prompt hướng dẫn), không phải mọi
// câu — thêm 1 Gemini call = thêm latency/cost. Đo hiệu quả thật qua eval harness (gau-pro-grade.test.ts)
// trước khi quyết định có ép gọi bắt buộc cho mọi report hay không.
const REVIEW_PROMPT = `Bạn là kiểm toán viên độc lập, HOÀI NGHI, KHÔNG thấy quá trình tính toán trước đó
— chỉ thấy SQL + số liệu được đưa cho bạn xem lại. Nhiệm vụ: tìm RỦI RO CỤ THỂ nếu có, ví dụ:
- JOIN có thể nhân dòng (nhiều dòng khớp 1 phía) làm phóng đại số liệu
- thiếu điều kiện cutoff ngày (dữ liệu gohub_dw chỉ đúng tới CURRENT_DATE-1)
- nhầm đơn vị VND/USD, nhầm dấu (revenue phải dương, cost thường âm khi trừ)
- con số phi thực tế so quy mô GoHub thật (doanh thu tháng thường ~1-5 tỷ VND, quý ~5-15 tỷ, năm ~20-60 tỷ)
- quên loại tài khoản nội bộ (B2C Customer US/VN/B2B Ops) khi phân tích theo khách hàng
Nếu KHÔNG thấy vấn đề gì rõ ràng, trả ĐÚNG câu: "Không phát hiện vấn đề." Nếu có, nêu ngắn gọn tối đa 3
gạch đầu dòng, mỗi dòng 1 câu. KHÔNG lặp lại toàn bộ số liệu, chỉ nói phần nghi ngờ.`

export async function runVerifyReportNumbers(args: { summary: string; sql?: string }): Promise<any> {
  if (!args?.summary?.trim()) return { error: "summary là bắt buộc — mô tả ngắn số liệu/kết luận cần kiểm tra." }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: REVIEW_PROMPT,
      generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "low" } } as any,
    })
    const payload = `SQL đã dùng (nếu có):\n${args.sql || "(không có — dữ liệu từ Supabase/nguồn khác)"}\n\nSố liệu/kết luận cần xem lại:\n${args.summary}`
    const res = await model.generateContent(payload)
    return { review: res.response.text().trim() }
  } catch (e: any) {
    return { error: e.message, review: "Không chạy được lượt phản biện (bỏ qua, không chặn câu trả lời chính)." }
  }
}
