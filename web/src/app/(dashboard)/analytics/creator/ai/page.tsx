"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession }                                from "next-auth/react"
import { useRouter }                                 from "next/navigation"
import {
  Send, Cpu, User, Plus, Trash2, ExternalLink, Loader2,
  Database, Globe, BarChart2, Code2, Lightbulb,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm     from "remark-gfm"
import ChatChart      from "@/components/chat-chart"

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebSource { title: string; url: string }

interface Message {
  role:    "user" | "assistant"
  content: string
  sources?: WebSource[]
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

// ─── Quick prompt groups ──────────────────────────────────────────────────────

const QUICK_GROUPS = [
  {
    label: "Data & Analytics",
    icon:  Database,
    prompts: [
      "Doanh thu tháng này vs tháng trước: B2B, B2C, tổng, GP, CM1 — bảng + chart",
      "Top 10 khách B2B theo doanh thu 3 tháng gần nhất, kèm tier và GP%",
    ],
  },
  {
    label: "Web Search",
    icon:  Globe,
    prompts: [
      "Xu hướng AI agent framework mới nhất 2025 — so sánh LangGraph, CrewAI, AutoGen",
      "Best practices for Next.js 15 App Router performance optimization",
    ],
  },
  {
    label: "BI & Chart",
    icon:  BarChart2,
    prompts: [
      "Vẽ bar chart doanh thu 6 tháng gần nhất theo tháng (B2B + B2C)",
      "Top 5 kênh doanh thu tháng này — pie chart",
    ],
  },
  {
    label: "Code & System",
    icon:  Code2,
    prompts: [
      "Cấu trúc chatbot hiện tại: agents, routing, tools — ưu nhược điểm và hướng cải thiện",
      "Đề xuất cách optimize query gohub_dw để giảm latency",
    ],
  },
]

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-slate-100">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
        ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
        li:     ({ children }) => <li className="text-gray-700 dark:text-slate-300">{children}</li>,
        h1:     ({ children }) => <p className="font-bold text-base mb-1 text-gray-900 dark:text-slate-100">{children}</p>,
        h2:     ({ children }) => <p className="font-semibold text-sm mb-1 text-gray-800 dark:text-slate-200">{children}</p>,
        h3:     ({ children }) => <p className="font-semibold text-sm mb-1 text-gray-700 dark:text-slate-300">{children}</p>,
        hr:     () => <hr className="my-3 border-gray-200 dark:border-slate-600" />,
        code:   ({ children }) => <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
        pre:    ({ children }) => <pre className="bg-gray-900 dark:bg-slate-950 text-gray-100 rounded-xl p-4 overflow-x-auto text-xs font-mono mb-3">{children}</pre>,
        table:  ({ children }) => (
          <div className="overflow-x-auto mb-3 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        thead:  ({ children }) => <thead className="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">{children}</thead>,
        tbody:  ({ children }) => <tbody className="divide-y divide-gray-100 dark:divide-slate-700">{children}</tbody>,
        tr:     ({ children }) => <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">{children}</tr>,
        th:     ({ children }) => <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>,
        td:     ({ children }) => <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{children}</td>,
        a:      ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-700">
            {children}
          </a>
        ),
      }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

// ─── Web source citations ─────────────────────────────────────────────────────

function SourceCitations({ sources }: { sources: WebSource[] }) {
  if (!sources.length) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nguồn tham khảo</p>
      <div className="space-y-1">
        {sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 group">
            <ExternalLink size={11} className="flex-shrink-0 mt-0.5" />
            <span className="line-clamp-1 group-hover:underline">{s.title || s.url}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreatorAIPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [elapsed,  setElapsed]  = useState(0)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)

  // Creator-only guard
  useEffect(() => {
    if (status === "loading") return
    if (!session?.user || session.user.role !== "creator") {
      router.replace("/analytics")
    }
  }, [session, status, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Elapsed timer while loading
  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading])

  const clearConversation = useCallback(() => {
    setMessages([])
    setInput("")
    inputRef.current?.focus()
  }, [])

  const send = useCallback(async (content: string) => {
    const text = content.trim()
    if (!text || loading) return

    const userMsg: Message = { role: "user", content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/creator-ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const assistantMsg: Message = {
        role:    "assistant",
        content: data.text || "Không có nội dung trả về.",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }
      setMessages([...next, assistantMsg])
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Lỗi: ${e.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [messages, loading])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }, [send, input])

  if (status === "loading" || !session?.user || session.user.role !== "creator") {
    return null
  }

  const thinkingMsg = elapsed > 0 ? ` (${elapsed}s)` : ""

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm shadow-violet-600/20">
            <Cpu size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-slate-100">Gấu Pro</h1>
            <p className="text-[11px] text-gray-400">Private AI · Creator only · Full access</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-violet-500">
              <Loader2 size={13} className="animate-spin" />
              Đang xử lý{thinkingMsg}…
            </span>
          )}
          {messages.length > 0 && !loading && (
            <button
              onClick={clearConversation}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              Xóa
            </button>
          )}
          {messages.length > 0 && !loading && (
            <button
              onClick={clearConversation}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg transition-colors"
            >
              <Plus size={13} />
              Mới
            </button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="max-w-3xl mx-auto pt-6">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-600/25">
                <Cpu size={26} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Gấu Pro</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                AI riêng của Hiếu. Truy xuất toàn bộ database, tìm kiếm web, phân tích dữ liệu, tư vấn kỹ thuật &amp; kinh doanh.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {QUICK_GROUPS.map(group => {
                const Icon = group.icon
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon size={13} className="text-violet-500" />
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</p>
                    </div>
                    <div className="space-y-2">
                      {group.prompts.map(q => (
                        <button key={q} onClick={() => send(q)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-violet-300 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-all shadow-sm leading-snug">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <Lightbulb size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                <strong>Tips:</strong> Hỏi về số liệu sẽ luôn query database thật · Dùng Shift+Enter để xuống dòng · Yêu cầu vẽ chart hoặc xuất bảng trực tiếp
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-violet-600/20">
                  <Cpu size={14} className="text-white" />
                </div>
              )}
              <div className={`flex flex-col gap-1 ${msg.role === "user" ? "max-w-[80%]" : "max-w-[90%]"}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-violet-600 text-white rounded-tr-sm shadow-sm"
                    : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-100 rounded-tl-sm shadow-sm"
                }`}>
                  {msg.role === "user" ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (() => {
                    const chartResult = extractChartData(msg.content)
                    return (
                      <div>
                        {chartResult ? (
                          <>
                            {chartResult.before && renderMarkdown(chartResult.before)}
                            <ChatChart data={chartResult.chart} />
                            {chartResult.after && renderMarkdown(chartResult.after)}
                          </>
                        ) : renderMarkdown(msg.content)}
                        {msg.sources && msg.sources.length > 0 && (
                          <SourceCitations sources={msg.sources} />
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={14} className="text-gray-500 dark:text-slate-400" />
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-600/20">
                <Cpu size={14} className="text-white" />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(k => (
                      <span key={k} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${k * 0.15}s`, animationDuration: "0.8s" }} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    Đang phân tích{thinkingMsg}
                    {elapsed > 10 && " — đang query database / web…"}
                    {elapsed > 30 && " — phức tạp, chờ xíu…"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về dữ liệu, code, business, web search... (Enter gửi · Shift+Enter xuống dòng)"
              disabled={loading}
              rows={1}
              style={{ resize: "none" }}
              className="flex-1 px-4 py-3 text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 focus:bg-white dark:focus:bg-slate-800 disabled:opacity-60 transition min-h-[44px] max-h-[140px]"
              onInput={e => {
                const t = e.currentTarget
                t.style.height = "auto"
                t.style.height = Math.min(t.scrollHeight, 140) + "px"
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="px-4 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Gấu Pro · Toàn quyền truy cập · Số liệu từ database thật · Web search với trích nguồn
          </p>
        </div>
      </div>
    </div>
  )
}
