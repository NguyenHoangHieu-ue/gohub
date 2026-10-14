import { createHash } from "crypto"
import { parseUploadedFile } from "@/lib/agents/file-parser"

// File → nguồn của Phòng Argon. Văn bản (docx/xlsx/pptx/md/csv/json/code...) trích thành chữ; PDF/ảnh/video/audio gửi nguyên file
// cho model (đọc được bảng, biểu đồ, hình) nên không trích chữ.
const BINARY = /^(application\/pdf|image\/|video\/|audio\/)/

export interface Extracted { text: string | null; sendBinary: boolean; mime: string; hash: string }

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex")

export function guessMime(name: string, given: string): string {
  if (given && given !== "application/octet-stream") return given
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json",
  }
  return map[ext] ?? (given || "application/octet-stream")
}

export async function extractFile(buf: Buffer, name: string, givenMime: string): Promise<Extracted> {
  const mime = guessMime(name, givenMime)
  const hash = sha256(buf)
  if (BINARY.test(mime)) return { text: null, sendBinary: true, mime, hash }
  const ctx = await parseUploadedFile(new File([new Uint8Array(buf)], name, { type: mime }))
  if (ctx.type === "text") return { text: ctx.content, sendBinary: false, mime, hash }
  return { text: null, sendBinary: true, mime: ctx.mimeType || mime, hash }
}
