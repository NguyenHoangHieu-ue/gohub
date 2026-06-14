import { GoogleGenerativeAI } from "@google/generative-ai"

export interface MrpProposedPage {
  action:      "create" | "update"
  title:       string
  page_type:   string
  department:  string
  tags:        string[]
  content:     string
  reason:      string
}

export interface MrpKeyExtraction {
  type:   string
  item:   string
  value?: string
  note?:  string
}

export interface MrpPlan {
  doc_type:         string
  summary:          string
  proposed_pages:   MrpProposedPage[]
  key_extractions:  MrpKeyExtraction[]
}

const SYSTEM_PROMPT = `Bạn là AI phân tích tài liệu nội bộ cho GoHub — công ty kinh doanh SIM/eSIM quốc tế.

Nhiệm vụ: Đọc tài liệu, đề xuất tạo wiki pages, trích xuất thông tin quan trọng.
Trả về JSON hợp lệ, không kèm text nào khác.

LOẠI TÀI LIỆU (doc_type):
- vendor_pricing: bảng giá/báo giá từ nhà cung cấp (WM, 3HK, KDDI...)
- vendor_profile: thông tin vendor, điều khoản, liên hệ
- meeting_note: ghi chú họp, quyết định, action items
- process_sop: quy trình nội bộ, hướng dẫn thao tác
- generic: tài liệu chung

LOẠI WIKI PAGE (page_type): pricing_rule | vendor_profile | meeting_note | process_sop | product_guide | reference | note
PHÒNG BAN (department): all | sales | product | tech | finance

QUY TẮC:
- Tối đa 3 wiki pages đề xuất — chỉ đề xuất khi tài liệu đủ nội dung
- Nội dung wiki viết bằng tiếng Việt, dùng markdown có headers
- key_extractions: tối đa 8 điểm quan trọng (giá mới, SP mới, quyết định, deadline...)
- Nếu tài liệu quá ngắn/không rõ → proposed_pages = []
- summary: 1 câu ngắn gọn bằng tiếng Việt

OUTPUT FORMAT (chính xác):
{
  "doc_type": "...",
  "summary": "...",
  "proposed_pages": [
    {
      "action": "create",
      "title": "...",
      "page_type": "...",
      "department": "...",
      "tags": ["...", "..."],
      "content": "# Title\\n\\nNội dung markdown...",
      "reason": "Lý do đề xuất tạo page này"
    }
  ],
  "key_extractions": [
    { "type": "price_change|product_new|decision|deadline|contact", "item": "...", "value": "...", "note": "..." }
  ]
}`

export async function analyzeMrpDocument(text: string, docName: string): Promise<MrpPlan> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature:      0.1,
      maxOutputTokens:  4096,
      responseMimeType: "application/json",
    },
  })

  const prompt = `Tên tài liệu: ${docName}\n\nNội dung:\n${text.slice(0, 12000)}`
  const result = await model.generateContent(prompt)
  return JSON.parse(result.response.text()) as MrpPlan
}
