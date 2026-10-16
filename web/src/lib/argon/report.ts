// "Report HTML" của Phòng Argon: Argon viết 1 trang HTML tự chứa trong khối ```html; giao diện mở nó trong iframe cô lập (sandbox="allow-scripts", không cùng origin
// với GoHub nên không đọc được phiên đăng nhập/cookie). Module thuần (không import server) — cả trang web, worker và test dùng chung.
export interface ReportBlock { title: string; html: string; start: number; end: number }

export const VENDOR_LIBS = ["chart.umd.min.js", "d3.min.js"]   // file tự host ở public/vendor — report nạp bằng <script src="/vendor/…">
const FENCE = /```html[^\S\n]*\n([\s\S]*?)```/g

/** Khối html được coi là report khi đã đóng thẻ (đang stream dở thì vẫn hiện như mã) và có cấu trúc trang. */
export function isReportHtml(code: string): boolean {
  return /<\/(html|body)>/i.test(code) && /<(html|body|div|section|main|svg|canvas|table)\b/i.test(code)
}

export function reportTitle(html: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? ""
  return t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "Report"
}

export function extractReports(answer: string): ReportBlock[] {
  const out: ReportBlock[] = []
  for (const m of Array.from(answer.matchAll(FENCE))) {
    if (isReportHtml(m[1])) out.push({ title: reportTitle(m[1]), html: m[1], start: m.index!, end: m.index! + m[0].length })
  }
  return out
}

/** Thay khối report cũ bằng 1 dòng ngắn khi đưa lại câu trả lời cũ cho Argon (tiết kiệm token). `keepLast`: giữ nguyên report cuối để còn sửa tiếp được. */
export function stripReports(answer: string, keepLast = false): string {
  const blocks = extractReports(answer)
  if (!blocks.length) return answer
  let out = "", at = 0
  blocks.forEach((b, i) => {
    out += answer.slice(at, b.start)
    out += keepLast && i === blocks.length - 1 ? answer.slice(b.start, b.end) : `[Đã tạo report HTML "${b.title}" — nội dung đã lược bỏ để tiết kiệm ngữ cảnh]`
    at = b.end
  })
  return out + answer.slice(at)
}

/** Tài liệu đưa vào iframe: thêm CSP chặn mọi truy cập mạng (chỉ nạp được thư viện tự host ở /vendor/ và ảnh data:) + nền/phông mặc định. */
export function reportDoc(html: string, origin: string): string {
  const csp = `default-src 'none'; script-src 'unsafe-inline' ${origin}/vendor/; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>addEventListener("message",function(e){if(e.data==="argon-print")print()})</script><style>html{color-scheme:light dark}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}</style>`
  const abs = html.replace(/(src=["'])\/vendor\//g, `$1${origin}/vendor/`)
  if (/<head[^>]*>/i.test(abs)) return abs.replace(/<head[^>]*>/i, m => `${m}${head}`)
  if (/<html[^>]*>/i.test(abs)) return abs.replace(/<html[^>]*>/i, m => `${m}<head>${head}</head>`)
  return `<!doctype html><html><head>${head}</head><body>${abs}</body></html>`
}

/** File tải về: giữ nguyên HTML, chỉ đổi đường /vendor/ thành tuyệt đối để mở được ngoài GoHub (cần mạng tới GoHub để nạp thư viện biểu đồ). */
export function reportDownload(html: string, origin: string): string {
  return html.replace(/(src=["'])\/vendor\//g, `$1${origin}/vendor/`)
}
