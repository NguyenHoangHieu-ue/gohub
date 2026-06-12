// KB utilities: parse, chunk, embed

export async function parseFileToText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""

  if (ext === "pdf" || mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse")
    const result   = await pdfParse(buffer)
    return result.text
  }

  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth")
    const result  = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // md, txt, or any text file
  return buffer.toString("utf-8")
}

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 60) chunks.push(chunk)  // skip near-empty chunks
    if (end >= cleaned.length) break
    start = end - overlap
  }
  return chunks
}

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${process.env.GEMINI_KEY}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content: { parts: [{ text }] } }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Embed failed: ${err.error?.message ?? res.status}`)
  }
  const data = await res.json()
  return data.embedding.values as number[]
}

export const DEPARTMENTS = ["all", "sales", "product", "tech", "finance"] as const
export type Department = typeof DEPARTMENTS[number]

export const DEPT_LABELS: Record<Department, string> = {
  all:     "Tất cả",
  sales:   "Sales",
  product: "Product",
  tech:    "Tech",
  finance: "Finance",
}
