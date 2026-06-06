"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Send, Trash2, Bot, User, History } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface Message {
  role:    "user" | "assistant"
  content: string
}

const HISTORY_KEY   = "gohub_chat_history"
const SESSION_KEY   = "gohub_session_id"
const MAX_HISTORY   = 100

const QUICK = [
  "GoHub có gói eSIM nào cho Nhật Bản không?",
  "Gói data không giới hạn có không?",
  "WM có sản phẩm nào cho Thái Lan chưa có trong hệ thống?",
  "Gói 3HK cho Hồng Kông giá thế nào?",
]

export default function ChatbotPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ""

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState("")
  const [loading,    setLoading]    = useState(false)
  const [streaming,  setStreaming]  = useState(false)
  const [restored,   setRestored]   = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const sessionId   = useRef<string>("")  // UUID per browser session

  // Khởi tạo sessionId từ sessionStorage và load lịch sử
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Lấy hoặc tạo sessionId
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    sessionId.current = sid

    // Ưu tiên 1: localStorage (cùng thiết bị, cùng browser)
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) {
        const parsed: Message[] = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-MAX_HISTORY))
          setRestored(true)
          return
        }
      }
    } catch {}

    // Ưu tiên 2: DB (thiết bị khác hoặc xóa localStorage)
    fetch("/api/chat/history")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages?.length) {
          setMessages(data.messages)
          setRestored(true)
          // Lưu vào localStorage để lần sau nhanh hơn
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(data.messages)) } catch {}
        }
      })
      .catch(() => {})
  }, [])

  // Lưu lịch sử vào localStorage mỗi khi messages thay đổi
  useEffect(() => {
    if (!initialized.current || messages.length === 0) return
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)))
    } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const busy = loading || streaming

  const clearChat = () => {
    setMessages([])
    setRestored(false)
    // Tạo session mới khi xóa chat
    const newSid = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, newSid)
    sessionId.current = newSid
    try { localStorage.removeItem(HISTORY_KEY) } catch {}
  }

  // Lưu cặp user+assistant vào DB (fire-and-forget)
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
    setRestored(false)

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

      // Lưu vào DB sau khi stream hoàn tất
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
          {restored && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg">
              <History size={12} />
              Đã khôi phục lịch sử
            </span>
          )}
          {messages.length > 0 && (
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
      <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Empty state */}
          {messages.length === 0 && (
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

          {/* Messages */}
          {messages.map((msg, i) => (
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
                    {streaming && i === messages.length - 1 && (
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
          ))}

          {/* Typing indicator */}
          {loading && (
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
        </div>
      </div>
    </div>
  )
}
