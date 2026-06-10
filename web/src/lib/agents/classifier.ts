import { GoogleGenerativeAI } from "@google/generative-ai"
import type { AgentId } from "./types"

export type IntentType =
  | "product_search"
  | "product_lookup"
  | "system_explain"
  | "price_cogs"
  | "gap_analysis"

export interface ClassifyResult {
  intent:     IntentType
  country?:   string
  sim_type?:  "esim" | "sim"
  confidence: number
}

const INTENT_TO_AGENT: Record<IntentType, AgentId> = {
  product_search: "tu-van",
  product_lookup: "tra-cuu",
  system_explain: "giai-dap",
  price_cogs:     "tra-cuu",
  gap_analysis:   "gap-analysis",
}

const SYSTEM_PROMPT = `Bạn là bộ phân loại (classifier) cho hệ thống quản lý Sim/eSim GoHub.

Phân tích tin nhắn người dùng và trả về JSON (chỉ JSON thuần, không có markdown, không có text khác).

INTENT TYPES (chọn 1):
- product_search: hỏi tìm/đề xuất gói cước theo nước/ngày/GB. Ví dụ: "đi Nhật có gói nào", "tìm eSIM Thái 7 ngày", "có gói unlimited không"
- product_lookup: tra cứu mã cụ thể (SKU 13 ký tự, Product code 8 ký tự, listing code, item code). Ví dụ: "tra mã 1CJPNWM1010014", "thông tin SKU này", "APN của gói X"
- system_explain: giải thích thuật ngữ, cấu trúc mã, chính sách, hệ thống. Ví dụ: "KYC là gì", "throttle nghĩa là gì", "cấu trúc mã SKU", "data policy"
- price_cogs: hỏi giá vốn, COGS, tỷ giá, lợi nhuận. Ví dụ: "COGS bao nhiêu", "giá nhập", "tỷ giá USD VND"
- gap_analysis: so sánh catalog NCC (WorldMove/3HK) với hệ thống GoHub. Ví dụ: "WM có gì chưa import", "gap analysis", "NCC chưa tạo", "so sánh NCC"

COUNTRY: Tên tiếng Anh (ví dụ: "Japan", "Thailand", "South Korea"). Trả về null nếu không đề cập nước nào.
SIM_TYPE: "esim" hoặc "sim". Trả về null nếu không đề cập.

OUTPUT FORMAT:
{"intent":"<intent>","country":<"Country Name" hoặc null>,"sim_type":<"esim"|"sim"|null>,"confidence":<0.0-1.0>}`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

// Fallback khi Gemini call thất bại
const FALLBACK: ClassifyResult = { intent: "system_explain", confidence: 0 }

export async function classify(message: string): Promise<ClassifyResult> {
  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature:     0,
        maxOutputTokens: 100,
        responseMimeType: "application/json",
      },
    })

    const result = await model.generateContent(message)
    const text   = result.response.text().trim()

    const parsed = JSON.parse(text) as {
      intent:     string
      country?:   string | null
      sim_type?:  string | null
      confidence: number
    }

    const intent = parsed.intent as IntentType
    if (!INTENT_TO_AGENT[intent]) return FALLBACK

    return {
      intent,
      country:    parsed.country   ?? undefined,
      sim_type:   (parsed.sim_type === "esim" || parsed.sim_type === "sim") ? parsed.sim_type : undefined,
      confidence: parsed.confidence ?? 0.5,
    }
  } catch {
    return FALLBACK
  }
}

export function intentToAgentId(intent: IntentType): AgentId {
  return INTENT_TO_AGENT[intent]
}
