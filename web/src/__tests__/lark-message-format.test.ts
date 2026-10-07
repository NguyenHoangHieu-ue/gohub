import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))

import { larkMessageBodies } from "@/lib/lark"

describe("larkMessageBodies — tin Lark có markdown gửi dạng card (s227d)", () => {
  it("tin thường → 1 tin text", () => {
    const b = larkMessageBodies("Đã note")
    expect(b).toHaveLength(1)
    expect(b[0].msg_type).toBe("text")
    expect(JSON.parse(b[0].content).text).toBe("Đã note")
  })

  it("**in đậm** → card markdown trước, text đã bỏ dấu làm dự phòng", () => {
    const b = larkMessageBodies("**Điểm lưu ý**: doanh thu giảm 10%")
    expect(b.map(x => x.msg_type)).toEqual(["interactive", "text"])
    const card = JSON.parse(b[0].content)
    expect(card.body.elements[0]).toEqual({ tag: "markdown", content: "**Điểm lưu ý**: doanh thu giảm 10%" })
    expect(JSON.parse(b[1].content).text).toBe("Điểm lưu ý: doanh thu giảm 10%")
  })

  it("bảng markdown → phần tử table thật trong card", () => {
    const b = larkMessageBodies("Kết quả:\n\n| Nước | Doanh thu |\n|---|---|\n| Nhật | 2.171 |")
    const els = JSON.parse(b[0].content).body.elements
    expect(els.some((e: any) => e.tag === "table")).toBe(true)
  })

  it("link markdown vẫn giữ trong card", () => {
    const b = larkMessageBodies("Xong: [Mở tài liệu](https://example.larksuite.com/docx/abc)")
    expect(b[0].msg_type).toBe("interactive")
    expect(JSON.parse(b[0].content).body.elements[0].content).toContain("[Mở tài liệu](https://example.larksuite.com/docx/abc)")
  })

  it("tin quá dài → chỉ gửi text", () => {
    expect(larkMessageBodies("**a** " + "x".repeat(25000)).map(x => x.msg_type)).toEqual(["text"])
  })
})
