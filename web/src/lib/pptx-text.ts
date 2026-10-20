import JSZip from "jszip"

// Trích chữ từ file .pptx: từng slide (đoạn xuống dòng đúng chỗ, bảng theo ô) + GHI CHÚ DIỄN GIẢ của slide đó. Dùng chung cho Bé Gấu, Gấu Pro, Phòng Argon (lib/agents/file-parser.ts).
// Ghi chú nằm ở ppt/notesSlides/notesSlideN.xml, nối với slide qua ppt/slides/_rels/slideN.xml.rels (không dựa vào số thứ tự trùng nhau).

const ENT: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" }
const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, m => ENT[m]).replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))

const RUN = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/?>|<\/a:p>/g

/** Chữ trong 1 đoạn XML DrawingML: mỗi `<a:p>` một dòng, các `<a:t>` trong cùng đoạn nối thẳng (khoảng trắng nằm sẵn trong chữ), `<a:br/>` xuống dòng. */
export function xmlParagraphs(xml: string): string {
  const lines: string[] = []
  let cur = ""
  for (const m of Array.from(xml.matchAll(RUN))) {
    if (m[1] !== undefined) cur += m[1]
    else { lines.push(cur); cur = "" }
  }
  lines.push(cur)
  return lines.map(l => decode(l).replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n")
}

/** Chữ trong phần thân của trang ghi chú: bỏ ô ảnh slide, số trang, ngày, đầu/chân trang. */
export function notesBody(xml: string): string {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []
  const skip = /<p:ph[^>]*type="(sldNum|dt|ftr|hdr|sldImg)"/
  const body = shapes.filter(s => /<p:ph[^>]*type="body"/.test(s))
  return (body.length ? body : shapes.filter(s => !skip.test(s))).map(xmlParagraphs).filter(Boolean).join("\n")
}

const num = (f: string, re: RegExp) => parseInt(f.match(re)?.[1] || "0", 10)

export async function extractPptxText(buf: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf as ArrayBuffer)
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f)).sort((a, b) => num(a, /slide(\d+)/) - num(b, /slide(\d+)/))
  if (!slideFiles.length) throw new Error("Không tìm thấy slide")
  const parts: string[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    const f = slideFiles[i]
    const body = xmlParagraphs(await zip.files[f].async("text"))
    let notes = ""
    const relFile = zip.files[f.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels"]
    if (relFile) {
      const rel = await relFile.async("text")
      const target = rel.match(/<Relationship\b[^>]*Type="[^"]*\/notesSlide"[^>]*Target="([^"]+)"/)?.[1] ?? rel.match(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/notesSlide"/)?.[1]
      const nf = target ? zip.files[`ppt/${target.replace(/^\.\.\//, "")}`] : null
      if (nf) notes = notesBody(await nf.async("text"))
    }
    parts.push(`=== Slide ${i + 1} ===\n${body}${notes ? `\n[Ghi chú diễn giả]\n${notes}` : ""}`)
  }
  return parts.join("\n\n")
}
