"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Atom, Cpu, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { routeQuestion, type AssistantMode, type RouteDecision } from "@/lib/assistant/route-pure"
import { ENTITY_KINDS } from "@/lib/argon/graph-pure"
import type { SearchResult } from "@/lib/assistant/search"
import { STATUS_LABEL } from "@/lib/argon/mail-status-pure"
import { api } from "../argon-types"

// Hỏi / Tìm: MỘT ô cho cả Argon và Gấu Pro. Gõ → thấy NGAY nơi liên quan trong Kho (không tốn lượt model), rồi chọn hỏi Argon (đọc Kho, chỉ đọc)
// hoặc Gấu Pro (thao tác). Hệ thống gợi ý chế độ theo nội dung câu hỏi (luật từ khoá, giải thích được) — anh đổi tuỳ ý.
type Found = SearchResult & { route: RouteDecision }
const ARGON = "/analytics/creator/argon"
const MODE = {
  argon: { label: "Hỏi Argon", sub: "đọc Kho, chỉ đọc", icon: Atom, href: (q: string) => `${ARGON}/tro-ly?q=${encodeURIComponent(q)}` },
  gau_pro: { label: "Hỏi Gấu Pro", sub: "thao tác máy / Lark", icon: Cpu, href: (q: string) => `/analytics/creator/ai?q=${encodeURIComponent(q)}` },
} as const
const EXAMPLES = ["3HK báo giá Thái Lan lần gần nhất là bao nhiêu?", "Mail nào đang chờ tôi trả lời?", "Vendor nào sắp hết hạn khuyến mãi?", "Tạo task Lark nhắc tôi gọi lại HTHK sáng mai"]

export default function HoiTimPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [q, setQ] = useState("")
  const [found, setFound] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (status === "authenticated" && role && role !== "creator") router.push("/chatbot") }, [status, role, router])
  useEffect(() => { inputRef.current?.focus() }, [role])

  async function search(text = q) {
    const t = text.trim()
    if (t.length < 2) return
    setBusy(true); setErr(null)
    try { setFound(await api<Found>(`/api/creator/assistant/search?q=${encodeURIComponent(t)}`)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (role !== "creator") return null
  const live = q.trim().length >= 2 ? routeQuestion(q) : null
  const suggested: AssistantMode | null = (found?.route ?? live)?.mode ?? null
  const other = (m: AssistantMode): AssistantMode => (m === "argon" ? "gau_pro" : "argon")
  const empty = found && !found.chunks.length && !found.entities.length && !found.facts.length && !found.threads.length

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Hỏi / Tìm</h1>
      <form onSubmit={e => { e.preventDefault(); void search() }} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Hỏi hoặc tìm: vendor, giá, hạn, mail, hoặc nhờ làm một việc…" aria-label="Hỏi hoặc tìm"
            className="w-full pl-9 pr-3 py-2.5 text-[14px] rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <button type="submit" disabled={busy || q.trim().length < 2} className="px-4 py-2.5 text-sm rounded-xl bg-violet-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Tìm</button>
      </form>

      {suggested && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {[suggested, other(suggested)].map((m, i) => (
              <Link key={m} href={MODE[m].href(q.trim())} className={cn("inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] border", i === 0 ? "bg-violet-600 border-violet-600 text-white" : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200")}>
                {(() => { const Icon = MODE[m].icon; return <Icon size={15} /> })()}<span className="font-medium">{MODE[m].label}</span><span className={cn("text-[11.5px]", i === 0 ? "text-violet-100" : "text-gray-400")}>{MODE[m].sub}</span>
              </Link>
            ))}
          </div>
          <p className="text-[12px] text-gray-500">Gợi ý: {(found?.route ?? live)!.reason}.</p>
        </div>
      )}

      {err && <div className="p-2.5 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">{err}</div>}

      {!found && !busy && (
        <div className="space-y-1.5"><div className="text-[12px] text-gray-500">Thử:</div>
          <div className="flex flex-wrap gap-2">{EXAMPLES.map(x => <button key={x} type="button" onClick={() => { setQ(x); void search(x) }} className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-[12.5px] text-gray-600 dark:text-slate-300 hover:border-violet-400 text-left">{x}</button>)}</div></div>
      )}

      {empty && <div className="py-8 text-center text-sm text-gray-500">Không tìm thấy gì trong Kho cho &quot;{q.trim()}&quot;. Hỏi Argon vẫn có thể đọc rộng hơn, hoặc nhờ Gấu Pro tra web.</div>}

      {found && found.facts.length > 0 && (
        <Section title="Sự việc đang hiệu lực">
          {found.facts.map(f => <p key={f.id} className="text-[13px] leading-snug text-gray-700 dark:text-slate-300">{f.line}{f.needsReview && <span className="ml-1.5 text-[11px] text-amber-700">(chờ xác nhận)</span>}</p>)}
        </Section>
      )}
      {found && found.entities.length > 0 && (
        <Section title="Thực thể">
          <div className="flex flex-wrap gap-2">{found.entities.map(e => <Link key={e.id} href={`${ARGON}/kho-nguon`} className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-[12.5px] hover:border-violet-400">{e.name}<span className="text-gray-400"> · {ENTITY_KINDS[e.kind]} · {e.mentions} nguồn</span></Link>)}</div>
        </Section>
      )}
      {found && found.threads.length > 0 && (
        <Section title="Luồng mail">
          {found.threads.map(t => <p key={t.id} className="text-[13px] leading-snug text-gray-700 dark:text-slate-300"><span className="mr-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700">{STATUS_LABEL[t.status]}</span>{t.line}</p>)}
        </Section>
      )}
      {found && found.chunks.length > 0 && (
        <Section title="Trong tài liệu / thread / mail">
          {found.chunks.map((c, i) => (
            <div key={`${c.sourceId}-${i}`} className="rounded-lg border border-gray-200 dark:border-slate-700 p-2.5">
              <div className="text-[12.5px] font-medium text-gray-800 dark:text-slate-100 truncate">{c.sourceName}</div>
              <div className="text-[12px] leading-snug text-gray-600 dark:text-slate-400 mt-0.5">{c.text}</div>
            </div>))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-1.5"><h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h2>{children}</section>
}
