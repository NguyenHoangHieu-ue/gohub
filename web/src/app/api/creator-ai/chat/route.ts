import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { runCreatorAI, FileContext }  from "@/lib/agents/creator-ai"
import { classifySensitivity }        from "@/lib/agents/guardian-classify"

export const maxDuration = 300

// ─── File parser ─────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

async function parseUploadedFile(file: File): Promise<FileContext> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Giới hạn 20 MB.`)
  }

  const name     = file.name
  const mime     = file.type || ""
  const ext      = name.split(".").pop()?.toLowerCase() || ""

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
    return { name, type: "text", content: parts.join("\n\n") }
  }

  // ── CSV / JSON / TXT / MD / code → text ───────────────────────────────────
  if (
    mime.startsWith("text/") ||
    ["csv", "json", "txt", "md", "mdx", "ts", "tsx", "js", "jsx", "py", "sql", "yaml", "yml", "toml", "xml", "html"].includes(ext)
  ) {
    return { name, type: "text", content: await file.text() }
  }

  // ── PDF → inline data ─────────────────────────────────────────────────────
  if (mime === "application/pdf" || ext === "pdf") {
    const buf    = await file.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    return { name, type: "pdf", content: base64, mimeType: "application/pdf" }
  }

  // ── Images → inline data ──────────────────────────────────────────────────
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
    const buf    = await file.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const mType  = mime.startsWith("image/") ? mime : `image/${ext}`
    return { name, type: "image", content: base64, mimeType: mType }
  }

  // ── Fallback: try text ─────────────────────────────────────────────────────
  try {
    return { name, type: "text", content: await file.text() }
  } catch {
    throw new Error(`Không hỗ trợ định dạng file "${ext}". Hỗ trợ: PDF, hình ảnh, Excel, CSV, JSON, TXT, code files.`)
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

  const username  = session.user.username
  const isCreator = session.user.role === "creator"

  // Non-creator: check per-user allow list
  if (!isCreator) {
    const allowed = await loadGpAllowed()
    if (!allowed.includes(username)) {
      return NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 })
    }
  }

  let messages: { role: string; content: string }[] = []
  let fileContext: FileContext | undefined

  try {
    const contentType = req.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const raw  = form.get("messages")
      messages   = JSON.parse(typeof raw === "string" ? raw : "[]")
      const file = form.get("file") as File | null
      if (file && file.size > 0) {
        fileContext = await parseUploadedFile(file)
      }
    } else {
      const body = await req.json()
      messages   = Array.isArray(body.messages) ? body.messages : []
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invalid request" }, { status: 400 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 })
  }

  // Non-creator: block system_internal queries (code/system/schema/credential)
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

  const history = messages.slice(0, -1).map(m => ({
    role:  m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }))
  const lastMsg = messages[messages.length - 1]?.content || ""

  try {
    const { text, sources } = await runCreatorAI(history, lastMsg, fileContext)
    return NextResponse.json({ text, sources })
  } catch (e: any) {
    console.error("[CreatorAI] Error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
