import { describe, expect, it } from "vitest"
import { extractReports, isReportHtml, reportDoc, reportDownload, reportTitle, stripReports } from "@/lib/argon/report"

const PAGE = '<!doctype html><html><head><title>Doanh thu Q3</title></head><body><h1>Doanh thu</h1><canvas id="c"></canvas><script src="/vendor/chart.umd.min.js"></script></body></html>'
const ans = (html = PAGE) => `Tóm tắt 2 dòng.\n\n\`\`\`html\n${html}\n\`\`\`\n\nHết.`

describe("report", () => {
  it("nhận khối html đã đóng thẻ, bỏ qua đoạn mã html ngắn/dở dang", () => {
    expect(isReportHtml(PAGE)).toBe(true)
    expect(isReportHtml("<div>chỉ là ví dụ</div>")).toBe(false)
    expect(isReportHtml('<html><body><div>đang stream…')).toBe(false)
    expect(extractReports(ans())).toHaveLength(1)
    expect(extractReports("```html\n<p>a</p>\n```")).toHaveLength(0)
    expect(reportTitle(PAGE)).toBe("Doanh thu Q3")
    expect(reportTitle("<body><h1>Tiêu <b>đề</b></h1></body>")).toBe("Tiêu đề")
  })
  it("lược report cũ khỏi lịch sử, giữ report cuối khi keepLast", () => {
    const two = `${ans(PAGE)}\n\n${ans(PAGE.replace("Q3", "Q4"))}`
    const s = stripReports(two)
    expect(s).not.toContain("<canvas")
    expect(s).toContain('[Đã tạo report HTML "Doanh thu Q3"')
    const k = stripReports(two, true)
    expect(k.match(/<canvas/g)).toHaveLength(1)
    expect(k).toContain("Doanh thu Q4")
    expect(stripReports("không có report")).toBe("không có report")
  })
  it("tài liệu iframe: chèn CSP chặn mạng, chỉ cho /vendor/ của GoHub, đổi đường dẫn thư viện thành tuyệt đối", () => {
    const d = reportDoc(PAGE, "https://intel-v2.gohub.cloud")
    expect(d).toContain("Content-Security-Policy")
    expect(d).toContain("connect-src 'none'")
    expect(d).toContain("argon-print")
    expect(d).toContain("script-src 'unsafe-inline' https://intel-v2.gohub.cloud/vendor/")
    expect(d).toContain('src="https://intel-v2.gohub.cloud/vendor/chart.umd.min.js"')
    expect(d.indexOf("Content-Security-Policy")).toBeLessThan(d.indexOf("<script"))
    expect(reportDoc("<div>x</div>", "https://a.b")).toContain("<!doctype html>")
    expect(reportDownload(PAGE, "https://a.b")).toContain('src="https://a.b/vendor/chart.umd.min.js"')
  })
})
