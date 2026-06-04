"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Trash2, Bot, User } from "lucide-react"

interface Message {
  role:    "user" | "assistant"
  content: string
}

const QUICK = [
  "Có bao nhiêu gói SIM cho Việt Nam?",
  "eSIM Nhật Bản 5GB rẻ nhất bao nhiêu?",
  "Gói nào hỗ trợ hotspot?",
  "Gói data không giới hạn có không?",
]

export default function ChatbotPage() {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const busy = loading || streaming

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
        body:    JSON.stringify({ messages: next }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as any).error || "API error")
      }

      setLoading(false)
      setStreaming(true)
      streamStarted = true
      setMessages(prev => [...prev, { role: "assistant", content: "" }])

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = {
            ...msgs[msgs.length - 1],
            content: msgs[msgs.length - 1].content + text,
          }
          return msgs
        })
      }
    } catch {
      const errMsg = "Hiếu đang fix, vui lòng đợi"
      if (streamStarted) {
        setMessages(prev => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = { role: "assistant", content: errMsg }
          return msgs
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
          <h1 className="text-xl font-bold text-gray-900">Chatbot Hỗ Trợ Sale</h1>
          <span className="text-sm text-gray-400">Trợ lý AI từ dữ liệu GoHub</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Xóa chat
          </button>
        )}
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
              <p className="font-semibold text-gray-800 mb-1">Xin chào! Tôi có thể giúp gì cho bạn?</p>
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
                <div className="whitespace-pre-wrap">
                  {msg.content}
                  {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                    <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
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

          {/* Typing indicator — only while waiting for first chunk */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Bot size={15} className="text-brand-600" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-3 flex-shrink-0">
          <form
            onSubmit={e => { e.preventDefault(); send(input) }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Hỏi về sản phẩm SIM/eSim..."
              disabled={busy}
              className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 transition"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
