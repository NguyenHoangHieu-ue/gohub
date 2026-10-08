import { SchemaType } from "@google/generative-ai"
import { buildReport } from "@/lib/report"
import type { ReportFormat } from "@/lib/report/spec"
import { buildReportLark } from "@/lib/report/lark"

// Tool Bé Gấu (U2): dựng file báo cáo đẹp (Word/Excel/PowerPoint/PDF) từ khung báo cáo. Bảng/ô số kèm `sql` → server tự chạy (đã áp
// quyền vai trò/giá vốn) để số trong file khớp SQL — không để model gõ lại số.
const S = SchemaType
const col = { type: S.OBJECT, properties: {
  key: { type: S.STRING }, label: { type: S.STRING },
  type: { type: S.STRING, description: "text | number | money (VND, làm tròn) | percent (giá trị đã là %, vd 23.5)" },
}, required: ["key", "label"] }

export const buildReportDecl = {
  name: "buildReport",
  description: "Tạo FILE báo cáo đẹp theo mẫu GoHub (Word/Excel/PowerPoint/PDF có bảng định dạng + biểu đồ). Dùng khi người dùng nhờ làm/xuất báo cáo, file Word/Excel/PPT/PDF, slide trình bày. Lấy số liệu trước bằng công cụ dữ liệu để viết kết luận; BẢNG và Ô SỐ nên kèm sql (SELECT gohub_dw) để server tự lấy số chính xác. Trả về link tải — đưa nguyên link cho người dùng. Nhận xét/kết luận CHỈ dựa trên số đã lấy: KHÔNG tự gán nguyên nhân (thời tiết, cạnh tranh, điều chỉnh phân phối…) nếu dữ liệu không cho biết — ghi \"cần kiểm tra nguyên nhân\" thay vì đoán.",
  parameters: {
    type: S.OBJECT,
    properties: {
      formats: { type: S.ARRAY, items: { type: S.STRING }, description: "docx | xlsx | pptx | pdf | lark (Lark Docs trong Lark của người hỏi, có ảnh biểu đồ) — đúng thứ người dùng xin; không nói rõ thì docx + xlsx." },
      title: { type: S.STRING }, subtitle: { type: S.STRING },
      period: { type: S.STRING, description: "Kỳ dữ liệu, vd 01/07/2026 – 30/09/2026" },
      summary: { type: S.ARRAY, items: { type: S.STRING }, description: "Kết luận trước: 2–5 ý ngắn, có số." },
      sections: { type: S.ARRAY, description: "Các mục báo cáo theo thứ tự.", items: { type: S.OBJECT, properties: {
        heading: { type: S.STRING },
        text: { type: S.STRING, description: "Đoạn giải thích ngắn (tuỳ chọn)." },
        bullets: { type: S.ARRAY, items: { type: S.STRING } },
        kpis: { type: S.ARRAY, description: "Ô số nổi bật (≤4).", items: { type: S.OBJECT, properties: {
          label: { type: S.STRING }, value: { type: S.NUMBER }, type: { type: S.STRING, description: "money | number | percent" },
          change: { type: S.NUMBER, description: "% thay đổi so kỳ trước (tuỳ chọn)" },
          sql: { type: S.STRING, description: "SELECT trả 1 số — server dùng số này thay cho value" },
        }, required: ["label"] } },
        table: { type: S.OBJECT, properties: {
          title: { type: S.STRING },
          columns: { type: S.ARRAY, items: col, description: "key = tên cột trong kết quả SQL / rowsJson" },
          sql: { type: S.STRING, description: "SELECT lấy dữ liệu bảng (ưu tiên)" },
          rowsJson: { type: S.STRING, description: "Chỉ khi KHÔNG có SQL (vd dữ liệu sản phẩm): mảng JSON các dòng" },
          totalRow: { type: S.BOOLEAN, description: "Thêm dòng Tổng (cộng cột number/money)" },
        }, required: ["columns"] },
        chart: { type: S.OBJECT, properties: {
          type: { type: S.STRING, description: "bar | stacked | line | pie" },
          title: { type: S.STRING },
          x: { type: S.STRING, description: "key cột nhãn trục X / lát bánh" },
          series: { type: S.ARRAY, items: { type: S.OBJECT, properties: { key: { type: S.STRING }, label: { type: S.STRING } }, required: ["key", "label"] } },
          dataJson: { type: S.STRING, description: "Bỏ trống = dùng dữ liệu bảng cùng mục; hoặc mảng JSON các dòng" },
        }, required: ["type", "title", "x", "series"] },
      }, required: ["heading"] } },
      actions: { type: S.ARRAY, items: { type: S.STRING }, description: "Việc nên làm, cụ thể." },
      notes: { type: S.ARRAY, items: { type: S.STRING }, description: "Nguồn dữ liệu, định nghĩa chỉ số." },
    },
    required: ["title", "summary", "sections"],
  },
}

const parseRows = (s: unknown) => { try { const v = JSON.parse(String(s ?? "")); return Array.isArray(v) ? v : undefined } catch { return undefined } }

export async function runBuildReport(a: any, ctx: { owner: string; larkOpenId?: string | null; runSql: (sql: string) => Promise<{ rows?: Record<string, unknown>[]; error?: string }> }) {
  const raw = {
    ...a,
    sections: (Array.isArray(a?.sections) ? a.sections : []).map((s: any) => ({
      ...s,
      table: s?.table ? { ...s.table, rows: s.table.rowsJson ? parseRows(s.table.rowsJson) : undefined } : undefined,
      chart: s?.chart ? { ...s.chart, data: s.chart.dataJson ? parseRows(s.chart.dataJson) : undefined } : undefined,
    })),
  }
  const wantLark = (Array.isArray(a?.formats) ? a.formats : []).some((f: unknown) => /lark/i.test(String(f)))
  const formats = (Array.isArray(a?.formats) ? a.formats : []).map((f: unknown) => String(f).toLowerCase().replace("word", "docx").replace("excel", "xlsx").replace("ppt", "pptx").replace("pptxx", "pptx"))
    .filter((f: string): f is ReportFormat => ["docx", "xlsx", "pptx", "pdf"].includes(f))
  // Chỉ xin Lark → không dựng file tải về (formats rỗng sẽ mặc định docx+xlsx).
  const r = wantLark && !formats.length ? await buildReport(raw, [], { ...ctx, onlyResolve: true }) : await buildReport(raw, formats, ctx)
  if (r.error) return { error: r.error }
  const files = (r.files ?? []).map(f => ({ format: f.format, link: f.url, markdown: `[📎 Tải ${f.format.toUpperCase()} — ${f.filename}](${f.url})` }))
  if (wantLark && r.spec) {
    if (!ctx.larkOpenId) (r.warnings ??= []).push("Bản Lark: tài khoản chưa liên kết Lark (đăng nhập GoHub Intel bằng Lark 1 lần).")
    else try {
      const l = await buildReportLark(r.spec, ctx.larkOpenId)
      if (l.link) files.push({ format: "lark" as any, link: l.link, markdown: `[📄 Mở bản Lark Docs](${l.link})` })
    } catch (e: any) { (r.warnings ??= []).push(`Bản Lark: ${e?.message || e}`) }
  }
  if (!files.length) return { error: `Không tạo được file nào. ${r.warnings?.join("; ") ?? ""}` }
  return {
    files,
    warnings: r.warnings?.length ? r.warnings : undefined,
    instruction: "Trả lời ngắn: 1–3 câu kết luận + các dòng markdown link tải ở trên (giữ nguyên link). Có warnings thì nói rõ phần nào lỗi.",
  }
}
