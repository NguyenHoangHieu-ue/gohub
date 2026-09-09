// Sinh nhận định ngắn (Điểm sáng/Hạn chế) cho từng kênh B2B/B2C — Gemini CHỈ diễn giải số liệu ĐÃ TÍNH SẴN,
// KHÔNG tự suy diễn nguyên nhân ngoài số cho trước (đúng pattern precompute→format của scheduled-report-data.ts).
import { GoogleGenerativeAI } from "@google/generative-ai"
import type { ChannelMoM } from "./data"
import { fmtVnd, fmtPct } from "./period"

export interface ChannelNarrative { channel: string; sentence: string }

const SYSTEM_PROMPT = `Bạn viết nhận định kinh doanh ngắn cho báo cáo tuần nội bộ công ty GoHub (dịch vụ SIM/eSIM du lịch).
Đầu vào là danh sách kênh bán kèm số liệu ĐÃ TÍNH SẴN: tên kênh, doanh thu pro-rata tháng này, %MoM so với thực tế tháng trước.
Nhiệm vụ: với MỖI kênh, viết ĐÚNG 1 câu tiếng Việt ngắn (dưới 25 từ) nhận định xu hướng — CHỈ dựa trên số liệu được cho, TUYỆT ĐỐI KHÔNG bịa thêm lý do/nguyên nhân/số liệu phụ (vd tên quốc gia, sự kiện, mùa vụ...) không có trong dữ liệu đưa vào. Văn phong khách quan, chuyên nghiệp, kiểu báo cáo quản trị.
Trả JSON THUẦN (không markdown, không code fence): {"items":[{"channel":"<tên kênh>","sentence":"<câu nhận định>"}]}`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

function fallbackSentence(c: ChannelMoM): string {
  const dir = c.pctMoM >= 0 ? "tăng trưởng" : "sụt giảm"
  return `${c.channel}: pro-rata ${fmtVnd(c.prorata)} (${fmtPct(c.pctMoM)} MoM) — ${dir} so với tháng trước.`
}

export async function generateChannelNarratives(channels: ChannelMoM[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!process.env.GEMINI_KEY || channels.length === 0) {
    channels.forEach(c => out.set(c.channel, fallbackSentence(c)))
    return out
  }

  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000, responseMimeType: "application/json" },
    })

    const input = channels.map(c => ({
      channel: c.channel,
      prorata: fmtVnd(c.prorata),
      pctMoM: fmtPct(c.pctMoM),
    }))

    const result = await model.generateContent(JSON.stringify(input))
    const parsed = JSON.parse(result.response.text().trim()) as { items?: { channel: string; sentence: string }[] }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const byName = new Map(items.map(i => [i.channel, i.sentence]))

    channels.forEach(c => out.set(c.channel, byName.get(c.channel) || fallbackSentence(c)))
  } catch {
    channels.forEach(c => out.set(c.channel, fallbackSentence(c)))
  }
  return out
}
