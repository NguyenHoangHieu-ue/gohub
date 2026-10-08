// Tách câu trả lời thành đoạn markdown + khối ```chart (JSON) để khung chat vẽ biểu đồ. Dùng chung Bé Gấu + Gấu Pro.
// Trước đây Bé Gấu chỉ vẽ khi tin mang nhãn agent cũ (bi-analyst/data-explorer) và cả hai trang chỉ vẽ khối đầu tiên.
export type ChatSegment = { type: "md"; text: string } | { type: "chart"; chart: any }

const FENCE = /```chart[^\S\n]*\n?([\s\S]*?)```/g

function parseChart(raw: string): any | null {
  try {
    const c = JSON.parse(raw.trim())
    return c && typeof c === "object" && c.chart_type && Array.isArray(c.data) ? c : null
  } catch { return null }
}

/** Khối chart lỗi JSON giữ nguyên là markdown; khối ```chart chưa đóng ở cuối (đang stream) bị ẩn để khỏi nháy JSON thô. */
export function splitChartBlocks(text: string): ChatSegment[] {
  const out: ChatSegment[] = []
  const pushMd = (s: string) => { if (s.trim()) out.push({ type: "md", text: s.trim() }) }
  let last = 0
  for (const m of Array.from(text.matchAll(FENCE))) {
    const chart = parseChart(m[1])
    if (!chart) continue
    pushMd(text.slice(last, m.index))
    out.push({ type: "chart", chart })
    last = m.index! + m[0].length
  }
  let tail = text.slice(last)
  const open = tail.lastIndexOf("```chart")
  if (open !== -1 && tail.indexOf("```", open + 8) === -1) tail = tail.slice(0, open)
  pushMd(tail)
  return out
}
