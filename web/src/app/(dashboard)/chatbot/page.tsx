"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Send, Bot, User, Sparkles } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Message } from "@/lib/agents/types"

const SESSION_KEY = "gohub_chat_history"

interface AgentMeta { id: string; name: string }

const QUICK = [
  "Tìm gói eSIM đi Nhật 7 ngày",
  "Có gói unlimited đi Thái Lan không?",
  "WM có sản phẩm nào chưa có trong hệ thống?",
  "Giải thích cấu trúc mã SKU",
]

const AGENT_COLORS: Record<string, string> = {
  "tu-van":       "bg-brand-100 text-brand-700",
  "tra-cuu":      "bg-blue-100 text-blue-700",
  "giai-dap":     "bg-amber-100 text-amber-700",
  "gia-cogs":     "bg-green-100 text-green-700",
  "gap-analysis": "bg-purple-100 text-purple-700",
}

export default function ChatbotPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ""

  const [messages,  setMessages]  = useState<(Message & { agent?: AgentMeta })[]>([])
  const [input,     setInput]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [agentName, setAgentName] = useState<string | null>(null)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // Restore history from sessionStorage (same tab only)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  // Save to sessionStorage on change
  useEffect(() => {
    if (!initialized.current || messages.length === 0) return
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const busy = loading || streaming

  const clearChat = () => {
    setMessages([])
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }

  const send = async (content: string) => {
    if (!content.trim() || busy) return

    const userMsg: Message & { agent?: AgentMeta } = { role: "user", content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    setLoading(true)
    setAgentName(null)

    let streamStarted = false
    let currentAgent: AgentMeta | undefined

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), userName }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader  = res.body?.getReader()
      if (!reader) throw new Error("No stream")

      const decoder = new TextDecoder()
      let assistantText = ""
      setLoading(false)
      setStreaming(true)
      streamStarted = true

      setMessages(prev => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        // Parse agent metadata from first line
        if (chunk.startsWith("__AGENT__:")) {
          const line  = chunk.split("\n")[0]
          const parts = line.replace("__AGENT__:", "").split(":")
          currentAgent = { id: parts[0], name: parts.slice(1).join(":") }
          setAgentName(currentAgent.name)
          const rest = chunk.slice(line.length + 1)
          if (rest) {
            assistantText += rest
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: "assistant", content: assistantText, agent: currentAgent }
              return updated
            })
          }
          continue
        }

        assistantText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: assistantText, agent: currentAgent }
          return updated
        })
      }

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
      setAgentName(null)
    }
  }

  return (
    <div className="p-6 h-screen flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <Sparkles size={20} className="text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">AI Agent</h1>
          <span className="text-sm text-gray-400">Router → 5 Agents chuyên biệt</span>
        </div>
        <div className="flex items-center gap-2">
          {agentName && (
            <span className="text-xs text-gray-400 animate-pulse">
              {agentName} đang xử lý...
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg transition-colors"
            >
              Xóa
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
                <Sparkles size={28} className="text-brand-600" />
              </div>
              <p className="font-semibold text-gray-800 mb-1">GoHub AI Agent 👋</p>
              <p className="text-sm text-gray-400 mb-6 max-w-xs">
                Tư vấn sản phẩm · Tra cứu SKU · Giải đáp hệ thống · Phân tích giá · Gap Analysis
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {QUICK.map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left px-4 py-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 border-l-[3px] border-l-brand-500 rounded-xl hover:bg-brand-50 transition-all">
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
              <div className="flex flex-col gap-1 max-w-[72%]">
                {/* Agent badge */}
                {msg.role === "assistant" && msg.agent && (
                  <span className={`text-xs px-2 py-0.5 rounded-full self-start font-medium ${AGENT_COLORS[msg.agent.id] ?? "bg-gray-100 text-gray-600"}`}>
                    {msg.agent.name}
                  </span>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}>
                  {msg.role === "user" ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown components={{
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
                      }}>
                        {msg.content}
                      </ReactMarkdown>
                      {streaming && i === messages.length - 1 && (
                        <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={15} className="text-gray-500" />
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
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
              placeholder="Hỏi về sản phẩm, SKU, giá, gap analysis..."
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
