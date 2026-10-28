"use client"

import { Children, createContext, isValidElement, useContext, useState, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy, Download, ExternalLink, FileCode2, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { isReportHtml, reportTitle } from "@/lib/argon/report"
import { CALLOUT_MAX_CHARS, tidyAnswer } from "@/lib/argon/answer-format"
import { ReportViewer, downloadReport } from "./report-viewer"

// Khung hiển thị câu trả lời của Argon: tiêu đề có vạch nhấn, bảng cuộn ngang có sọc, hộp "Kết luận"/"Lưu ý", checklist, chip trích nguồn, khối mã có nút chép.
// Chỉ đổi cách HIỂN THỊ (không đổi nội dung trả lời); lưu/xuất vẫn dùng markdown gốc.
const textOf = (n: ReactNode): string => Children.toArray(n).map(c => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : "")).join("")

// Report HTML do Argon viết: thẻ + khung toàn màn hình (report-viewer.tsx). Tự lưu vào Kho báo cáo khi lượt chạy xong (lib/argon/report-store.ts).
function ReportCard({ html }: { html: string }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(false)
  const title = reportTitle(html)
  return (
    <div className="my-3 rounded-xl border border-violet-300 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileCode2 size={18} className="text-violet-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{title}</div>
          <div className="text-[11px] text-gray-500">Report HTML do Argon tạo · {Math.max(1, Math.round(html.length / 1024))}KB · tự lưu vào Kho báo cáo · chạy trong khung cô lập, không truy cập mạng</div>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg"><ExternalLink size={14} />Mở report</button>
        <button onClick={() => downloadReport(title, html)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg text-violet-700 dark:text-violet-300"><Download size={12} />.html</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent("argon-prefill", { detail: `Sửa report "${title}": ` }))} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg text-violet-700 dark:text-violet-300"><Wand2 size={12} />Nhờ sửa</button>
        <button onClick={() => setCode(v => !v)} className="text-xs text-gray-500 hover:underline">{code ? "Ẩn mã" : "Xem mã"}</button>
      </div>
      {code && <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-50 dark:bg-slate-900 px-3 py-2 text-[12px] leading-relaxed"><code>{html}</code></pre>}
      {open && <ReportViewer title={title} html={html} onClose={() => setOpen(false)} />}
    </div>
  )
}

// Thành viên không xem được Argon làm gì: ẩn khối mã (trừ report HTML, là kết quả) và chip [#N] trỏ tới Bàn làm việc.
const HideCodeCtx = createContext(false)

function CodeBlock({ children }: { children?: ReactNode }) {
  const [done, setDone] = useState(false)
  const hide = useContext(HideCodeCtx)
  const code = Children.toArray(children).find(isValidElement) as { props: { className?: string; children?: ReactNode } } | undefined
  const text = textOf(code?.props.children ?? children).replace(/\n$/, "")
  const lang = /language-([\w-]+)/.exec(code?.props.className ?? "")?.[1]
  if (lang === "html" && isReportHtml(text)) return <ReportCard html={text} />
  if (hide) return null
  return (
    <div className="my-3 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-slate-700/60 text-[11px] text-gray-500 dark:text-slate-300">
        <span>{lang ?? "văn bản"}</span>
        <button onClick={() => { void navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white">{done ? <Check size={11} /> : <Copy size={11} />}{done ? "Đã chép" : "Chép"}</button>
      </div>
      <pre className="m-0 overflow-x-auto bg-gray-50 dark:bg-slate-900 px-3 py-2 text-[12.5px] leading-relaxed"><code>{text}</code></pre>
    </div>
  )
}

const CALLOUT: [RegExp, string][] = [
  [/^(kết luận|tóm lại|tóm tắt|trả lời ngắn)/i, "border-violet-400 bg-violet-50 dark:bg-violet-950/40"],
  [/^(lưu ý|cảnh báo|rủi ro|chú ý|cần kiểm)/i, "border-amber-400 bg-amber-50 dark:bg-amber-950/30"],
]

const components: Components = {
  h1: ({ children }) => <h1 className="mt-5 mb-2 pb-1 text-lg font-bold text-gray-900 dark:text-slate-50 border-b border-gray-200 dark:border-slate-700 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 pl-2.5 border-l-4 border-violet-500 text-[15px] font-semibold text-gray-900 dark:text-slate-50 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-gray-700 dark:text-slate-200">{children}</h4>,
  p: ({ children, node }) => {
    const first = node?.children?.[0] as { tagName?: string } | undefined
    const lead = first?.tagName === "strong" ? textOf(Children.toArray(children)[0]).trim() : ""
    const tone = lead ? CALLOUT.find(([re]) => re.test(lead))?.[1] : undefined
    if (tone && textOf(children).length <= CALLOUT_MAX_CHARS) return <p className={cn("my-3.5 rounded-r-lg border-l-4 px-3.5 py-2.5 text-[14.5px] leading-[1.7]", tone)}>{children}</p>
    return <p className="my-3 text-[14.5px] leading-[1.75]">{children}</p>
  },
  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-slate-50">{children}</strong>,
  em: ({ children }) => {
    const t = textOf(children).trim()
    if (/^\((nguồn|theo|xem)\b/i.test(t)) return <em className="not-italic ml-0.5 px-1.5 py-px rounded bg-gray-100 dark:bg-slate-700 text-[11.5px] text-gray-500 dark:text-slate-300 whitespace-normal">{children}</em>
    return <em className="italic">{children}</em>
  },
  a: ({ href, children }) => href?.startsWith(STEP_HREF) ? <StepChip n={Number(href.slice(STEP_HREF.length))} /> : <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-300 underline underline-offset-2 hover:text-violet-800 break-words">{children}</a>,
  ul: ({ children, className }) => <ul className={cn("my-3 space-y-1.5 [&_li>p]:my-0.5 text-[14.5px] leading-[1.7]", className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc pl-5 marker:text-violet-400")}>{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 [&_li>p]:my-0.5 pl-5 text-[14px] leading-relaxed marker:font-semibold marker:text-violet-500">{children}</ol>,
  li: ({ children, className }) => <li className={cn("pl-0.5", className?.includes("task-list-item") && "flex items-start gap-2")}>{children}</li>,
  input: ({ checked }) => <span aria-hidden className={cn("mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none", checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-400 dark:border-slate-500")}>{checked ? "✓" : ""}</span>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-4 border-gray-300 dark:border-slate-600 pl-3 text-gray-600 dark:text-slate-300 [&>p]:my-1">{children}</blockquote>,
  hr: () => <hr className="my-5 border-gray-200 dark:border-slate-700" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
      <table className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-gray-50 dark:[&_tbody_tr:nth-child(even)]:bg-slate-800/60">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-violet-50 dark:bg-violet-950/40">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200 whitespace-nowrap border-b border-violet-200 dark:border-violet-900">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top border-t border-gray-100 dark:border-slate-700 tabular-nums">{children}</td>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ children }) => <code className="rounded bg-gray-100 dark:bg-slate-700 px-1 py-px text-[0.86em] font-mono text-pink-700 dark:text-pink-300">{children}</code>,
}

// Nguồn gốc số liệu: Argon ghi [#N] sau con số lấy/tính từ công cụ (N = số bước ở Bàn làm việc). Đổi thành chip bấm được nếu trang cung cấp onStep.
const STEP_HREF = "#argon-step-"
const StepCtx = createContext<((n: number) => void) | null>(null)
function StepChip({ n }: { n: number }) {
  const on = useContext(StepCtx)
  if (useContext(HideCodeCtx)) return null
  if (!on) return <span className="text-[10px] align-super text-gray-400">[#{n}]</span>
  return <button type="button" onClick={() => on(n)} title={`Xem bước ${n} ở Bàn làm việc: câu SQL / số liệu / code đã cho ra con số này`} className="mx-0.5 align-baseline rounded bg-violet-100 dark:bg-violet-900/50 px-1 text-[10.5px] font-mono text-violet-700 dark:text-violet-200 hover:bg-violet-600 hover:text-white">#{n}</button>
}
/** `[#3]`, `[#2,#5]` → liên kết nội bộ #argon-step-N (mỗi bước một chip). */
export function linkSteps(text: string): string {
  return text.replace(/\[#(\d+(?:\s*,\s*#?\d+)*)\]/g, (_m, g: string) => g.split(",").map(x => `[#${x.trim().replace("#", "")}](${STEP_HREF}${x.trim().replace("#", "")})`).join(""))
}

export function ArgonMarkdown({ text, onStep, hideCode = false }: { text: string; onStep?: (n: number) => void; hideCode?: boolean }) {
  return <HideCodeCtx.Provider value={hideCode}><StepCtx.Provider value={onStep ?? null}><div className="argon-md text-gray-800 dark:text-slate-200 min-w-0 break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{linkSteps(tidyAnswer(text))}</ReactMarkdown></div></StepCtx.Provider></HideCodeCtx.Provider>
}
