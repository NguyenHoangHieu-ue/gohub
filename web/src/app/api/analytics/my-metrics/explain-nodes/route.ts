import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { canWriteTab } from "@/lib/writable-tabs"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

const READ_ROLES = ["admin", "creator", "bod"]

interface ExplainNode {
  key: string; label: string
  rev_cur: number; rev_prev: number; gm_pct_cur: number; gm_pct_prev: number
}

// POST — "Giải thích bằng AI" cho hierarchy SKU Gross Margin / %Datapool Rev (s195+18-B). On-demand
// theo yêu cầu Hiếu (nút bấm, KHÔNG tự chạy mỗi lần tải trang) — cache 12h theo (scope, quarter, mode,
// level, path) để bấm lại/F5 trong cùng phiên không tốn thêm lượt gọi Gemini. AI chỉ SUY LUẬN khả dĩ từ
// đúng số liệu client gửi lên (không tra thêm dữ liệu ngoài) — luôn phải nêu là suy đoán, không khẳng
// định chắc chắn (đúng tinh thần disclaimer đã dùng ở Bé Gấu Insights/scoreResponseQuality).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    scope: "sku_gm" | "datapool"; quarter: string; mode: "month" | "quarter"
    level: string; path: string[]; nodes: ExplainNode[]
  }
  const nodes = (body.nodes ?? []).slice(0, 10)
  if (nodes.length === 0) return NextResponse.json({ error: "Không có node nào để giải thích" }, { status: 400 })
  if (!process.env.GEMINI_KEY) return NextResponse.json({ error: "GEMINI_KEY chưa cấu hình" }, { status: 500 })

  const cacheKey = `okr_explain:${body.scope}:${body.quarter}:${body.mode}:${body.level}:${(body.path ?? []).join(">")}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
      const model = genAI.getGenerativeModel({
        model: "gemini-3.8-flash",
        generationConfig: {
          temperature: 0.3, responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "low" },
        } as any,
      })

      const listed = nodes.map((n, i) =>
        `${i}: "${n.label}" — Rev kỳ trước ${n.rev_prev.toLocaleString("vi-VN")}đ → kỳ này ${n.rev_cur.toLocaleString("vi-VN")}đ ` +
        `(${n.rev_prev > 0 ? (((n.rev_cur - n.rev_prev) / n.rev_prev) * 100).toFixed(1) : "mới"}%), ` +
        `GM% ${n.gm_pct_prev.toFixed(2)}% → ${n.gm_pct_cur.toFixed(2)}% (Δ ${(n.gm_pct_cur - n.gm_pct_prev >= 0 ? "+" : "")}${(n.gm_pct_cur - n.gm_pct_prev).toFixed(2)}%)`
      ).join("\n")

      const prompt = `Bạn là chuyên gia phân tích kinh doanh mảng SIM/eSIM du lịch (GoHub). Dưới đây là danh sách các mục (${body.scope === "sku_gm" ? "SKU/nhóm SKU theo doanh thu" : "SKU thuộc vendor Datapool (3HK/BC)"}) có biến động Doanh thu (Rev) và Biên lợi nhuận gộp (GM%) đáng chú ý nhất giữa 2 kỳ so sánh:

${listed}

Với MỖI mục, viết 1 câu giải thích NGẮN GỌN (tiếng Việt, ≤25 từ) về NGUYÊN NHÂN KHẢ DĨ gây ra biến động đó — dựa trên các hướng thường gặp: đổi cơ cấu kênh bán (B2B/B2C), giá vốn NCC thay đổi, khuyến mãi/giảm giá, tính mùa vụ (mùa du lịch), tỷ giá, hoặc lượng bán thay đổi làm lệch cơ cấu. LUÔN dùng cụm "có thể do" / "khả năng do" — đây là SUY LUẬN từ số liệu, KHÔNG PHẢI kết luận chắc chắn (không có dữ liệu nguyên nhân thật để đối chiếu).

Trả JSON THUẦN (không markdown): [{"index": 0, "text": "..."}]`

      const result = await model.generateContent(prompt)
      const raw = result.response.text().trim()
      let parsed: { index: number; text: string }[]
      try { parsed = JSON.parse(raw) }
      catch {
        const m = raw.match(/\[[\s\S]*\]/)
        parsed = m ? JSON.parse(m[0]) : []
      }

      const explanations = nodes.map((n, i) => ({
        key: n.key,
        text: parsed.find(p => p.index === i)?.text ?? "AI không sinh được giải thích cho mục này.",
      }))
      return { explanations, generated_at: new Date().toISOString() }
    }, 720)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/explain-nodes]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
