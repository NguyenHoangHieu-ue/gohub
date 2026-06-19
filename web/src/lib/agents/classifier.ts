import { GoogleGenerativeAI } from "@google/generative-ai"
import type { AgentId } from "./types"

export type IntentType =
  | "product_search"
  | "product_lookup"
  | "system_explain"
  | "price_cogs"
  | "gap_analysis"
  | "ncc_catalog"
  | "template_create"
  | "bi_analytics"
  | "unclear"

// Nguồn dữ liệu user muốn hỏi — KHÓA để phân biệt "trong hệ thống GoHub" vs "catalog NCC"
export type DataSource = "gohub_system" | "ncc_catalog" | "both"

export interface ClassifyResult {
  intent:                  IntentType
  data_source?:            DataSource
  country?:                string
  sim_type?:               "esim" | "sim"
  needs_clarification:     boolean
  clarification_question?: string
  confidence:              number
}

const INTENT_TO_AGENT: Record<IntentType, AgentId> = {
  product_search:  "tu-van",
  product_lookup:  "tra-cuu",
  system_explain:  "giai-dap",
  price_cogs:      "tra-cuu",
  gap_analysis:    "gap-analysis",
  ncc_catalog:     "gap-analysis",  // NCC (browse + gap) gộp về 1 chủ sở hữu để tránh overlap với tu-van
  template_create: "tao-template",
  bi_analytics:    "bi-analyst",
  unclear:         "giai-dap",     // chỉ dùng nếu không short-circuit hỏi lại
}

const SYSTEM_PROMPT = `Bạn là bộ phân loại (classifier) cho hệ thống quản lý Sim/eSim GoHub. Phân tích tin nhắn người dùng, trả về JSON THUẦN (không markdown, không text thừa).

GoHub có 2 NGUỒN DỮ LIỆU tách biệt — phải phân biệt rõ:
- "hệ thống GoHub" (gohub_system): sản phẩm/SKU GoHub ĐANG bán cho khách. Đây là nguồn mặc định.
- "catalog NCC" (ncc_catalog): danh mục nhà cung cấp (WorldMove/WM, 3HK) — hàng vendor có, GoHub có thể CHƯA tạo SKU.

INTENT (chọn đúng 1):
- product_search: tìm/đề xuất/liệt kê gói cước GoHub theo nước/khu vực/ngày/GB/vendor/loại, hoặc theo mã nhóm nước (AP2, CHM, EU1, JPN, APA, GLO). VD: "đi Nhật có gói nào", "eSIM Thái 7 ngày", "gói unlimited Hàn", "gói AP2", "list CHM".
- product_lookup: tra cứu MÃ CỤ THỂ đã biết (SKU 13 ký tự, Product 8 ký tự, Item/Alias 18 ký tự, Listing). VD: "tra mã 1CJPNWM1010014", "APN của mã XXXX". KHÔNG dùng khi "list SKU" theo điều kiện.
- price_cogs: hỏi giá vốn/COGS/tỷ giá/lợi nhuận. VD: "COGS bao nhiêu", "tỷ giá USD VND".
- system_explain: giải thích thuật ngữ/cấu trúc mã/chính sách/hệ thống. VD: "KYC là gì", "cấu trúc mã SKU", "data policy", "AP2 nghĩa là gì", "CHM gồm nước nào".
- ncc_catalog: hỏi catalog NCC (xem nhà cung cấp có gì), KHÔNG so sánh với hệ thống. VD: "WM có gói Nhật nào", "WorldMove catalog Thái", "3HK zone nào cho Hàn", "nhà cung cấp có gì cho Đài Loan".
- gap_analysis: SO SÁNH catalog NCC với hệ thống GoHub (cái gì NCC có mà GoHub chưa tạo). VD: "WM có gì chưa import", "gap analysis", "NCC chưa tạo", "so sánh NCC vs hệ thống".
- template_create: tạo/xuất file Excel template sản phẩm. VD: "tạo template WM Nhật", "xuất template 3HK".
- bi_analytics: phân tích KINH DOANH (doanh thu, đơn hàng, kênh bán, nhân viên sales, B2B/B2C, fulfillment, target, GPM, top SKU bán chạy, doanh số). VD: "doanh thu tháng này", "đơn hàng tuần trước", "top kênh bán", "nhân viên nào bán nhiều nhất".
- unclear: câu hỏi quá mơ hồ, KHÔNG đủ thông tin để tìm kiếm/trả lời (thiếu nước/khu vực/mã và không nói rõ muốn gì). VD: "tư vấn cho tôi", "có gói nào không", "giúp mình với", "sim nào tốt".

PHÂN BIỆT mã nhóm nước (AP2, CHM, EU1, APA...):
- "gói AP2", "list AP2", "AP2 có gì" → product_search.
- "AP2 là gì", "AP2 gồm nước nào", "giải thích AP2" → system_explain.

PHÂN BIỆT nguồn (ncc_catalog vs gap_analysis):
- Chỉ hỏi xem NCC có gì (không nhắc hệ thống/import/chưa tạo) → ncc_catalog.
- Có từ "chưa tạo / chưa import / gap / so sánh / còn thiếu" → gap_analysis.

DATA_SOURCE: nguồn dữ liệu user muốn:
- "gohub_system": hỏi sản phẩm GoHub đang bán (mặc định cho product_search/product_lookup khi không nhắc NCC).
- "ncc_catalog": có nhắc WM/WorldMove/3HK/nhà cung cấp/vendor catalog.
- "both": hỏi chung chung "X có gì" không nói rõ nguồn, hoặc gap_analysis.
- null: không liên quan sản phẩm (system_explain thuần, bi_analytics).

NEEDS_CLARIFICATION: true CHỈ KHI intent=unclear hoặc thực sự không thể hành động (không có nước/khu vực/mã/chủ đề cụ thể). Nếu đã có nước/khu vực/mã hoặc câu hỏi đủ rõ để trả lời → false.
CLARIFICATION_QUESTION: khi cần làm rõ, soạn 1 câu hỏi ngắn gọn, thân thiện, hỏi đúng thông tin còn thiếu (tiếng Việt, có emoji nhẹ). Ngược lại để null.

COUNTRY: tên tiếng Anh ("Japan","Thailand","South Korea"). null nếu không có.
SIM_TYPE: "esim" | "sim" | null.

OUTPUT (JSON thuần):
{"intent":"<intent>","data_source":<"gohub_system"|"ncc_catalog"|"both"|null>,"country":<"Country"|null>,"sim_type":<"esim"|"sim"|null>,"needs_clarification":<true|false>,"clarification_question":<"..."|null>,"confidence":<0.0-1.0>}`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

// Fallback khi Gemini call thất bại — confidence 0 để router dùng regex
const FALLBACK: ClassifyResult = { intent: "system_explain", needs_clarification: false, confidence: 0 }

export async function classify(message: string): Promise<ClassifyResult> {
  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature:     0,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
      },
    })

    const result = await model.generateContent(message)
    const text   = result.response.text().trim()

    const parsed = JSON.parse(text) as {
      intent:                  string
      data_source?:            string | null
      country?:                string | null
      sim_type?:               string | null
      needs_clarification?:    boolean | null
      clarification_question?: string | null
      confidence:              number
    }

    const intent = parsed.intent as IntentType
    if (!INTENT_TO_AGENT[intent]) return FALLBACK

    const ds = parsed.data_source
    const data_source: DataSource | undefined =
      ds === "gohub_system" || ds === "ncc_catalog" || ds === "both" ? ds : undefined

    return {
      intent,
      data_source,
      country:                parsed.country  ?? undefined,
      sim_type:               (parsed.sim_type === "esim" || parsed.sim_type === "sim") ? parsed.sim_type : undefined,
      needs_clarification:    parsed.needs_clarification === true,
      clarification_question: parsed.clarification_question ?? undefined,
      confidence:             parsed.confidence ?? 0.5,
    }
  } catch {
    return FALLBACK
  }
}

export function intentToAgentId(intent: IntentType): AgentId {
  return INTENT_TO_AGENT[intent]
}
