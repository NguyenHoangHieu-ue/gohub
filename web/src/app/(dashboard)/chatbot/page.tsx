"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession, signOut }                        from "next-auth/react"
import { Send, Bot, User, Sparkles, X, FileSpreadsheet, Paperclip, FileText, Image as ImageIcon, ThumbsUp, ThumbsDown, Square, CheckCircle2, Circle, Loader2, Volume2, ArrowDown, Radio, Languages, Mic, FileAudio, Hourglass, SquarePen } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "@/lib/agents/types"
import type { PlanStep } from "@/lib/agents/creator-ai"
import ChatChart from "@/components/chat-chart"
import { LiveSession } from "@/components/gau-pro/live-session"
import { MeetingRecorder } from "@/components/be-gau/meeting-recorder"
import { TranslateSession } from "@/components/be-gau/translate-session"
import { ConversationSwitcher } from "@/components/chat/conversation-switcher"
import { OverflowMenu, type MenuItem } from "@/components/chat/overflow-menu"
import { DictationButton } from "@/components/chat/dictation-button"
import { useStickToBottom } from "@/components/chat/use-stick-to-bottom"
import { ExportBar, stripExportHelperBlocks } from "@/components/chat-export"

// sessionStorage keys
const SS_CONV_ID      = "gohub_conv_id"
const SS_CONV_USER    = "gohub_conv_user"
const SS_MESSAGES     = "gohub_messages"

interface Conversation {
  id:         string
  title:      string
  created_at: string
  updated_at: string
}

interface StoredMessage extends Message {
  agent?: { id: string; name: string }
  fileName?: string  // tên file đính kèm (hiển thị chip trên bong bóng user), không lưu DB
}

// ─── Đính kèm ảnh/file (s190+3) ────────────────────────────────────────────────
const ATTACH_ACCEPT = ".pdf,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.json,.txt,.md,.ts,.tsx,.js,.jsx,.py,.sql,.yaml,.yml,.toml,.xml,.html,.sh"
const ATTACH_MAX_MB    = 20
const ATTACH_MAX_FILES = 5

function isImageFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return ["png","jpg","jpeg","webp","gif","bmp"].includes(ext)
}

function attachFileIcon(name: string) {
  if (isImageFile(name)) return <ImageIcon size={13} />
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["xlsx","xls","csv"].includes(ext)) return <FileSpreadsheet size={13} />
  return <FileText size={13} />
}

const AGENT_COLORS: Record<string, string> = {
  "tu-van":        "bg-brand-100 text-brand-700",
  "tra-cuu":       "bg-blue-100 text-blue-700",
  "giai-dap":      "bg-amber-100 text-amber-700",
  "gia-cogs":      "bg-green-100 text-green-700",
  "gap-analysis":  "bg-purple-100 text-purple-700",
  "bi-analyst":    "bg-indigo-100 text-indigo-700",
  "data-explorer": "bg-slate-200 text-slate-700",
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function extractChartData(text: string): { chart: any; before: string; after: string } | null {
  const m = text.match(/```chart\s*([\s\S]*?)\s*```/)
  if (!m) return null
  try {
    const chart = JSON.parse(m[1])
    if (!chart.chart_type || !chart.data) return null
    const idx = text.indexOf("```chart")
    const end = text.indexOf("```", idx + 7) + 3
    return { chart, before: text.slice(0, idx).trim(), after: text.slice(end).trim() }
  } catch { return null }
}

// ─── Markdown renderer (dùng chung, hoisted để BeGauMsgContent dùng được) ───────────────────────────
function renderMarkdown(text: string) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-slate-100">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
        ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
        li:     ({ children }) => <li className="text-gray-700">{children}</li>,
        h1:     ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
        h2:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
        h3:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
        hr:     () => <hr className="my-2 border-gray-300 dark:border-slate-600" />,
        code:   ({ children }) => <code className="bg-gray-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
        table:  ({ children }) => <div className="overflow-x-auto mb-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm"><table className="text-xs border-collapse w-full">{children}</table></div>,
        thead:  ({ children }) => <thead className="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{children}</thead>,
        tbody:  ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
        tr:     ({ children }) => <tr className="hover:bg-gray-50 transition-colors">{children}</tr>,
        th:     ({ children }) => <th className="px-3 py-2 text-left font-semibold whitespace-nowrap text-gray-700 dark:text-slate-200">{children}</th>,
        td:     ({ children }) => <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{children}</td>,
      }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

// ─── Nội dung 1 message assistant — tách component để có contentRef riêng (cần cho xuất PDF) ────────
// U3: đọc to câu trả lời (tính năng "tts"). Bấm lần nữa để dừng.
function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { audioRef.current?.pause() }, [])
  const toggle = async () => {
    if (state !== "idle") { audioRef.current?.pause(); audioRef.current = null; setState("idle"); return }
    setState("loading")
    try {
      const res = await fetch("/api/chat/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); setState("idle") }
      await audio.play()
      setState("playing")
    } catch (e: any) { setState("idle"); alertless(e.message) }
  }
  return (
    <button onClick={toggle} title={state === "playing" ? "Dừng đọc" : "Đọc câu trả lời"} aria-label="Đọc câu trả lời"
      className={`p-1 rounded-md transition-colors ${state !== "idle" ? "text-brand-600 bg-brand-50" : "text-gray-300 hover:text-brand-600 hover:bg-brand-50"}`}>
      {state === "loading" ? <Loader2 size={13} className="animate-spin" /> : state === "playing" ? <Square size={12} /> : <Volume2 size={13} />}
    </button>
  )
}
// Không dùng alert() (chặn trang) — ghi console là đủ, nút tự về trạng thái chờ.
const alertless = (m: string) => console.warn("[tts]", m)

function BeGauMsgContent({ msg, streaming, isLast, rated, onFeedback, canSpeak }: {
  msg: StoredMessage; streaming: boolean; isLast: boolean
  rated?: 1 | -1 | null
  onFeedback?: (rating: 1 | -1) => void
  canSpeak?: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Chưa có nội dung (agent bi-analyst/data-explorer đang chạy function-calling 10-30s)
  // → hiện hiệu ứng "đang trả lời" thay vì bong bóng rỗng (tránh cảm giác đơ).
  if (!msg.content) {
    if (streaming && isLast) {
      return (
        <div className="flex items-center gap-2 py-0.5">
          <div className="flex gap-1">
            {[0, 1, 2].map(k => (
              <span key={k} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
                style={{ animationDelay: `${k * 0.15}s`, animationDuration: "0.8s" }} />
            ))}
          </div>
          <span className="text-xs text-gray-400">{(msg.agent?.name || "Bé Gấu")} đang trả lời…</span>
        </div>
      )
    }
    return <span className="text-xs text-gray-400 italic">Không có nội dung trả lời.</span>
  }

  const display = stripExportHelperBlocks(msg.content)
  const chartResult = (msg.agent?.id === "bi-analyst" || msg.agent?.id === "data-explorer")
    ? extractChartData(display) : null

  return (
    <div>
      <div ref={contentRef}>
        {chartResult ? (
          <>
            {chartResult.before && renderMarkdown(chartResult.before)}
            <ChatChart data={chartResult.chart} />
            {chartResult.after && renderMarkdown(chartResult.after)}
          </>
        ) : renderMarkdown(display)}
        {streaming && isLast && (
          <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
        )}
      </div>
      {/* Ẩn nút xuất/feedback khi CHÍNH message này đang stream dở (marker có thể chưa đóng \`\`\` xong) */}
      {!(streaming && isLast) && (
        <div className="flex items-center gap-2">
          <ExportBar content={msg.content} contentRef={contentRef} apiEndpoint="/api/chat/export" />
          {canSpeak && <SpeakButton text={display} />}
          {onFeedback && (
            <div className="flex items-center gap-1">
              <button onClick={() => onFeedback(1)} title="Câu trả lời hữu ích"
                className={`p-1 rounded-md transition-colors ${rated === 1 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}>
                <ThumbsUp size={13} />
              </button>
              <button onClick={() => onFeedback(-1)} title="Câu trả lời chưa tốt"
                className={`p-1 rounded-md transition-colors ${rated === -1 ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20" : "text-gray-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"}`}>
                <ThumbsDown size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Nhóm theo năng lực (chunking — giúp user hiểu bot làm được những nhóm việc gì)
const QUICK_GROUPS = [
  { label: "Tìm sản phẩm GoHub", prompts: [
    "Tìm gói eSIM đi Nhật 7 ngày",
    "Có gói unlimited đi Thái Lan không?",
  ]},
  { label: "Catalog nhà cung cấp (NCC)", prompts: [
    "WM có gói gì cho Hàn Quốc?",
    "WM có sản phẩm nào chưa tạo trong hệ thống?",
  ]},
  { label: "Doanh thu & đơn hàng", prompts: [
    "Doanh thu tháng này bao nhiêu?",
    "Top 5 kênh bán doanh thu cao nhất tháng này",
  ]},
  { label: "Giải đáp hệ thống", prompts: [
    "Giải thích cấu trúc mã SKU",
  ]},
]

export default function ChatbotPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ""
  const userRole = session?.user?.role || "staff"

  const [conversations,  setConversations] = useState<Conversation[]>([])
  const [activeConvId,   setActiveConvId]  = useState<string | null>(null)
  const [messages,       setMessages]      = useState<StoredMessage[]>([])
  const [input,          setInput]         = useState("")
  const [loading,        setLoading]       = useState(false)
  const [streaming,      setStreaming]      = useState(false)
  const [agentName,      setAgentName]     = useState<string | null>(null)
  const [deletingId,     setDeletingId]    = useState<string | null>(null)
  const [feedbackGiven,  setFeedbackGiven] = useState<Record<number, 1 | -1>>({})   // 👍/👎 mỗi câu trả lời
  const [plan,           setPlan]          = useState<PlanStep[]>([])               // U3: kế hoạch từng bước
  const abortRef = useRef<AbortController | null>(null)
  const [features,       setFeatures]      = useState<string[]>([])                 // U3: tính năng bật cho vai trò
  const [showLive,       setShowLive]      = useState(false)
  const [bgMode,         setBgMode]        = useState(false)                       // U3: giao việc chạy nền
  const [showTranslate,  setShowTranslate] = useState(false)                       // U3: dịch trực tiếp (CS)
  const [meetingMode,    setMeetingMode]   = useState<"record" | "file" | null>(null)  // U4: ghi âm cuộc họp mở từ menu ⋯
  const [showAll,        setShowAll]       = useState(false)                       // U4: hiện cả tin cũ đã thu gọn

  useEffect(() => {
    fetch("/api/chat/features").then(r => r.ok ? r.json() : null).then(d => setFeatures(d?.features ?? [])).catch(() => {})
  }, [])

  // Đính kèm ảnh/file (s190+3)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [fileError,     setFileError]     = useState("")
  const [imgPreviews,   setImgPreviews]   = useState<Map<string, string>>(new Map())
  const [dragging,      setDragging]      = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initialized = useRef(false)
  const msgCountRef = useRef(0)  // track message count for isFirst detection

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const newFiles  = Array.from(incoming)
    const oversized = newFiles.filter(f => f.size > ATTACH_MAX_MB * 1024 * 1024)
    const valid     = newFiles.filter(f => f.size <= ATTACH_MAX_MB * 1024 * 1024)

    setFileError(oversized.length ? `File quá lớn (>${ATTACH_MAX_MB}MB): ${oversized.map(f => f.name).join(", ")}` : "")
    if (!valid.length) return

    setAttachedFiles(prev => [...prev, ...valid].slice(-ATTACH_MAX_FILES))
    valid.filter(f => isImageFile(f.name)).forEach(f => {
      const url = URL.createObjectURL(f)
      setImgPreviews(prev => new Map(prev).set(f.name, url))
    })
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ""
  }, [addFiles])

  const removeAttachedFile = useCallback((name: string) => {
    setAttachedFiles(prev => prev.filter(f => f.name !== name))
    setImgPreviews(prev => { const m = new Map(prev); m.delete(name); return m })
  }, [])

  // Feedback loop 👍/👎 (s196+13, ý tưởng #3 roadmap audit Bé Gấu) — chưa có cơ chế nào cho non-creator
  // đánh giá chất lượng câu trả lời trực tiếp; trước chỉ Gấu Pro/admin xem qua LLM-judge nội bộ.
  const sendFeedback = useCallback((index: number, rating: 1 | -1) => {
    if (feedbackGiven[index]) return
    setFeedbackGiven(prev => ({ ...prev, [index]: rating }))
    const question = messages[index - 1]?.content || ""
    const answer    = messages[index]?.content || ""
    fetch("/api/chat/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, rating, agentId: messages[index]?.agent?.id }),
    }).catch(() => {})
  }, [feedbackGiven, messages])

  // Paste ảnh từ clipboard (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith("image/"))
      if (files.length) { e.preventDefault(); addFiles(files) }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [addFiles])

  // Giải phóng object URL khi rời trang
  useEffect(() => () => {
    imgPreviews.forEach(url => URL.revokeObjectURL(url))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const busy = loading || streaming
  // U4: bám đáy chỉ khi người dùng đang ở cuối; đọc tin cũ thì không giật xuống, có nút "Tin mới nhất".
  const { ref: scrollRef, atBottom, scrollToBottom, jumpToBottom } = useStickToBottom<HTMLDivElement>([messages, loading, plan])

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const saveToSS = useCallback((convId: string, msgs: StoredMessage[]) => {
    try {
      sessionStorage.setItem(SS_CONV_ID,   convId)
      sessionStorage.setItem(SS_CONV_USER, userName)
      sessionStorage.setItem(SS_MESSAGES,  JSON.stringify(msgs))
    } catch {}
  }, [userName])

  const saveMessage = useCallback((convId: string, msg: StoredMessage, isFirst = false) => {
    fetch(`/api/chat/conversations/${convId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        role:       msg.role,
        content:    msg.content,
        agent_id:   msg.agent?.id,
        agent_name: msg.agent?.name,
        isFirst,
      }),
    }).catch(() => {})
  }, [])

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res  = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const conv = await res.json()
      setConversations(prev => [conv, ...prev])
      return conv.id as string
    } catch { return null }
  }, [])

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    try {
      const res  = await fetch("/api/chat/conversations")
      const data = await res.json()
      const convs = Array.isArray(data) ? data : []
      setConversations(convs)
      return convs
    } catch { return [] }
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res  = await fetch(`/api/chat/conversations/${convId}`)
      const data = await res.json()
      if (!Array.isArray(data)) return
      const msgs: StoredMessage[] = data.map((m: any) => ({
        role:    m.role,
        content: m.content,
        agent:   m.agent_id ? { id: m.agent_id, name: m.agent_name ?? m.agent_id } : undefined,
      }))
      setMessages(msgs)
      setShowAll(false)
      msgCountRef.current = msgs.length
      saveToSS(convId, msgs)
      jumpToBottom()
    } catch {}
  }, [saveToSS, jumpToBottom])

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userName || initialized.current) return
    initialized.current = true

    void (async () => {
      // 0. Link mở lại hội thoại cũ (?c=id — từ kết quả tìm hội thoại cũ của trợ lý)
      const linked = new URLSearchParams(window.location.search).get("c")
      if (linked) {
        loadConversations()
        setActiveConvId(linked)
        await loadMessages(linked)
        return
      }
      // 1. Restore sessionStorage (same tab/session — fastest path)
      try {
        const ssUser = sessionStorage.getItem(SS_CONV_USER)
        const ssId   = sessionStorage.getItem(SS_CONV_ID)
        const ssMsgs = sessionStorage.getItem(SS_MESSAGES)
        if (ssUser === userName && ssId && ssMsgs) {
          const msgs = JSON.parse(ssMsgs) as StoredMessage[]
          setMessages(msgs)
          setActiveConvId(ssId)
          msgCountRef.current = msgs.length
          jumpToBottom()
          loadConversations()  // danh sách cho nút chọn hội thoại
          return
        }
      } catch {}

      // 2. No sessionStorage → load from Supabase + auto-select last conversation
      const convs = await loadConversations()
      if (convs.length > 0) {
        setActiveConvId(convs[0].id)
        await loadMessages(convs[0].id)
      }
      // else: start fresh (don't auto-create until first message)
    })()
  }, [userName, loadConversations, loadMessages, jumpToBottom])

  // ─── Switch conversation ──────────────────────────────────────────────────

  const switchConversation = useCallback(async (conv: Conversation) => {
    if (conv.id === activeConvId) return
    setActiveConvId(conv.id)
    setMessages([])
    setInput("")
    await loadMessages(conv.id)
  }, [activeConvId, loadMessages])

  // ─── New conversation ─────────────────────────────────────────────────────

  const startNew = useCallback(() => {
    setActiveConvId(null)
    setMessages([])
    setShowAll(false)
    msgCountRef.current = 0
    try {
      sessionStorage.removeItem(SS_CONV_ID)
      sessionStorage.removeItem(SS_MESSAGES)
    } catch {}
  }, [])

  // ─── Delete conversation ──────────────────────────────────────────────────

  const deleteConversation = useCallback(async (convId: string) => {
    setDeletingId(convId)
    try {
      await fetch(`/api/chat/conversations/${convId}`, { method: "DELETE" })
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConvId === convId) startNew()
    } finally {
      setDeletingId(null)
    }
  }, [activeConvId, startNew])

  // ─── Send ─────────────────────────────────────────────────────────────────

  const send = async (content: string) => {
    const text = content.trim()
    if ((!text && attachedFiles.length === 0) || busy) return

    // Ensure conversation exists
    let convId = activeConvId
    if (!convId) {
      convId = await createConversation()
      if (!convId) return
      setActiveConvId(convId)
    }

    const isFirstMsg = msgCountRef.current === 0
    const fileNames  = attachedFiles.map(f => f.name).join(", ")

    const userMsg: StoredMessage = {
      role:     "user",
      content:  text || `[Gửi ${attachedFiles.length} file: ${fileNames}]`,
      fileName: fileNames || undefined,
    }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    jumpToBottom()
    const filesToSend = [...attachedFiles]
    setAttachedFiles([])
    setImgPreviews(new Map())
    setFileError("")
    setLoading(true)
    setAgentName(null)
    msgCountRef.current = next.length

    saveMessage(convId, userMsg, isFirstMsg)
    saveToSS(convId, next)

    // U3: chạy nền — không giữ kết nối; xong nhắn Lark + hội thoại "⏳ …" trong Lịch sử. Việc nền không kèm lịch sử chat/file.
    if (bgMode && filesToSend.length === 0) {
      setLoading(false)
      let reply: string
      try {
        const res = await fetch("/api/chat/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }) })
        const d = await res.json().catch(() => ({}))
        reply = res.ok
          ? `⏳ Đã giao việc chạy nền: "${d.job?.title ?? text.slice(0, 80)}". Bé Gấu làm xong sẽ nhắn Lark cho bạn và lưu kết quả thành 1 cuộc trò chuyện "⏳ …" trong Lịch sử.`
          : `Không giao được việc nền: ${d.error || `HTTP ${res.status}`}`
      } catch (e: any) { reply = `Không giao được việc nền: ${e.message}` }
      const assistantMsg: StoredMessage = { role: "assistant", content: reply }
      const finalMsgs = [...next, assistantMsg]
      setMessages(finalMsgs)
      saveMessage(convId, assistantMsg)
      saveToSS(convId, finalMsgs)
      msgCountRef.current = finalMsgs.length
      return
    }

    let streamStarted   = false
    let currentAgent: { id: string; name: string } | undefined
    let assistantText   = ""
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPlan([])

    try {
      const serializedMsgs = next.map(m => ({ role: m.role, content: m.content }))
      let res: Response
      if (filesToSend.length > 0) {
        const form = new FormData()
        form.append("messages", JSON.stringify(serializedMsgs))
        form.append("userName", userName)
        form.append("conversation_id", convId)
        filesToSend.forEach((f, i) => form.append(`file_${i}`, f))
        res = await fetch("/api/chat", { method: "POST", body: form, signal: ctrl.signal })
      } else {
        res = await fetch("/api/chat", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ messages: serializedMsgs, userName, conversation_id: convId }),
          signal:  ctrl.signal,
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream")

      const decoder     = new TextDecoder()
      setLoading(false)
      setStreaming(true)
      streamStarted = true

      setMessages(prev => [...prev, { role: "assistant", content: "" }])
      const render = () => setMessages(prev => {
        const u = [...prev]
        u[u.length - 1] = { role: "assistant", content: assistantText, agent: currentAgent }
        return u
      })

      // U3: luồng SSE — mỗi sự kiện "data: {json}\n\n" (agent / delta / plan / done).
      let buf = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const events = buf.split("\n\n")
          buf = events.pop() ?? ""
          for (const raw of events) {
            if (!raw.startsWith("data: ")) continue
            let ev: any
            try { ev = JSON.parse(raw.slice(6)) } catch { continue }
            if (ev.type === "agent") { currentAgent = { id: ev.id, name: ev.name }; setAgentName(ev.name) }
            else if (ev.type === "delta") { assistantText += ev.content; render() }
            else if (ev.type === "plan") setPlan(ev.steps ?? [])
          }
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") throw e
        assistantText = `${assistantText}\n\n⏹ Đã dừng theo yêu cầu.`.trim()
        render()
      }

      // Save complete assistant message
      const assistantMsg: StoredMessage = { role: "assistant", content: assistantText, agent: currentAgent }
      saveMessage(convId, assistantMsg)

      const finalMsgs = [...next, assistantMsg]
      msgCountRef.current = finalMsgs.length
      saveToSS(convId, finalMsgs)

      // Update conversation title in list if first message
      if (isFirstMsg) {
        const title = userMsg.content.slice(0, 50) + (userMsg.content.length > 50 ? "…" : "")
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title, updated_at: new Date().toISOString() } : c
        ))
      } else {
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === convId)
          if (idx === -1) return prev
          const updated = { ...prev[idx], updated_at: new Date().toISOString() }
          return [updated, ...prev.filter(c => c.id !== convId)]
        })
      }

    } catch (e: any) {
      const errMsg = e?.name === "AbortError" ? "⏹ Đã dừng theo yêu cầu."
        : (userRole === "admin" || userRole === "creator") ? `Lỗi: ${e.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
      if (streamStarted) {
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { role: "assistant", content: errMsg }
          return u
        })
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: errMsg }])
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStreaming(false)
      setAgentName(null)
    }
  }
  const stop = () => abortRef.current?.abort()

  // U3: lượt hỏi–đáp không qua /api/chat (vd ghi âm → biên bản) — thêm vào hội thoại đang mở và lưu như tin thường.
  const appendTurn = async (userText: string, reply: string) => {
    let convId = activeConvId
    if (!convId) {
      convId = await createConversation()
      if (!convId) return
      setActiveConvId(convId)
    }
    const isFirstMsg = msgCountRef.current === 0
    const userMsg: StoredMessage = { role: "user", content: userText }
    const assistantMsg: StoredMessage = { role: "assistant", content: reply }
    const finalMsgs = [...messages, userMsg, assistantMsg]
    setMessages(finalMsgs)
    saveMessage(convId, userMsg, isFirstMsg)
    saveMessage(convId, assistantMsg)
    saveToSS(convId, finalMsgs)
    msgCountRef.current = finalMsgs.length
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const COLLAPSE_AT = 40   // U4: hội thoại dài — chỉ hiện 40 tin gần nhất, tin cũ thu gọn
  const hiddenCount = showAll ? 0 : Math.max(0, messages.length - COLLAPSE_AT)
  const activeTitle = conversations.find(c => c.id === activeConvId)?.title || (messages.length ? "Cuộc trò chuyện" : "Cuộc trò chuyện mới")
  const menuItems: MenuItem[] = [
    ...(features.includes("live") ? [{ key: "live", label: "Trò chuyện trực tiếp", hint: "Nói chuyện bằng giọng, chia sẻ màn hình", icon: <Radio size={15} />, onClick: () => setShowLive(true), disabled: busy }] : []),
    ...(features.includes("translate") ? [{ key: "translate", label: "Dịch trực tiếp", hint: "Phiên dịch với khách nước ngoài", icon: <Languages size={15} />, onClick: () => setShowTranslate(true), disabled: busy }] : []),
    ...(features.includes("transcribe") ? [
      { key: "meeting", label: "Ghi âm cuộc họp → biên bản", hint: "Tối đa ~35 phút", icon: <Mic size={15} />, onClick: () => setMeetingMode("record"), disabled: busy || !!meetingMode },
      { key: "meeting-file", label: "Biên bản từ file ghi âm", hint: "File ≤ 4MB", icon: <FileAudio size={15} />, onClick: () => setMeetingMode("file"), disabled: busy || !!meetingMode },
    ] : []),
    ...(features.includes("background") ? [{ key: "bg", label: bgMode ? "Tắt chế độ chạy nền" : "Chạy nền việc dài", hint: "Xong nhắn Lark + lưu vào lịch sử", icon: <Hourglass size={15} />, onClick: () => setBgMode(v => !v) }] : []),
  ]

  return (
    <div className="flex flex-col p-3 md:p-6" style={{ height: "100vh" }}>
      {/* Header (U4): tên hội thoại → lịch sử; ⋯ gom chức năng phụ */}
      <div className="flex items-center justify-between gap-2 mb-3 md:mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={20} className="text-brand-600 shrink-0" />
          <span className="hidden sm:inline text-lg font-bold text-gray-900 dark:text-slate-100 shrink-0">Bé Gấu</span>
          <span className="hidden sm:inline text-gray-300">/</span>
          <ConversationSwitcher conversations={conversations} activeId={activeConvId} title={activeTitle} disabled={busy}
            onSelect={c => switchConversation(c as Conversation)} onNew={startNew} onDelete={id => { if (!deletingId) deleteConversation(id) }} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-brand-500">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
              {agentName ? `${agentName} đang trả lời…` : "Đang xử lý…"}
            </span>
          )}
          <button type="button" onClick={startNew} disabled={busy} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40">
            <SquarePen size={17} />
          </button>
          <OverflowMenu items={menuItems} />
        </div>
      </div>

      {/* Chat container */}
      <div
        className="relative flex-1 bg-gray-50/80 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden min-h-0 shadow-sm"
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
      >
        {dragging && (
          <div className="absolute inset-0 z-20 bg-brand-600/10 dark:bg-brand-400/10 border-4 border-dashed border-brand-400 rounded-2xl flex items-center justify-center pointer-events-none">
            <div className="text-brand-600 dark:text-brand-300 text-lg font-bold flex flex-col items-center gap-2">
              <Paperclip size={32} />
              Thả file vào đây
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept={ATTACH_ACCEPT} multiple className="hidden" onChange={handleFileSelect} />

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-5 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-brand-600/25">
                <Sparkles size={22} className="text-white" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-slate-100 text-base mb-1">Bé Gấu</p>
              <p className="text-sm text-gray-500 mb-7 max-w-sm leading-relaxed">
                Tìm sản phẩm, tra cứu SKU & giá, xem catalog NCC, phân tích doanh thu/đơn hàng và làm báo cáo.
              </p>
              <div className="w-full max-w-lg space-y-3 text-left">
                {QUICK_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="px-1 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.prompts.map(q => (
                        <button key={q} onClick={() => send(q)}
                          className="text-left px-3.5 py-2.5 text-sm text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300 hover:bg-brand-50/50 dark:hover:bg-slate-700/50 transition-all shadow-sm">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hiddenCount > 0 && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShowAll(true)}
                className="px-3 py-1.5 text-xs text-gray-500 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full hover:text-brand-600 hover:border-brand-300">
                Hiện {hiddenCount} tin trước
              </button>
            </div>
          )}

          {messages.map((msg, i) => i < hiddenCount ? null : (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-600/20">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[72%]">
                {msg.role === "assistant" && msg.agent && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-md self-start font-medium tracking-wide ${AGENT_COLORS[msg.agent.id] ?? "bg-gray-100 text-gray-600"}`}>
                    {msg.agent.name}
                  </span>
                )}
                {msg.role === "user" && msg.fileName && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-brand-100 bg-brand-700/60 rounded-lg self-end">
                    {attachFileIcon(msg.fileName)}
                    {msg.fileName}
                  </span>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm shadow-sm"
                    : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-100 rounded-tl-sm shadow-sm"
                }`}>
                  {msg.role === "user" ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <BeGauMsgContent msg={msg} streaming={streaming} isLast={i === messages.length - 1}
                      rated={feedbackGiven[i]} onFeedback={r => sendFeedback(i, r)} canSpeak={features.includes("tts")} />
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={14} className="text-gray-500" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-600/20">
                <Bot size={14} className="text-white" />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-brand-300 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {busy && plan.length > 0 && (
            <div className="ml-11 max-w-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">Kế hoạch</p>
              <ul className="space-y-1">
                {plan.map((s, k) => (
                  <li key={k} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200">
                    {s.status === "done" ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                      : s.status === "in_progress" ? <Loader2 size={13} className="text-brand-500 animate-spin shrink-0" />
                      : <Circle size={13} className="text-gray-300 shrink-0" />}
                    <span className={s.status === "done" ? "text-gray-400 line-through" : ""}>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {!atBottom && messages.length > 0 && (
          <button type="button" onClick={() => scrollToBottom()} title="Tin mới nhất"
            className="absolute left-1/2 -translate-x-1/2 bottom-[5.5rem] z-10 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand-700 bg-white dark:bg-slate-800 border border-brand-200 dark:border-slate-700 rounded-full shadow-md hover:bg-brand-50">
            <ArrowDown size={13} />Tin mới nhất
          </button>
        )}

        {/* Input (U4): 📎 · ô nhập · 🎤 nói thành chữ · Gửi/Dừng */}
        <div className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex-shrink-0 rounded-b-2xl">
          {(bgMode || meetingMode) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {bgMode && (
                <span className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                  <Hourglass size={11} />Chạy nền: tin gửi đi thành việc nền, xong nhắn Lark
                  <button type="button" onClick={() => setBgMode(false)} aria-label="Tắt chạy nền" className="p-0.5 hover:text-amber-900"><X size={11} /></button>
                </span>
              )}
              {meetingMode && <MeetingRecorder autoStart={meetingMode} onResult={appendTurn} onDone={() => setMeetingMode(null)} />}
            </div>
          )}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedFiles.map(f => {
                const preview = imgPreviews.get(f.name)
                return (
                  <div key={f.name} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-50 dark:bg-brand-800/20 border border-brand-200 dark:border-brand-800 rounded-xl max-w-[220px]">
                    {preview
                      ? <img src={preview} alt={f.name} className="w-6 h-6 rounded object-cover shrink-0" />
                      : <span className="text-brand-600 dark:text-brand-400 shrink-0">{attachFileIcon(f.name)}</span>
                    }
                    <span className="text-xs text-brand-700 dark:text-brand-300 truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => removeAttachedFile(f.name)} className="text-brand-300 hover:text-red-500 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
              {attachedFiles.length >= ATTACH_MAX_FILES && (
                <span className="text-[10px] text-amber-500 self-center ml-1">Tối đa {ATTACH_MAX_FILES} file</span>
              )}
            </div>
          )}
          {fileError && <p className="text-xs text-red-500 mb-2 px-1">{fileError}</p>}

          <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || attachedFiles.length >= ATTACH_MAX_FILES}
              title={`Đính kèm ảnh/file (tối đa ${ATTACH_MAX_FILES}) · Hoặc kéo thả / paste ảnh`}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800/20 border border-gray-200 dark:border-slate-700 rounded-xl transition-colors disabled:opacity-40 relative"
            >
              <Paperclip size={16} />
              {attachedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {attachedFiles.length}
                </span>
              )}
            </button>
            <input
              type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder={attachedFiles.length > 0 ? `Hỏi gì về ${attachedFiles.length} file này?` : bgMode ? "Mô tả việc cần làm chạy nền…" : "Hỏi về sản phẩm, SKU, giá, doanh thu… hoặc nhờ làm báo cáo"}
              disabled={busy}
              className="flex-1 min-w-0 px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-300 focus:bg-white dark:focus:bg-slate-800 disabled:opacity-60 transition"
            />
            <DictationButton disabled={busy} onText={t => setInput(prev => prev ? `${prev} ${t}` : t)} />
            {busy ? (
              <button type="button" onClick={stop} title="Dừng" aria-label="Dừng"
                className="px-4 py-2.5 bg-gray-800 dark:bg-slate-600 text-white rounded-xl hover:bg-gray-700 transition-colors shadow-sm">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim() && attachedFiles.length === 0} aria-label="Gửi"
                className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                <Send size={15} />
              </button>
            )}
          </form>
        </div>
      </div>
      {showTranslate && <TranslateSession onClose={() => setShowTranslate(false)} />}
      {showLive && (
        <LiveSession apiBase="/api/chat/live" title="Bé Gấu" allowControl={false} onClose={() => setShowLive(false)}
          onSaved={() => { loadConversations() }} />
      )}
    </div>
  )
}
