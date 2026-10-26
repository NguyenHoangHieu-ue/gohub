"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ENTITY_KINDS, type EntityKind } from "@/lib/argon/graph-pure"
import { factLine, type FactRow } from "@/lib/argon/facts-pure"
import { api } from "../argon-types"

// Graph nhẹ của Kho: vendor / thị trường / sản phẩm / khách / người Argon tự trích khi tóm tắt nguồn. Bấm một thực thể để thấy nó nằm ở nguồn nào, liên quan gì.
interface Item { id: number; kind: EntityKind; name: string; aliases: string[]; mentions: number; lastDate: string | null }
interface Detail { entity: Item; mentions: { sourceId: string; sourceName: string; sourceDate: string | null; snippet: string }[]; related: { id: number; kind: EntityKind; name: string; rels: string[]; shared: number }[]; facts: FactRow[] }
const dmy = (d: string | null) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")

export function KhoGraph({ onOpenSource, onError }: { onOpenSource: (id: string) => void; onError: (m: string) => void }) {
  const [list, setList] = useState<Item[] | null>(null)
  const [kind, setKind] = useState<EntityKind | "all">("all")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api<{ entities: Item[] }>("/api/creator/argon/graph").then(r => setList(r.entities)).catch(e => { setList([]); onError((e as Error).message) }) }, [onError])

  async function open(id: number) {
    setLoading(true)
    try { setDetail(await api<Detail>(`/api/creator/argon/graph?id=${id}`)) } catch (e) { onError((e as Error).message) } finally { setLoading(false) }
  }

  if (!list) return <div className="py-6 text-center text-xs text-gray-400"><Loader2 size={14} className="inline animate-spin" /> Đang tải…</div>

  if (detail) return (
    <div className="space-y-3">
      <button type="button" onClick={() => setDetail(null)} className="inline-flex items-center gap-1 text-[12px] text-violet-700 dark:text-violet-300"><ArrowLeft size={12} />Danh sách</button>
      <div>
        <div className="text-[11px] text-gray-500">{ENTITY_KINDS[detail.entity.kind]}</div>
        <div className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">{detail.entity.name}</div>
        {detail.entity.aliases.length > 0 && <div className="text-[11.5px] text-gray-500">còn gọi: {detail.entity.aliases.join(", ")}</div>}
      </div>
      {detail.facts.length > 0 && (
        <div className="space-y-1"><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sự việc đang hiệu lực</div>
          {detail.facts.map(f => <p key={f.id} className="text-[12px] leading-snug text-gray-700 dark:text-slate-300">{factLine(f)}</p>)}</div>
      )}
      {detail.related.length > 0 && (
        <div className="space-y-1"><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Liên quan</div>
          <div className="flex flex-wrap gap-1.5">{detail.related.map(r => (
            <button key={r.id} type="button" onClick={() => void open(r.id)} className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-[12px] hover:border-violet-400" title={r.rels.join(", ")}>
              {r.name}<span className="text-gray-400"> · {ENTITY_KINDS[r.kind]}{r.rels.length ? ` · ${r.rels[0]}` : r.shared ? ` · chung ${r.shared}` : ""}</span>
            </button>))}</div></div>
      )}
      <div className="space-y-1.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Nằm ở đâu ({detail.mentions.length} nguồn)</div>
        {detail.mentions.map(m => (
          <button key={m.sourceId} type="button" onClick={() => onOpenSource(m.sourceId)} className="block w-full text-left rounded-lg border border-gray-200 dark:border-slate-700 p-2 hover:border-violet-400">
            <div className="text-[12.5px] font-medium text-gray-800 dark:text-slate-100 truncate">{m.sourceName}</div>
            <div className="text-[11px] text-gray-500">{m.sourceDate ? `tin ngày ${dmy(m.sourceDate)}` : ""}{m.snippet ? ` · ${m.snippet}` : ""}</div>
          </button>))}</div>
    </div>
  )

  const shown = list.filter(e => kind === "all" || e.kind === kind)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        {(["all", ...Object.keys(ENTITY_KINDS)] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k as EntityKind | "all")} className={cn("px-2 py-1 rounded-lg border", kind === k ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 font-medium" : "border-gray-200 dark:border-slate-700")}>
            {k === "all" ? `Tất cả (${list.length})` : `${ENTITY_KINDS[k as EntityKind]} (${list.filter(e => e.kind === k).length})`}
          </button>))}
      </div>
      {loading && <div className="text-xs text-gray-400"><Loader2 size={12} className="inline animate-spin" /> Đang tải…</div>}
      {!list.length && <div className="text-xs text-gray-400 py-6 text-center leading-relaxed">Chưa có thực thể nào. Argon tự trích khi tóm tắt tài liệu, thread, mail (nguồn cũ được bù dần mỗi đêm).</div>}
      {shown.map(e => (
        <button key={e.id} type="button" onClick={() => void open(e.id)} className="flex w-full items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-left hover:border-violet-400">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-gray-800 dark:text-slate-100">{e.name}</span>
          <span className="shrink-0 text-[11px] text-gray-500">{ENTITY_KINDS[e.kind]} · {e.mentions} nguồn</span>
        </button>))}
    </div>
  )
}
