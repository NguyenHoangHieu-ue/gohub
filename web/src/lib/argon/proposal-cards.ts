// Biến mục "Đề xuất" của bản tin hằng ngày (notes/tac-dong.md) thành các THẺ có cấu trúc để hiển thị gọn: mỗi đề xuất = số thứ tự, việc, mức chắc chắn, vì sao, ảnh hưởng (tiền), nguồn, liên quan kế hoạch.
// Khuôn do NIGHTLY_PROMPT quy định: "### n. <việc> — Chắc|Có thể|Chưa đủ dữ liệu" rồi các dòng "- Vì sao: …", "- Ảnh hưởng: …", "- Nguồn: …", "- Liên quan kế hoạch: …". Không theo khuôn → trả null để trang hiện markdown gốc. Thuần.
export type Certainty = "chac" | "co_the" | "chua_du"
export interface ProposalCard { n: number; title: string; certainty: Certainty | null; certaintyLabel: string; why: string; impact: string; sources: string[]; plan: string; extra: string[] }

const HEAD = /^###\s*(\d+)\.\s*(.+?)\s*$/gm
const TAIL = /\s*[—–-]+\s*\**\s*(Chắc chắn|Chắc|Có thể|Chưa đủ dữ liệu)\s*\**\s*$/i
const FIELD = /^\s*[-*]?\s*\**\s*(Vì sao|Ảnh hưởng|Nguồn|Liên quan kế hoạch)\s*\**\s*:\s*\**\s*(.*)$/i

const certaintyOf = (label: string): Certainty => (/^chắc/i.test(label) ? "chac" : /^có thể/i.test(label) ? "co_the" : "chua_du")

export function parseProposals(md: string): ProposalCard[] | null {
  const text = md ?? ""
  const heads = Array.from(text.matchAll(HEAD))
  if (!heads.length) return null
  const cards: ProposalCard[] = []
  heads.forEach((h, i) => {
    const body = text.slice((h.index ?? 0) + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined)
    const rawTitle = h[2]
    const tail = TAIL.exec(rawTitle)
    const card: ProposalCard = { n: Number(h[1]), title: (tail ? rawTitle.slice(0, tail.index) : rawTitle).replace(/\*\*/g, "").trim(), certainty: tail ? certaintyOf(tail[1]) : null, certaintyLabel: tail ? tail[1].replace(/^chắc$/i, "Chắc chắn") : "", why: "", impact: "", sources: [], plan: "", extra: [] }
    for (const line of body.split("\n")) {
      if (!line.trim()) continue
      const f = FIELD.exec(line)
      if (!f) { card.extra.push(line.replace(/^\s*[-*]\s*/, "").trim()); continue }
      const label = f[1].toLowerCase(), val = f[2].trim()
      if (label === "vì sao") card.why = val
      else if (label === "ảnh hưởng") card.impact = val
      else if (label === "nguồn") card.sources = val.split(/[,;]\s*/).map(s => s.replace(/[*_]/g, "").trim()).filter(Boolean)
      else card.plan = val
    }
    cards.push(card)
  })
  return cards.length ? cards : null
}
