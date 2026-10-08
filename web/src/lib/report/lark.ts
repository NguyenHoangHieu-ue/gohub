import { getLarkToken, sendLarkDM } from "@/lib/lark"
import { appendMarkdown, appendImage, docUrl } from "@/lib/agents/creator/tools/lark-docs"
import { giveToUser } from "@/lib/agents/lark-workspace"
import { formatValue, totalRow, type ReportSpec, type ReportSection } from "./spec"
import { chartPng } from "./charts"

// U2: bản Lark Docs của báo cáo — tạo bằng token bot (mức A), nối từng mục: chữ/bảng (markdown) + ảnh biểu đồ đúng vị trí, rồi chuyển
// quyền sở hữu cho người hỏi. Bảng dài cắt 100 dòng (đầy đủ ở bản Excel).
const L = "https://open.larksuite.com/open-apis"
const MAX_ROWS = 100
const cellText = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ")

function sectionMarkdown(s: ReportSection): string {
  const out: string[] = [`## ${s.heading}`]
  if (s.text) out.push(s.text)
  if (s.kpis?.length) out.push(s.kpis.map(k => `- **${k.label}:** ${typeof k.value === "number" ? formatValue(k.value, k.type) : k.value}${k.change !== undefined ? ` (${k.change >= 0 ? "▲" : "▼"} ${formatValue(Math.abs(k.change), "percent")})` : ""}`).join("\n"))
  if (s.bullets?.length) out.push(s.bullets.map(b => `- ${b}`).join("\n"))
  return out.join("\n\n")
}

function tableMarkdown(s: ReportSection): string {
  const t = s.table
  if (!t?.rows?.length) return ""
  const rows = t.rows.slice(0, MAX_ROWS)
  const tot = totalRow(t)
  const line = (r: Record<string, unknown>) => `| ${t.columns.map(c => cellText(formatValue(r[c.key], c.type))).join(" | ")} |`
  return [
    t.title ? `**${t.title}**` : "",
    `| ${t.columns.map(c => cellText(c.label)).join(" | ")} |`,
    `| ${t.columns.map(() => "---").join(" | ")} |`,
    ...rows.map(line), ...(tot ? [line(tot)] : []),
    t.rows.length > MAX_ROWS ? `\n_(Hiện ${MAX_ROWS}/${t.rows.length} dòng — đầy đủ ở bản Excel)_` : "",
  ].filter(Boolean).join("\n")
}

export async function buildReportLark(spec: ReportSpec, openId: string | null): Promise<{ link?: string; access: string; documentId: string }> {
  const token = await getLarkToken()
  const res = await fetch(`${L}/docx/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ title: spec.title }) })
  const d = await res.json()
  if (d.code !== 0) throw new Error(`Lark API ${d.code}: ${d.msg}`)
  const id: string = d.data.document.document_id
  const head = [
    spec.subtitle ? `_${spec.subtitle}_` : "",
    spec.period ? `Kỳ dữ liệu: ${spec.period}` : "",
    spec.summary.length ? `## Kết luận\n\n${spec.summary.map(s => `- ${s}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
  if (head) await appendMarkdown(token, id, head)
  for (const s of spec.sections) {
    await appendMarkdown(token, id, sectionMarkdown(s))
    if (s.chart?.data?.length) await appendImage(token, id, await chartPng(s.chart))
    const tm = tableMarkdown(s)
    if (tm) await appendMarkdown(token, id, tm)
  }
  const tail = [
    spec.actions?.length ? `## Việc nên làm\n\n${spec.actions.map(a => `- ${a}`).join("\n")}` : "",
    spec.notes?.length ? `## Nguồn & ghi chú\n\n${spec.notes.map(n => `- ${n}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
  if (tail) await appendMarkdown(token, id, tail)
  const url = await docUrl(token, id, "docx")
  if (!openId) return { link: url, access: "bot", documentId: id }   // chỉ dùng khi thử (không chuyển cho ai)
  const access = await giveToUser(token, id, "docx", openId)
  await sendLarkDM(openId, `📄 Bé Gấu đã tạo báo cáo **${spec.title}** trong Lark của anh/chị.${url ? `\n[Mở tài liệu](${url})` : ""}`).catch(() => {})
  return { link: url, access, documentId: id }
}
