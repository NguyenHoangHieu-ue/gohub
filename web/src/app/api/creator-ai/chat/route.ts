import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { checkRateLimit }             from "@/lib/rate-limit"
import { runCreatorAI, FileContext, type GPEvent } from "@/lib/agents/creator-ai"
import { classifySensitivity }        from "@/lib/agents/guardian-classify"
import { GoogleGenerativeAI }         from "@google/generative-ai"

export const maxDuration = 300

// Nén lịch sử dài: tóm tắt N turns cũ nhất thành 1 message → tiết kiệm token + giảm latency.
// Trả { history, summarized }. Giữ nguyên khi ngắn.
async function compressHistory(
  history: { role: string; parts: { text: string }[] }[]
): Promise<{ history: typeof history; summarized: boolean }> {
  const totalChars = history.reduce((s, m) => s + (m.parts[0]?.text?.length || 0), 0)
  if (history.length <= 20 && totalChars <= 30000) return { history, summarized: false }

  const keepRecent = 10
  const toSummarize = history.slice(0, history.length - keepRecent)
  const recent      = history.slice(history.length - keepRecent)
  if (toSummarize.length === 0) return { history, summarized: false }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash", generationConfig: { temperature: 0 } })
    const convText = toSummarize.map(m => `[${m.role}] ${m.parts[0]?.text || ""}`).join("\n").slice(0, 40000)
    const res = await model.generateContent(
      `Tóm tắt cuộc hội thoại sau trong < 500 từ tiếng Việt. GIỮ LẠI: facts, số liệu, mã SKU/sản phẩm, quyết định, và ngữ cảnh cần cho câu hỏi tiếp theo. Bỏ chi tiết vụn.\n\n${convText}`
    )
    const summary = res.response.text().trim()
    if (!summary) return { history, summarized: false }
    const summaryMsg = { role: "user", parts: [{ text: `[TÓM TẮT HỘI THOẠI TRƯỚC ĐÓ]\n${summary}` }] }
    return { history: [summaryMsg, ...recent], summarized: true }
  } catch {
    return { history, summarized: false }  // lỗi tóm tắt → dùng full history
  }
}

// Strip base64 image data URLs from message text trước khi đưa vào lịch sử Gemini.
// Ảnh base64 có thể ~1-3MB mỗi cái → bỏ vào history sẽ làm context bùng nổ.
function stripBase64Images(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(data:image\/[^)]{20,}\)/g, "[📸 Ảnh Gấu Pro đã tạo — xem ở trên]")
}

// ─── File parser ─────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB per file

async function parseUploadedFile(file: File): Promise<FileContext> {
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

// ─── Route handler ────────────────────────────────────────────────────────────

async function loadGpAllowed(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle()
    return data?.value ? JSON.parse(data.value) : []
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit: 10 req/min/user cho Gấu Pro (model nặng hơn Bé Gấu)
  const rlKey = `gau-pro:${session.user.username || session.user.email || "anon"}`
  const rl = checkRateLimit(rlKey, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }

  const username  = session.user.username
  const isCreator = session.user.role === "creator"

  if (!isCreator) {
    const allowed = await loadGpAllowed()
    if (!allowed.includes(username)) {
      return NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 })
    }
  }

  let messages: { role: string; content: string }[] = []
  let fileContexts: FileContext[] = []
  let conversationId: string | null = null

  try {
    const contentType = req.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const raw  = form.get("messages")
      messages   = JSON.parse(typeof raw === "string" ? raw : "[]")
      conversationId = form.get("conversation_id") as string || null

      // Support multiple files: file_0, file_1, ... or single "file"
      const fileEntries: File[] = []
      for (let i = 0; i < 10; i++) {
        const f = form.get(`file_${i}`) as File | null
        if (f && f.size > 0) fileEntries.push(f)
      }
      // Legacy single-file key
      if (fileEntries.length === 0) {
        const f = form.get("file") as File | null
        if (f && f.size > 0) fileEntries.push(f)
      }

      // Parse all files (max 5, errors are soft per file)
      const parsed = await Promise.allSettled(fileEntries.slice(0, 5).map(parseUploadedFile))
      for (const r of parsed) {
        if (r.status === "fulfilled") fileContexts.push(r.value)
        // Silently skip failed files — error will be reflected in context
      }
      // Collect parse errors and inject as text context so AI can mention them
      const errors = parsed.filter(r => r.status === "rejected").map(r => (r as PromiseRejectedResult).reason?.message)
      if (errors.length) {
        fileContexts.push({ name: "_errors", type: "text", content: `Lỗi đọc file: ${errors.join("; ")}` })
      }
    } else {
      const body = await req.json()
      messages        = Array.isArray(body.messages) ? body.messages : []
      conversationId  = body.conversation_id ?? null
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invalid request" }, { status: 400 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 })
  }

  if (!isCreator) {
    const lastMsg = messages[messages.length - 1]?.content || ""
    const { category } = classifySensitivity(lastMsg)
    if (category === "system_internal") {
      return NextResponse.json({
        text: "Thông tin này liên quan đến nội bộ hệ thống và không thể chia sẻ qua Gấu Pro. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
        sources: [],
      })
    }
  }

  const rawHistory = messages.slice(0, -1).map(m => ({
    role:  m.role === "user" ? "user" : "model",
    parts: [{ text: stripBase64Images(m.content) }],
  }))
  const { history, summarized } = await compressHistory(rawHistory)
  const lastMsg = messages[messages.length - 1]?.content || ""

  const encoder = new TextEncoder()
  const GP_PREFIX = "[GP] "

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GPEvent) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch {}
      }
      try {
        const { text, sources } = await runCreatorAI(
          history, lastMsg,
          fileContexts.length > 0 ? fileContexts : undefined,
          emit,
        )

        // Tạo/cập nhật conversation (đồng bộ để có convId trước khi gửi done)
        let savedConvId = conversationId
        try {
          if (!savedConvId) {
            const { data: conv } = await supabaseAdmin
              .from("conversations")
              .insert({ username, title: GP_PREFIX + lastMsg.slice(0, 47) })
              .select("id").single()
            savedConvId = conv?.id ?? null
          }
          if (savedConvId) {
            void (async () => {
              try {
                await supabaseAdmin.from("chat_messages").insert([
                  { conversation_id: savedConvId, role: "user",      content: lastMsg, agent_id: "gau_pro", agent_name: "Gấu Pro" },
                  { conversation_id: savedConvId, role: "assistant", content: text,    agent_id: "gau_pro", agent_name: "Gấu Pro" },
                ])
                await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", savedConvId!)
              } catch (e: any) { console.error("[CreatorAI] save messages:", e) }
            })()
          }
        } catch (e) { console.error("[CreatorAI] save conversation:", e) }

        emit({ type: "text",    content: text })
        emit({ type: "done",   conversationId: savedConvId, sources, summarized })
      } catch (e: any) {
        console.error("[CreatorAI] Error:", e.message)
        emit({ type: "error", message: e.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  })
}

// Combine multiple FileContexts into one for Gemini.
// Binary files (PDF/image) take priority; text files are concatenated.
function combineFileContexts(contexts: FileContext[]): FileContext {
  // Separate binary vs text
  const binary = contexts.filter(c => c.type !== "text")
  const texts  = contexts.filter(c => c.type === "text")

  if (binary.length === 1 && texts.length === 0) return binary[0]

  // If binary exists alongside text, include binary first with text appended
  const textContent = texts.map(c => `=== FILE: ${c.name} ===\n${c.content}`).join("\n\n---\n\n")

  if (binary.length >= 1) {
    // Return first binary with extra text files injected into the message text
    // by modifying the content description
    return {
      ...binary[0],
      name:    `${binary[0].name} + ${contexts.length - 1} file(s)`,
      content: binary[0].content,
      // extra text will be injected via the message text in runCreatorAI
      extraText: textContent || undefined,
    } as FileContext
  }

  // All text: combine
  return {
    name:    contexts.map(c => c.name).join(", "),
    type:    "text",
    content: textContent,
  }
}
