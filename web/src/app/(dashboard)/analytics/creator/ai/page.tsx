"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession }                                from "next-auth/react"
import { useRouter }                                 from "next/navigation"
import {
  Send, Cpu, User, Plus, Trash2, ExternalLink, Loader2,
  Database, Globe, BarChart2, Code2, Lightbulb,
  Paperclip, X, FileText, Image as ImageIcon, FileSpreadsheet,
  Download, FileJson,
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
  fileName?: string  // attached file name shown in user bubble
}

// ─── LaTeX → Unicode converter ───────────────────────────────────────────────
// Gemini sometimes outputs LaTeX math ($\approx$, \times, etc.) which ReactMarkdown
// cannot render. Convert to plain Unicode symbols before display.

const LATEX_UNICODE: [RegExp, string][] = [
  // Wrappers — extract inner text
  [/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)"],
  [/\\(?:text|mathbf|mathit|mathrm|boldsymbol|operatorname)\{([^}]+)\}/g, "$1"],
  [/\\sqrt\{([^}]+)\}/g, "√($1)"],
  // Math operators
  [/\\approx/g, "≈"], [/\\sim(?!eq)/g, "~"], [/\\simeq/g, "≃"],
  [/\\times/g, "×"], [/\\div/g, "÷"], [/\\cdot/g, "·"],
  [/\\pm/g, "±"], [/\\mp/g, "∓"],
  [/\\leq?/g, "≤"], [/\\geq?/g, "≥"],
  [/\\neq?/g, "≠"], [/\\equiv/g, "≡"],
  [/\\not=/g, "≠"],
  // Arrows
  [/\\Rightarrow/g, "⇒"], [/\\Leftarrow/g, "⇐"],
  [/\\rightarrow/g, "→"], [/\\leftarrow/g, "←"], [/\\to(?=\s|$|[^a-z])/g, "→"],
  [/\\leftrightarrow/g, "↔"], [/\\Leftrightarrow/g, "⇔"],
  // Greek uppercase
  [/\\Gamma/g, "Γ"], [/\\Delta/g, "Δ"], [/\\Theta/g, "Θ"], [/\\Lambda/g, "Λ"],
  [/\\Pi(?=[^a-z])/g, "Π"], [/\\Sigma/g, "Σ"], [/\\Phi/g, "Φ"], [/\\Psi/g, "Ψ"], [/\\Omega/g, "Ω"],
  // Greek lowercase
  [/\\alpha/g, "α"], [/\\beta/g, "β"], [/\\gamma/g, "γ"], [/\\delta/g, "δ"],
  [/\\epsilon/g, "ε"], [/\\zeta/g, "ζ"], [/\\eta/g, "η"], [/\\theta/g, "θ"],
  [/\\lambda/g, "λ"], [/\\mu/g, "μ"], [/\\nu/g, "ν"], [/\\xi/g, "ξ"],
  [/\\pi(?=[^a-z])/g, "π"], [/\\rho/g, "ρ"], [/\\sigma/g, "σ"], [/\\tau/g, "τ"],
  [/\\phi/g, "φ"], [/\\chi/g, "χ"], [/\\psi/g, "ψ"], [/\\omega/g, "ω"],
  // Set / logic
  [/\\sum/g, "∑"], [/\\prod/g, "∏"], [/\\int/g, "∫"],
  [/\\infty/g, "∞"], [/\\partial/g, "∂"], [/\\nabla/g, "∇"],
  [/\\forall/g, "∀"], [/\\exists/g, "∃"],
  [/\\in(?=[^f])/g, "∈"], [/\\notin/g, "∉"],
  [/\\subset/g, "⊂"], [/\\supset/g, "⊃"],
  [/\\cup/g, "∪"], [/\\cap/g, "∩"],
  [/\\sqrt/g, "√"],
  // Misc
  [/\\ldots/g, "…"], [/\\cdots/g, "…"], [/\\vdots/g, "⋮"], [/\\ddots/g, "⋱"],
  [/\\%/g, "%"], [/\\\$/g, "$"], [/\\&/g, "&"],
  // Strip display math delimiters $$...$$ then inline $...$
  [/\$\$([\s\S]*?)\$\$/g, "$1"],
  [/\$([^$\n]{1,120})\$/g, "$1"],
  // Clean up leftover backslash-commands that weren't matched
  [/\\[a-zA-Z]+\*/g, ""], [/\\\\/g, "↵"],
]

function stripLatex(text: string): string {
  // Skip code blocks — only process non-code segments
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g)
  return parts.map((part, i) =>
    i % 2 === 1   // odd index = code block → leave as-is
      ? part
      : LATEX_UNICODE.reduce((t, [re, rep]) => t.replace(re, rep), part)
  ).join("")
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function extractExportBlocks(text: string): {
  csv:   { content: string; idx: number; end: number } | null
  json:  { content: string; idx: number; end: number } | null
} {
  const csvMatch  = text.match(/```csv\s*([\s\S]*?)\s*```/)
  const jsonMatch = text.match(/```json\s*(\[[\s\S]*?])\s*```/)  // only JSON arrays
  return {
    csv:  csvMatch  ? { content: csvMatch[1],  idx: text.indexOf("```csv"),  end: text.indexOf("```", text.indexOf("```csv")  + 6) + 3 } : null,
    json: jsonMatch ? { content: jsonMatch[1], idx: text.indexOf("```json"), end: text.indexOf("```", text.indexOf("```json") + 7) + 3 } : null,
  }
}

function extractMarkdownTable(text: string): string | null {
  // Detect markdown table with at least header + separator + 1 data row
  const m = text.match(/(\|.+\|\n\|[-:| ]+\|\n(?:\|.+\|\n?)+)/)
  if (!m) return null
  const lines = m[1].trim().split("\n").filter((l, i) => i !== 1) // remove separator row
  return lines.map(line =>
    line.replace(/^\||\|$/g, "").split("|").map(cell =>
      `"${cell.trim().replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n")
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCSVAsExcel(csv: string, filename: string) {
  // Use xlsx to create real Excel file
  import("xlsx").then((XLSX) => {
    const rows    = csv.split("\n").map(r => r.split(",").map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"')))
    const ws      = XLSX.utils.aoa_to_sheet(rows)
    const wb      = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    XLSX.writeFile(wb, filename)
  }).catch(() => {
    // fallback: download as CSV
    downloadText(csv, filename.replace(".xlsx", ".csv"), "text/csv")
  })
}

// ─── Export button bar ────────────────────────────────────────────────────────

function ExportBar({ content }: { content: string }) {
  const { csv, json } = extractExportBlocks(content)
  const tableCSV      = !csv ? extractMarkdownTable(content) : null
  const hasExport     = csv || json || tableCSV

  if (!hasExport) return null

  const csvContent    = csv?.content || tableCSV || ""
  const stamp         = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
      {(csv || tableCSV) && (
        <>
          <button
            onClick={() => downloadText(csvContent, `export-${stamp}.csv`, "text/csv")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Download size={12} />
            Download CSV
          </button>
          <button
            onClick={() => downloadCSVAsExcel(csvContent, `export-${stamp}.xlsx`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <FileSpreadsheet size={12} />
            Download Excel
          </button>
        </>
      )}
      {json && (
        <button
          onClick={() => downloadText(json.content, `export-${stamp}.json`, "application/json")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <FileJson size={12} />
          Download JSON
        </button>
      )}
    </div>
  )
}

// ─── File chip ────────────────────────────────────────────────────────────────

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.json,.txt,.md,.ts,.tsx,.js,.jsx,.py,.sql"
const MAX_MB = 20

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["png","jpg","jpeg","webp","gif","bmp"].includes(ext)) return <ImageIcon size={13} />
  if (["xlsx","xls","csv"].includes(ext))                     return <FileSpreadsheet size={13} />
  if (ext === "json")                                          return <FileJson size={13} />
  return <FileText size={13} />
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

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(raw: string) {
  const text = stripLatex(raw)
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
        pre:    ({ children }) => <pre className="bg-gray-900 dark:bg-slate-950 text-gray-100 rounded-xl p-4 overflow-x-auto text-xs font-mono mb-3 [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none">{children}</pre>,
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

// ─── Quick prompts ────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreatorAIPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [messages,      setMessages]      = useState<Message[]>([])
  const [input,         setInput]         = useState("")
  const [loading,       setLoading]       = useState(false)
  const [elapsed,       setElapsed]       = useState(0)
  const [attachedFile,  setAttachedFile]  = useState<File | null>(null)
  const [fileError,     setFileError]     = useState("")
  const [gpAllowed,     setGpAllowed]     = useState<boolean | null>(null) // null = loading

  const bottomRef    = useRef<HTMLDivElement>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const LS_KEY       = "gp_conv"

  // Access guard: creator → always allowed. Others → check gp_enabled from /api/user/me
  useEffect(() => {
    if (status === "loading") return
    if (!session?.user) { router.replace("/analytics"); return }
    if (session.user.role === "creator") { setGpAllowed(true); return }
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.gp_enabled) setGpAllowed(true)
      else router.replace("/analytics")
    }).catch(() => router.replace("/analytics"))
  }, [session, status, router])

  // Restore conversation from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Message[]
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist conversation to localStorage on every change
  useEffect(() => {
    try {
      if (messages.length > 0) localStorage.setItem(LS_KEY, JSON.stringify(messages))
      else localStorage.removeItem(LS_KEY)
    } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    setAttachedFile(null)
    setFileError("")
    try { localStorage.removeItem(LS_KEY) } catch {}
    inputRef.current?.focus()
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      setFileError(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Giới hạn ${MAX_MB} MB.`)
      return
    }
    setFileError("")
    setAttachedFile(file)
  }, [])

  const removeFile = useCallback(() => {
    setAttachedFile(null)
    setFileError("")
  }, [])

  const send = useCallback(async (content: string) => {
    const text = content.trim()
    if ((!text && !attachedFile) || loading) return

    const userMsg: Message = {
      role:     "user",
      content:  text || (attachedFile ? `[Gửi file: ${attachedFile.name}]` : ""),
      fileName: attachedFile?.name,
    }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    const fileToSend = attachedFile
    setAttachedFile(null)
    setLoading(true)

    try {
      let res: Response

      if (fileToSend) {
        // Send as FormData when there's a file
        const form = new FormData()
        form.append("messages", JSON.stringify(next.map(m => ({ role: m.role, content: m.content }))))
        form.append("file", fileToSend)
        res = await fetch("/api/creator-ai/chat", { method: "POST", body: form })
      } else {
        res = await fetch("/api/creator-ai/chat", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setMessages([...next, {
        role:    "assistant",
        content: data.text || "Không có nội dung trả về.",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }])
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Lỗi: ${e.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [messages, loading, attachedFile])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }, [send, input])

  if (status === "loading" || !session?.user || gpAllowed === null) return null
  if (!gpAllowed) return null

  const thinkingMsg = elapsed > 0 ? ` (${elapsed}s)` : ""

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-950">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileSelect}
      />

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
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg transition-colors"
            >
              <Plus size={13} />
              Cuộc trò chuyện mới
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
                AI riêng của Hiếu. Truy xuất toàn bộ database, tìm kiếm web, phân tích dữ liệu, đọc file, xuất CSV/Excel.
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
                <strong>Tips:</strong> Đính kèm file PDF/Excel/CSV/ảnh bằng nút paperclip ·
                Yêu cầu "xuất CSV" hoặc "download Excel" để tải dữ liệu ·
                Shift+Enter để xuống dòng
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
              <div className={`flex flex-col gap-1 ${msg.role === "user" ? "max-w-[80%]" : "max-w-[92%]"}`}>
                {/* File chip on user messages */}
                {msg.role === "user" && msg.fileName && (
                  <div className="flex justify-end">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-violet-300 bg-violet-700/60 rounded-lg">
                      {fileIcon(msg.fileName)}
                      {msg.fileName}
                    </span>
                  </div>
                )}
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
                        <ExportBar content={msg.content} />
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

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="max-w-3xl mx-auto">

          {/* Attached file chip */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
              <span className="text-violet-600 dark:text-violet-400">{fileIcon(attachedFile.name)}</span>
              <span className="text-xs text-violet-700 dark:text-violet-300 flex-1 truncate">{attachedFile.name}</span>
              <span className="text-[10px] text-violet-400">{(attachedFile.size / 1024).toFixed(0)} KB</span>
              <button onClick={removeFile} className="text-violet-400 hover:text-red-500 transition-colors">
                <X size={13} />
              </button>
            </div>
          )}

          {/* File error */}
          {fileError && (
            <p className="text-xs text-red-500 mb-2 px-1">{fileError}</p>
          )}

          <div className="flex gap-2 items-end">
            {/* Attach file button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Đính kèm file (PDF, Excel, CSV, ảnh, code...)"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-gray-200 dark:border-slate-700 rounded-xl transition-colors disabled:opacity-40"
            >
              <Paperclip size={16} />
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachedFile ? "Hỏi gì về file này? (Enter gửi · Shift+Enter xuống dòng)" : "Hỏi về dữ liệu, code, business, web search... (Enter gửi · Shift+Enter xuống dòng)"}
              disabled={loading}
              rows={1}
              style={{ resize: "none" }}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 focus:bg-white dark:focus:bg-slate-800 disabled:opacity-60 transition min-h-[40px] max-h-[140px]"
              onInput={e => {
                const t = e.currentTarget
                t.style.height = "auto"
                t.style.height = Math.min(t.scrollHeight, 140) + "px"
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={(!input.trim() && !attachedFile) || loading}
              className="flex-shrink-0 w-10 h-10 bg-violet-600 text-white rounded-xl hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Gấu Pro · Toàn quyền truy cập · Số liệu từ database thật · Web search · Upload file (PDF/Excel/CSV/ảnh/code)
          </p>
        </div>
      </div>
    </div>
  )
}
