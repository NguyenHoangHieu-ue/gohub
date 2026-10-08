import { describe, it, expect } from "vitest"
import { splitChartBlocks } from "@/lib/chat-charts"

const pie = '{"chart_type":"pie","title":"Tỷ trọng","data":[{"label":"B2B","value":17820485598},{"label":"B2C","value":5108744434}]}'
const bar = '{"chart_type":"bar","title":"Tháng","data":[{"label":"T7","value":1}]}'

describe("splitChartBlocks", () => {
  it("tách nhiều khối chart xen markdown, giữ thứ tự", () => {
    const s = splitChartBlocks(`### 1. Kênh\nB2B 77,7%\n\n\`\`\`chart\n${pie}\n\`\`\`\n\n---\n\n### 2. Tháng\n\`\`\`chart\n${bar}\n\`\`\`\nKết luận`)
    expect(s.map(x => x.type)).toEqual(["md", "chart", "md", "chart", "md"])
    expect((s[1] as any).chart.chart_type).toBe("pie")
    expect((s[3] as any).chart.title).toBe("Tháng")
  })
  it("JSON lỗi thì giữ nguyên là markdown", () => {
    const s = splitChartBlocks("A\n```chart\n{hỏng}\n```\nB")
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ type: "md" })
    expect((s[0] as any).text).toContain("{hỏng}")
  })
  it("ẩn khối chart chưa đóng khi đang stream", () => {
    const s = splitChartBlocks('Mở đầu\n```chart\n{"chart_type":"pie","da')
    expect(s).toEqual([{ type: "md", text: "Mở đầu" }])
  })
  it("không có chart → 1 đoạn markdown", () => {
    expect(splitChartBlocks("Chỉ chữ")).toEqual([{ type: "md", text: "Chỉ chữ" }])
  })
})
