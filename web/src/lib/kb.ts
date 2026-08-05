// KB utilities: parse, chunk, embed
import { GoogleGenerativeAI } from "@google/generative-ai"

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

// gemini-embedding-001 → 3072 dims (same model used for Neo4j SKU embeddings)
export async function embedText(text: string): Promise<number[]> {
  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model  = genAI.getGenerativeModel({ model: "gemini-embedding-001" })
  const result = await model.embedContent(text.slice(0, 2048))
  return result.embedding.values
}

// Re-export constants từ file client-safe để server route giữ nguyên import "@/lib/kb".
// (Client component PHẢI import trực tiếp từ "@/lib/kb-constants" để không kéo pdf-parse vào bundle.)
export { DEPARTMENTS, DEPT_LABELS, type Department } from "@/lib/kb-constants"
