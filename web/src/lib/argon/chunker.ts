// Cắt văn bản nguồn thành các đoạn ~800 token để lập chỉ mục tìm kiếm (index-db.ts). Thuần, không I/O.
// Ưu tiên cắt theo đoạn văn → dòng → câu → từ; mỗi đoạn (trừ đoạn đầu) mang theo đuôi đoạn trước để không mất mạch.
export const CHUNK_TARGET = 2400     // ký tự (~800 token tiếng Việt)
export const CHUNK_MAX = 3200
export const CHUNK_OVERLAP = 240

export interface Chunk { idx: number; text: string }

function splitLong(piece: string, max: number): string[] {
  if (piece.length <= max) return [piece]
  const out: string[] = []
  let rest = piece
  while (rest.length > max) {
    const win = rest.slice(0, max)
    let cut = Math.max(win.lastIndexOf("\n"), win.lastIndexOf(". "), win.lastIndexOf("; "), win.lastIndexOf(", "))
    if (cut < max * 0.5) cut = win.lastIndexOf(" ")
    if (cut < max * 0.3) cut = max
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1)
  }
  if (rest.trim()) out.push(rest.trim())
  return out.filter(Boolean)
}

function tailOverlap(prev: string, n: number): string {
  if (n <= 0 || prev.length <= n) return ""
  const t = prev.slice(-n)
  const sp = t.indexOf(" ")
  return (sp >= 0 && sp < n / 2 ? t.slice(sp + 1) : t).trim()
}

export function chunkText(text: string, opt: { target?: number; max?: number; overlap?: number } = {}): Chunk[] {
  const target = opt.target ?? CHUNK_TARGET, max = opt.max ?? CHUNK_MAX, overlap = opt.overlap ?? CHUNK_OVERLAP
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!clean) return []
  const pieces = clean.split(/\n{2,}/).flatMap(p => splitLong(p.trim(), max)).filter(Boolean)
  const bodies: string[] = []
  let cur = ""
  for (const p of pieces) {
    if (cur && cur.length + p.length + 2 > target) { bodies.push(cur); cur = p }
    else cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur) bodies.push(cur)
  return bodies.map((b, i) => {
    const lead = i > 0 ? tailOverlap(bodies[i - 1], overlap) : ""
    return { idx: i, text: lead ? `…${lead}\n${b}` : b }
  })
}
