// Đọc file người dùng đính kèm (Bé Gấu + Gấu Pro dùng chung — tránh chép lại logic).
// Tách từ web/src/app/api/creator-ai/chat/route.ts (s190+3) khi thêm upload cho Bé Gấu.

export interface FileContext {
  name:      string
  type:      "text" | "image" | "pdf"
  content:   string    // text content (for "text") or base64 (for "image"/"pdf")
  mimeType?: string    // e.g. "image/png", "application/pdf"
  extraText?: string   // additional text from sibling files when binary + text combined
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB per file

export async function parseUploadedFile(file: File): Promise<FileContext> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Giới hạn 20 MB/file.`)
  }

  const name = file.name
  const mime = file.type || ""
  const ext  = name.split(".").pop()?.toLowerCase() || ""

  // ── Excel → CSV text ───────────────────────────────────────────────────────
  if (mime.includes("spreadsheetml") || mime.includes("excel") || ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx")
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: "buffer" })
    const parts: string[] = []
    for (const sheetName of wb.SheetNames) {
      const ws  = wb.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(ws)
      if (csv.trim()) parts.push(`=== Sheet: ${sheetName} ===\n${csv}`)
    }
    return { name, type: "text", content: parts.join("\n\n") || "(File Excel trống)" }
  }

  // ── PowerPoint (.pptx) → text via jszip ──────────────────────────────────
  if (mime.includes("presentationml") || ext === "pptx" || ext === "ppt") {
    try {
      const JSZip = (await import("jszip")).default
      const buf   = await file.arrayBuffer()
      const zip   = await JSZip.loadAsync(buf)
      // Extract text from each slide XML
      const slideFiles = Object.keys(zip.files)
        .filter(f => /ppt\/slides\/slide\d+\.xml$/i.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/slide(\d+)/)?.[1] || "0")
          const nb = parseInt(b.match(/slide(\d+)/)?.[1] || "0")
          return na - nb
        })
      if (!slideFiles.length) throw new Error("Không tìm thấy slide")
      const slides = await Promise.all(slideFiles.map(async (f, i) => {
        const xml  = await zip.files[f].async("text")
        const text = xml.replace(/<a:t>/g, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        return `=== Slide ${i + 1} ===\n${text}`
      }))
      return { name, type: "text", content: slides.join("\n\n") }
    } catch (e: any) {
      throw new Error(`Không đọc được file PPTX "${name}": ${e.message}`)
    }
  }

  // ── DOCX / DOC → plain text via mammoth ──────────────────────────────────
  if (mime.includes("wordprocessingml") || mime.includes("msword") || ext === "docx" || ext === "doc") {
    const mammoth = await import("mammoth")
    const buf     = await file.arrayBuffer()
    const result  = await mammoth.extractRawText({ buffer: Buffer.from(buf) })
    const text    = result.value.trim()
    if (!text) throw new Error(`File "${name}" không có nội dung text.`)
    const notes = result.messages.filter(m => m.type === "warning").map(m => m.message).join("; ")
    return { name, type: "text", content: notes ? `${text}\n\n[Lưu ý: ${notes}]` : text }
  }

  // ── CSV / JSON / TXT / MD / code → text ───────────────────────────────────
  if (
    mime.startsWith("text/") ||
    ["csv","json","txt","md","mdx","ts","tsx","js","jsx","py","sql","yaml","yml","toml","xml","html","sh","bat","env"].includes(ext)
  ) {
    return { name, type: "text", content: await file.text() }
  }

  // ── PDF → inline data (Gemini multimodal) ────────────────────────────────
  if (mime === "application/pdf" || ext === "pdf") {
    const buf    = await file.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    return { name, type: "pdf", content: base64, mimeType: "application/pdf" }
  }

  // ── Images → inline data ──────────────────────────────────────────────────
  if (mime.startsWith("image/") || ["png","jpg","jpeg","webp","gif","bmp","svg","ico"].includes(ext)) {
    const buf    = await file.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const mType  = mime.startsWith("image/") ? mime : `image/${ext === "svg" ? "svg+xml" : ext}`
    return { name, type: "image", content: base64, mimeType: mType }
  }

  // ── Fallback: try as text ──────────────────────────────────────────────────
  try {
    return { name, type: "text", content: await file.text() }
  } catch {
    throw new Error(`Không hỗ trợ định dạng "${ext}". Hỗ trợ: PDF, DOCX, PPTX, ảnh, Excel, CSV, JSON, TXT, code.`)
  }
}
