import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { ArgonMarkdown } from "@/app/(dashboard)/analytics/creator/argon/argon-markdown"

const html = (md: string) => renderToStaticMarkup(createElement(ArgonMarkdown, { text: md }))

describe("ArgonMarkdown", () => {
  it("hộp Kết luận / Lưu ý, tiêu đề có vạch nhấn, chip trích nguồn", () => {
    const out = html("**Kết luận:** giữ 3HK trước.\n\n**Lưu ý:** giá BC đổi.\n\n## Chi tiết\n\nGiá 1,75 *(nguồn: Bảng giá 3HK)*.")
    expect(out).toContain("border-violet-400")
    expect(out).toContain("border-amber-400")
    expect(out).toContain("border-l-4 border-violet-500")
    expect(out).toContain("(nguồn: Bảng giá 3HK)")
    expect(out).toContain("not-italic")
  })
  it("bảng nằm trong khung cuộn ngang, có tiêu đề cột nổi", () => {
    const out = html("| Vendor | Giá |\n|---|---|\n| 3HK | 1,75 |")
    expect(out).toContain("overflow-x-auto")
    expect(out).toContain("<th")
    expect(out).toContain("<td")
  })
  it("checklist không còn dấu chấm đầu dòng; khối mã có nút chép", () => {
    const out = html("- [ ] gọi vendor\n- [x] gửi báo giá\n\n```sql\nselect 1\n```")
    expect(out).toContain("list-none")
    expect(out).toContain("bg-emerald-500")
    expect(out).toContain("Chép")
    expect(out).toContain("select 1")
  })
  it("khối html hoàn chỉnh thành thẻ report; html dở dang vẫn là khối mã", () => {
    const page = "<!doctype html><html><head><title>Báo cáo thử</title></head><body><div>x</div></body></html>"
    const card = html(["Tóm tắt.", "", "```html", page, "```"].join("\n"))
    expect(card).toContain("Mở report")
    expect(card).toContain("Báo cáo thử")
    const partial = html(["```html", "<html><body><div>đang viết", "```"].join("\n"))
    expect(partial).not.toContain("Mở report")
    expect(partial).toContain("Chép")
  })
})
