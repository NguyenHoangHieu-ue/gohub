import { SchemaType } from "@google/generative-ai"
import { genai } from "./genai-stream"
import { GEMINI_DEEP_RESEARCH_AGENT } from "@/lib/ai-models"
import { createJob, triggerJobRun } from "./creator/jobs"

// U3 tool Bé Gấu: nghiên cứu sâu trên web (tính năng "deep_research" theo vai trò). Chỉ gửi CÂU HỎI ra ngoài — không kèm dữ liệu nội bộ.
// Tạo phiên Deep Research chạy ngầm phía Google + 1 việc nền gp_jobs hỏi trạng thái; xong lưu hội thoại "🔎 …" + nhắn Lark.
export const deepResearchDecl = {
  name: "deepResearch",
  description: "Giao 1 việc NGHIÊN CỨU SÂU trên web (nhiều nguồn, ra báo cáo có trích nguồn, mất ~2–20 phút, chạy nền). Dùng khi người dùng nhờ nghiên cứu/tìm hiểu kỹ thị trường, đối thủ, xu hướng, quy định bên ngoài. KHÔNG dùng cho số liệu nội bộ GoHub (dùng công cụ dữ liệu) hay câu tra cứu nhanh (dùng webSearch). KHÔNG đưa số liệu/tên khách nội bộ vào câu hỏi.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { question: { type: SchemaType.STRING, description: "Câu hỏi nghiên cứu đầy đủ, tự đủ nghĩa, tiếng Việt." } },
    required: ["question"],
  },
}

export async function runDeepResearch(a: any, ctx: { username: string; ownerName: string; isCreator: boolean; origin: string }) {
  const question = String(a?.question ?? "").trim()
  if (question.length < 15) return { error: "Câu hỏi nghiên cứu quá ngắn — mô tả đầy đủ cần tìm hiểu gì." }
  const input = `${question}\n\n(Bối cảnh: người hỏi làm ở GoHub — công ty Việt Nam bán SIM/eSIM du lịch quốc tế. Viết báo cáo bằng tiếng Việt, kết luận trước, có trích nguồn.)`
  const it: any = await genai().interactions.create({ agent: GEMINI_DEEP_RESEARCH_AGENT, input, background: true } as any)
  const { job, error } = await createJob({ username: ctx.username, isCreator: ctx.isCreator, prompt: question,
    state: { agent: "deep-research", ownerName: ctx.ownerName, interactionId: it.id } })
  if (!job) { await genai().interactions.cancel(it.id).catch(() => {}); return { error } }
  await triggerJobRun(ctx.origin, job.id)
  return { started: true, message: "Đã giao nghiên cứu sâu (chạy nền ~2–20 phút). Xong sẽ nhắn Lark và lưu thành cuộc trò chuyện \"🔎 …\" trong Lịch sử. Báo người dùng đúng như vậy, KHÔNG tự trả lời thay." }
}
