import { Type, type FunctionDeclaration } from "@google/genai"
import type { Content } from "@google/genai"
import type { ToolLogEntry } from "./tools"
import { gateWrite } from "./run-safety"

// ARGON-X Đợt 3 (phần ít rủi ro): đọc trang web, đọc portal vendor, tạo ảnh. Chỉ Creator.
//  - docTrang  (L1): mở trang bằng browserless (chỉ ĐỌC: không click/gõ). URL phải do anh gõ hoặc nằm trong kết quả timTrenWeb — chặn kênh rò dữ liệu qua URL do model tự bịa sau khi đọc mail/thread.
//  - docPortal (L1): đăng nhập portal vendor đã lưu và lấy nội dung trang. Chỉ đường dẫn tương đối an toàn; mật khẩu không bao giờ trả về cho model.
//  - taoAnh    (L2): Nano Banana; lượt đã đọc nội dung ngoài thì từ chối (chi phí + chống bị điều khiển ngầm).
// KHÔNG chuyển sang đây: điều khiển trình duyệt/máy của anh qua Bridge, nói chuyện trực tiếp bằng giọng (vẫn ở Gấu Pro).
export const PAGE_NAME = "docTrang", PORTAL_NAME = "docPortal", IMAGE_NAME = "taoAnh"
export const BROWSE_TOOL_NAMES: readonly string[] = [PAGE_NAME, PORTAL_NAME, IMAGE_NAME]
export const BROWSE_LIMITS: Readonly<Record<string, number>> = { [PAGE_NAME]: 5, [PORTAL_NAME]: 4, [IMAGE_NAME]: 3 }
const MAX_CHARS = 40_000
const MAX_URLS = 3

export const BROWSE_TOOLS: FunctionDeclaration[] = [
  { name: PAGE_NAME, description: "ĐỌC nội dung một hoặc vài trang web (tối đa 3 URL), kể cả trang chạy JavaScript. Chỉ đọc — không bấm/gõ. URL phải do anh đưa trong câu hỏi hoặc lấy từ kết quả timTrenWeb; không tự bịa URL, không nhét dữ liệu vào URL. Cần đăng nhập/portal vendor thì dùng docPortal.", parameters: { type: Type.OBJECT, properties: { urls: { type: Type.ARRAY, items: { type: Type.STRING }, description: "1–3 URL http(s) đầy đủ" } }, required: ["urls"] } },
  { name: PORTAL_NAME, description: "ĐỌC trang trong portal vendor/đối tác đã lưu tài khoản (đăng nhập tự động, mật khẩu không hiện ra). portal_name = một phần tên hoặc URL của portal đã lưu; path = đường dẫn sau khi đăng nhập (vd /products). Không biết tên portal thì gọi thử, kết quả liệt kê các portal đã lưu. Chỉ đọc.", parameters: { type: Type.OBJECT, properties: { portal_name: { type: Type.STRING, description: "Tên hoặc URL (một phần) của portal đã lưu" }, path: { type: Type.STRING, description: "Đường dẫn bắt đầu bằng /, vd /products (bỏ trống = trang chủ sau đăng nhập)" } }, required: ["portal_name"] } },
  { name: IMAGE_NAME, description: "TẠO ẢNH bằng Nano Banana (banner, thumbnail, ảnh sản phẩm; viết được chữ tiếng Việt). Trả markdown ảnh — chép NGUYÊN trường markdown vào câu trả lời. Màu GoHub: xanh #1446A5, xanh đậm #003A93, xanh nhạt #009CE0. Chỉ dùng khi anh nhờ làm ảnh. Không dùng được trong lượt đã đọc nội dung từ bên ngoài.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING, description: "Mô tả ảnh chi tiết: chủ thể, bố cục, phong cách, màu, chữ cần có (ghi đúng nguyên văn)" }, aspect_ratio: { type: Type.STRING, description: "1:1 (mặc định) | 16:9 | 9:16 | 4:3 | 3:4 | 4:5 | 21:9" }, quality: { type: Type.STRING, description: "high = bản chất lượng cao (đắt hơn); bỏ trống = nhanh" } }, required: ["prompt"] } },
]

const entry = (name: string, args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })
const json = (v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v, null, 1); return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n…(cắt bớt ${s.length - MAX_CHARS} ký tự)` : s }

/** Chặn URL nội bộ/không phải http(s). Thuần. Trả lý do lỗi hoặc null. */
export function badUrl(u: string): string | null {
  let url: URL
  try { url = new URL(u) } catch { return "URL không hợp lệ" }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Chỉ mở URL http(s)"
  const h = url.hostname.toLowerCase()
  if (url.username || url.password) return "URL chứa tài khoản/mật khẩu"
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "[::1]" || !h.includes(".")) return "Địa chỉ nội bộ không được mở"
  return null
}

/** Văn bản "đáng tin" để đối chiếu URL: các lượt người dùng thật (câu hỏi hiện tại + lịch sử, không tính khối tài liệu/số liệu nạp sẵn) + kết quả timTrenWeb của lượt này. Thuần. */
export function trustedUrlText(contents: readonly Content[], log: readonly Pick<ToolLogEntry, "name" | "ok" | "result">[]): string {
  const user = contents.filter(c => c.role === "user").map(c => (c.parts ?? []).map(p => p.text ?? "").join("\n"))
    .filter(t => !t.startsWith("Tên dự án:") && !t.startsWith("Số liệu hệ thống đã lấy"))
  return [...user, ...log.filter(t => t.ok && t.name === "timTrenWeb").map(t => t.result)].join("\n")
}

const PATH_OK = /^\/[A-Za-z0-9_\-./?=&%#,:+~]{0,200}$/

export async function execBrowseTool(name: string, args: Record<string, unknown>, o: { used: number; tainted: boolean; trusted: string }): Promise<ToolLogEntry> {
  const cap = BROWSE_LIMITS[name]
  if (cap && o.used >= cap) return entry(name, args, false, `Đã dùng hết ${cap} lần ${name} trong lượt này`)
  try {
    if (name === PAGE_NAME) {
      const urls = (Array.isArray(args.urls) ? args.urls : []).map(u => String(u).trim()).filter(Boolean).slice(0, MAX_URLS)
      if (!urls.length) return entry(name, args, false, "Thiếu urls")
      for (const u of urls) {
        const bad = badUrl(u)
        if (bad) return entry(name, args, false, `${bad}: ${u.slice(0, 120)}`)
        if (!o.trusted.includes(u)) return entry(name, args, false, `URL không do anh đưa và không nằm trong kết quả timTrenWeb: ${u.slice(0, 120)}. Hỏi anh link, hoặc tìm bằng timTrenWeb trước.`)
      }
      const { runBrowseWeb } = await import("@/lib/agents/creator/tools/browser")
      const r = await runBrowseWeb({ urls })
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json({ title: r.title, content: r.content, pages_fetched: r.pages_fetched }))
    }
    if (name === PORTAL_NAME) {
      const portal = String(args.portal_name ?? "").trim()
      const path = String(args.path ?? "").trim()
      if (portal.length < 2) return entry(name, args, false, "Thiếu portal_name")
      if (path && !PATH_OK.test(path)) return entry(name, args, false, "path chỉ được là đường dẫn tương đối bắt đầu bằng / (không chứa tên miền)")
      const { runBrowsePortal } = await import("@/lib/agents/creator/tools/portal")
      const r = await runBrowsePortal({ portal_name: portal, path: path || undefined })
      return r?.error ? entry(name, args, false, `${r.error}${r.available ? ` Portal đã lưu: ${r.available}` : ""}`) : entry(name, args, true, json(r))
    }
    if (name === IMAGE_NAME) {
      const g = gateWrite(IMAGE_NAME, o.tainted)
      if (g.mode === "deny") return entry(name, args, false, g.note ?? "Không tạo ảnh trong lượt đã đọc nội dung ngoài")
      const { runGenerateImage } = await import("@/lib/agents/creator/tools/image")
      const r = await runGenerateImage({ prompt: String(args.prompt ?? ""), aspect_ratio: args.aspect_ratio as string | undefined, quality: args.quality as string | undefined })
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, JSON.stringify({ markdown: r.markdown, url: r.url, instruction: "Chép NGUYÊN trường markdown vào câu trả lời." }))
    }
    return entry(name, args, false, `Công cụ ${name} không thuộc nhóm này`)
  } catch (e) { return entry(name, args, false, `Lỗi: ${(e as Error).message}`) }
}
