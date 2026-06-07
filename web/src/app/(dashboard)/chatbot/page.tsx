"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Send, Trash2, Bot, User, History, X, ChevronLeft } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface Message {
  role:    "user" | "assistant"
  content: string
}

interface SessionItem {
  session_id:    string
  first_message: string
  created_at:    string
  message_count: number
}

const SESSION_KEY = "gohub_session_id"

const QUICK = [
  "GoHub có gói eSIM nào cho Nhật Bản không?",
  "Gói data không giới hạn có không?",
  "WM có sản phẩm nào cho Thái Lan chưa có trong hệ thống?",
  "Gói 3HK cho Hồng Kông giá thế nào?",
]

export default function ChatbotPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ""

  const [messages,         setMessages]         = useState<Message[]>([])
  const [input,            setInput]            = useState("")
  const [loading,          setLoading]          = useState(false)
  const [streaming,        setStreaming]         = useState(false)
  const [showHistory,      setShowHistory]      = useState(false)
  const [sessions,         setSessions]         = useState<SessionItem[]>([])
  const [loadingSessions,  setLoadingSessions]  = useState(false)
  const [viewingSession,   setViewingSession]   = useState<{ sid: string; messages: Message[] } | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const sessionId   = useRef<string>("")

  // sessionStorage reset khi đóng browser/tab → fresh start tự động
  // Nếu còn sessionId (refresh trang) → restore messages của session đó
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const existingSid = sessionStorage.getItem(SESSION_KEY)
    if (existingSid) {
      sessionId.current = existingSid
      fetch(`/api/chat/history?session_id=${existingSid}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.messages?.length) setMessages(data.messages) })
        .catch(() => {})
    } else {
      const newSid = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, newSid)
      sessionId.current = newSid
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading, viewingSession])

  const busy = loading || streaming

  const clearChat = () => {
    setMessages([])
    setViewingSession(null)
    const newSid = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, newSid)
    sessionId.current = newSid
  }

  const loadSessions = async () => {
    setLoadingSessions(true)
    try {
      const res  = await fetch("/api/chat/history?mode=sessions")
      const data = res.ok ? await res.json() : null
      setSessions(data?.sessions ?? [])
    } finally {
      setLoadingSessions(false)
    }
  }

  const openSession = async (sid: string) => {
    const res  = await fetch(`/api/chat/history?session_id=${sid}`)
    const data = res.ok ? await res.json() : null
    setViewingSession({ sid, messages: data?.messages ?? [] })
  }

  const saveToHistory = (userContent: string, assistantContent: string) => {
    if (!sessionId.current || !assistantContent) return
    fetch("/api/chat/history", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId.current,
        messages: [
          { direction: "user",      content: userContent },
          { direction: "assistant", content: assistantContent },
        ],
      }),
    }).catch(() => {})
  }

  const send = async (content: string) => {
    if (!content.trim() || busy) return

    const next: Message[] = [...messages, { role: "user", content }]
    setMessages(next)
    setInput("")
    setLoading(true)

    let streamStarted = false
    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, userName }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream")

      const decoder = new TextDecoder()
      let assistantMsg = ""
      setLoading(false)
      setStreaming(true)
      streamStarted = true

      setMessages(prev => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantMsg += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: assistantMsg }
          return updated
        })
      }

      saveToHistory(content, assistantMsg)

    } catch (e: any) {
      const isAdmin = (session?.user as any)?.role === "admin"
      const errMsg  = isAdmin ? `Lỗi: ${e.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
      if (streamStarted) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: errMsg }
          return updated
        })
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: errMsg }])
      }
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  const displayMessages = viewingSession ? viewingSession.messages : messages

  const renderMessages = (msgs: Message[], isViewing: boolean) =>
    msgs.map((msg, i) => (
      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
        {msg.role === "assistant" && (
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot size={15} className="text-brand-600" />
          </div>
        )}
        <div className={`max-w-[72%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          msg.role === "user"
            ? "bg-brand-600 text-white rounded-tr-sm"
            : "bg-gray-100 text-gray-800 rounded-tl-sm"
        }`}>
          {msg.role === "user" ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown
                components={{
                  p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  em:     ({ children }) => <em className="italic">{children}</em>,
                  ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
                  ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
                  li:     ({ children }) => <li className="text-gray-700">{children}</li>,
                  h1:     ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
                  h2:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                  h3:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                  hr:     () => <hr className="my-2 border-gray-300" />,
                  code:   ({ children }) => <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {!isViewing && streaming && i === msgs.length - 1 && (
                <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          )}
        </div>
        {msg.role === "user" && (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <User size={15} className="text-gray-500" />
          </div>
        )}
      </div>
    ))

  return (
    <div className="p-6 h-screen flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <Bot size={20} className="text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Chatbot Hỗ Trợ</h1>
          <span className="text-sm text-gray-400">Trợ lý AI từ dữ liệu GoHub</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !showHistory
              setShowHistory(next)
              if (next) loadSessions()
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
              showHistory
                ? "bg-brand-50 border-brand-300 text-brand-700"
                : "text-gray-500 hover:text-brand-600 hover:bg-brand-50 border-gray-200"
            }`}
          >
            <History size={14} />
            Lịch sử
          </button>
          {viewingSession ? (
            <button
              onClick={() => setViewingSession(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 border border-brand-300 rounded-lg transition-colors"
            >
              <ChevronLeft size={14} />
              Chat hiện tại
            </button>
          ) : messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              Xóa chat
            </button>
          )}
        </div>
      </div>

      {/* Chat container */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl flex overflow-hidden min-h-0">

        {/* Main chat area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Viewing history banner */}
          {viewingSession && (
            <div className="flex-shrink-0 bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
              <History size={13} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">Đang xem lịch sử — chỉ đọc</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* Empty state */}
            {displayMessages.length === 0 && !viewingSession && (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4 border border-brand-100">
                  <Bot size={28} className="text-brand-600" />
                </div>
                <p className="font-semibold text-gray-800 mb-1">Xin chào! Tôi có thể giúp gì cho bạn? 👋</p>
                <p className="text-sm text-gray-400 mb-6 max-w-xs">
                  Hỏi về sản phẩm, giá cả, hoặc thông tin gói cước SIM/eSim
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                  {QUICK.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-left px-4 py-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 border-l-[3px] border-l-brand-500 rounded-xl hover:bg-brand-50 hover:border-l-brand-600 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {viewingSession && displayMessages.length === 0 && (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Không có tin nhắn trong cuộc trò chuyện này
              </div>
            )}

            {renderMessages(displayMessages, !!viewingSession)}

            {/* Typing indicator */}
            {loading && !viewingSession && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <Bot size={15} className="text-brand-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            {viewingSession ? (
              <div className="flex items-center justify-center py-1 text-xs text-gray-400 gap-1.5">
                <History size={12} />
                Đang xem lịch sử —
                <button onClick={() => setViewingSession(null)} className="text-brand-600 hover:underline">
                  Quay về chat hiện tại
                </button>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
                <input
                  type="text" value={input} onChange={e => setInput(e.target.value)}
                  placeholder="Hỏi về sản phẩm SIM/eSim..."
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 transition"
                />
                <button type="submit" disabled={!input.trim() || busy}
                  className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="w-64 border-l border-gray-200 flex flex-col flex-shrink-0 bg-gray-50">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-white flex-shrink-0">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <History size={13} />
                Lịch sử
              </span>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {loadingSessions ? (
                <div className="p-4 text-center text-xs text-gray-400">Đang tải...</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">Chưa có lịch sử</div>
              ) : sessions.map(s => (
                <button
                  key={s.session_id}
                  onClick={() => openSession(s.session_id)}
                  className={`w-full text-left p-3 hover:bg-white transition-colors ${
                    viewingSession?.sid === s.session_id
                      ? "bg-brand-50 border-l-2 border-brand-500"
                      : ""
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-0.5">
                    {new Date(s.created_at).toLocaleString("vi-VN", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  <div className="text-xs text-gray-700 line-clamp-2 leading-relaxed">
                    {s.first_message}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{s.message_count} lượt hỏi</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
