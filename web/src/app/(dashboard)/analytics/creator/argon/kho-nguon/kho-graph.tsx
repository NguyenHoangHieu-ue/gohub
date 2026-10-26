"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ExternalLink, Loader2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { ENTITY_KINDS, type EntityKind } from "@/lib/argon/graph-pure"
import { factLine, type FactRow } from "@/lib/argon/facts-pure"
import { api, jsonInit } from "../argon-types"

// Graph nhẹ của Kho: vendor / thị trường / sản phẩm / khách / người Argon tự trích khi tóm tắt nguồn. Bấm một thực thể để thấy nó nằm ở nguồn nào, liên quan gì.
interface Item { id: number; kind: EntityKind; name: string; aliases: string[]; mentions: number; lastDate: string | null }
interface Detail { entity: Item; mentions: { sourceId: string; sourceName: string; sourceDate: string | null; snippet: string }[]; related: { id: number; kind: EntityKind; name: string; rels: string[]; shared: number }[]; facts: FactRow[] }
interface Pub { enabled: boolean; folderUrl: string | null; indexUrl: string | null; docs: number; lastRunAt: string | null }
const dmy = (d: string | null) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")

export function KhoGraph({ onOpenSource, onError }: { onOpenSource: (id: string) => void; onError: (m: string) => void }) {
  const [list, setList] = useState<Item[] | null>(null)
  const [kind, setKind] = useState<EntityKind | "all">("all")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [pub, setPub] = useState<Pub | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  const [pubMsg, setPubMsg] = useState("")

  useEffect(() => { api<Pub>("/api/creator/argon/publish").then(setPub).catch(() => undefined) }, [])
  async function togglePub(enabled: boolean) {
    try { await api("/api/creator/argon/publish", jsonInit("PUT", { enabled })); setPub(p => (p ? { ...p, enabled } : p)) } catch (e) { onError((e as Error).message) }
  }
  async function publishNow() {
    setPubBusy(true); setPubMsg("")
    try {
      const r = await api<{ result: { profiles: number; created: number; updated: number; same: number; errors: string[] } }>("/api/creator/argon/publish", jsonInit("POST", {}))
      setPubMsg(`Đã xuất ${r.result.profiles} hồ sơ: ${r.result.created} mới, ${r.result.updated} cập nhật, ${r.result.same} không đổi${r.result.errors.length ? ` · lỗi: ${r.result.errors[0]}` : ""}`)
      setPub(await api<Pub>("/api/creator/argon/publish"))
    } catch (e) { onError((e as Error).message) } finally { setPubBusy(false) }
  }

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
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-2.5 space-y-1.5">
        <div className="text-[12px] font-medium text-gray-800 dark:text-slate-100">Hồ sơ vendor trên Lark <span className="font-normal text-gray-500">(một chiều: Argon → Lark, chỉ để đọc)</span></div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <button type="button" onClick={() => void publishNow()} disabled={pubBusy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600 text-white disabled:opacity-50">{pubBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}Xuất ra Lark ngay</button>
          {pub && <label className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-300"><input type="checkbox" checked={pub.enabled} onChange={e => void togglePub(e.target.checked)} />Tự cập nhật mỗi đêm</label>}
          {pub?.indexUrl && <a href={pub.indexUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 hover:underline"><ExternalLink size={11} />Mục lục</a>}
          {pub?.folderUrl && <a href={pub.folderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 hover:underline"><ExternalLink size={11} />Thư mục</a>}
        </div>
        {pubBusy && <div className="text-[11.5px] text-gray-500">Đang ghi tài liệu Lark, có thể mất 1–3 phút…</div>}
        {pubMsg && <div className="text-[11.5px] text-emerald-700 dark:text-emerald-300">{pubMsg}</div>}
        {pub && !pubMsg && pub.lastRunAt && <div className="text-[11.5px] text-gray-500">{pub.docs} hồ sơ · lần cuối {new Date(pub.lastRunAt).toLocaleString("vi-VN")}</div>}
      </div>
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
