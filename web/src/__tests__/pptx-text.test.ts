import { describe, expect, it } from "vitest"
import PptxGenJS from "pptxgenjs"
import { extractPptxText, notesBody, xmlParagraphs } from "@/lib/pptx-text"

async function build(): Promise<Buffer> {
  const pptx = new PptxGenJS()
  const s1 = pptx.addSlide()
  s1.addText("Đề xuất giá eSIM Thái Lan Q4", { x: 0.5, y: 0.4, fontSize: 28 })
  s1.addText([{ text: "3HK: 3.5 HKD/GB nếu có forecast traffic", options: { bullet: true, breakLine: true } }, { text: "BC & Singtel: 0.65 USD/GB", options: { bullet: true } }], { x: 0.5, y: 1.4, w: 8 })
  s1.addNotes("Ghi chú diễn giả: chốt với Ngân trước thứ 6.\nNhắc: True đã hạ còn 3.5 HKD/GB.")
  const s2 = pptx.addSlide()
  s2.addTable([[{ text: "Vendor" }, { text: "Giá" }], [{ text: "3HK" }, { text: "3.5" }], [{ text: "BC" }, { text: "0.65" }]], { x: 0.5, y: 0.5, w: 6 })
  const s3 = pptx.addSlide()
  s3.addText("Slide cuối không có ghi chú", { x: 0.5, y: 0.5 })
  s3.addNotes("Số liệu chốt tuần sau.")
  return Buffer.from((await pptx.write({ outputType: "nodebuffer" })) as Buffer)
}

describe("extractPptxText", () => {
  it("lấy chữ từng slide, bảng theo ô, ghi chú diễn giả đúng slide; slide không ghi chú thì không có mục ghi chú", async () => {
    const t = await extractPptxText(await build())
    const [s1, s2, s3] = t.split(/\n\n(?==== Slide)/)
    expect(s1).toContain("=== Slide 1 ===")
    expect(s1).toContain("Đề xuất giá eSIM Thái Lan Q4")
    expect(s1).toContain("3HK: 3.5 HKD/GB nếu có forecast traffic")
    expect(s1).toContain("BC & Singtel: 0.65 USD/GB")          // &amp; được giải mã
    expect(s1).toContain("[Ghi chú diễn giả]")
    expect(s1).toContain("chốt với Ngân trước thứ 6")
    expect(s1).toContain("True đã hạ còn 3.5 HKD/GB")
    expect(s2).toContain("Vendor"); expect(s2).toContain("3HK"); expect(s2).toContain("0.65")
    expect(s2).toContain("=== Slide 2 ===")
    expect(s2).not.toContain("Ghi chú diễn giả")
    expect(s3).toContain("Slide cuối không có ghi chú")
    expect(s3).toContain("Số liệu chốt tuần sau.")
    expect(s1).not.toContain("Số liệu chốt tuần sau")           // ghi chú không trộn sang slide khác
  })
  it("file không phải pptx hoặc không có slide thì báo lỗi rõ", async () => {
    await expect(extractPptxText(Buffer.from("không phải zip"))).rejects.toBeTruthy()
  })
})

describe("xmlParagraphs / notesBody", () => {
  it("mỗi <a:p> một dòng, các <a:t> trong đoạn nối thẳng, <a:br/> xuống dòng, giải mã ký tự, bỏ dòng trống", () => {
    const xml = "<a:p><a:r><a:t>Xin </a:t></a:r><a:r><a:t>chào &amp; hẹn</a:t></a:r></a:p><a:p><a:t/></a:p><a:p><a:r><a:t>Dòng A</a:t></a:r><a:br/><a:r><a:t>Dòng B</a:t></a:r></a:p>"
    expect(xmlParagraphs(xml)).toBe("Xin chào & hẹn\nDòng A\nDòng B")
  })
  it("ghi chú: chỉ lấy ô thân (body), bỏ số trang và ô ảnh slide", () => {
    const xml = '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Nội dung ghi chú</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="slidenum"><a:t>7</a:t></a:fld></a:p></p:txBody></p:sp>'
    expect(notesBody(xml)).toBe("Nội dung ghi chú")
  })
})
