import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { checkRateLimit }             from "@/lib/rate-limit"
import { runCreatorAI, FileContext, type GPEvent } from "@/lib/agents/creator-ai"
import { classifySensitivity }        from "@/lib/agents/guardian-classify"
import { parseUploadedFile }          from "@/lib/agents/file-parser"
import { loadGpAllowed }              from "@/lib/gp-access"
import { compressHistory, stripBase64Images } from "@/lib/agents/creator/compress"

export const maxDuration = 300

// ─── Route handler ────────────────────────────────────────────────────────────
// parseUploadedFile/FileContext nay dùng chung với Bé Gấu — xem @/lib/agents/file-parser.ts

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit: 10 req/min/user cho Gấu Pro (model nặng hơn Bé Gấu)
  const rlKey = `gau-pro:${session.user.username || session.user.email || "anon"}`
  const rl = await checkRateLimit(rlKey, 10, 60_000)
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
          isCreator,
          username,
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
