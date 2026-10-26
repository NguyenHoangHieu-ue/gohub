"use client"

import { useState } from "react"
import { Check, ChevronDown, Pencil, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FACT_TYPES, bucketFacts, daysUntil, keyDate, type FactRow, type FactType } from "@/lib/argon/facts-pure"
import { api, jsonInit } from "../argon-types"

// Sổ sự việc có hạn: Argon tự trích từ tài liệu/thread/mail (khuyến mãi, ngừng bán, sản phẩm mới, đổi giá…); anh chỉ cần sửa/bỏ nếu sai.
const CHIP: Record<FactType, string> = {
  khuyen_mai: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  ngung_ban: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  san_pham_moi: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  doi_gia: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  doi_mang: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  chinh_sach: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  han_chot: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  khac: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200",
}
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")
const input = "w-full px-2 py-1 text-[12px] rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent"

export function KhoFacts({ facts, today, onChanged, onOpenSource, onError }: {
  facts: FactRow[]; today: string; onChanged: () => Promise<void>; onOpenSource: (id: string) => void; onError: (m: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ summary: "", from: "", to: "" })
  const [adding, setAdding] = useState(false)
  const [add, setAdd] = useState({ type: "khuyen_mai" as FactType, vendor: "", subject: "", summary: "", from: "", to: "" })
  const [pastOpen, setPastOpen] = useState(false)
  const pending = facts.filter(f => f.status === "active" && f.needs_review)
  const b = bucketFacts(facts.filter(f => !pending.includes(f)), today)

  async function patch(id: string, body: Record<string, unknown>) {
    try { await api("/api/creator/argon/facts", jsonInit("PATCH", { id, ...body })); setEditing(null); await onChanged() } catch (e) { onError((e as Error).message) }
  }
  async function create() {
    if (!add.summary.trim()) return
    try {
      await api("/api/creator/argon/facts", jsonInit("POST", { type: add.type, vendor: add.vendor, subject: add.subject, summary: add.summary, effective_from: add.from || undefined, expires_at: add.to || undefined }))
      setAdd({ type: "khuyen_mai", vendor: "", subject: "", summary: "", from: "", to: "" }); setAdding(false); await onChanged()
    } catch (e) { onError((e as Error).message) }
  }

  function Row({ f }: { f: FactRow }) {
    const kd = keyDate(f)
    const left = kd ? daysUntil(kd, today) : null
    const past = f.status !== "active"
    return (
      <div className={cn("rounded-xl border border-gray-200 dark:border-slate-700 p-2.5 space-y-1.5", past && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("px-1.5 py-0.5 rounded text-[10.5px] font-medium", CHIP[f.type] ?? CHIP.khac)}>{FACT_TYPES[f.type] ?? "Khác"}</span>
          <span className="text-[12.5px] font-medium text-gray-800 dark:text-slate-100 min-w-0 break-words">{[f.vendor, f.subject].filter(Boolean).join(" · ")}</span>
          {past && <span className="text-[10.5px] text-gray-500">({f.status === "rejected" ? "đã bỏ" : f.status === "superseded" ? "đã bị thay thế" : "hết hạn"})</span>}
        </div>
        {editing === f.id ? (
          <div className="space-y-1.5">
            <textarea value={draft.summary} onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))} rows={3} className={input} aria-label="Nội dung" />
            <div className="flex gap-1.5">
              <label className="flex-1 text-[10.5px] text-gray-500">Hiệu lực từ<input type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className={input} /></label>
              <label className="flex-1 text-[10.5px] text-gray-500">Hết hạn<input type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className={input} /></label>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void patch(f.id, { summary: draft.summary, effective_from: draft.from || null, expires_at: draft.to || null })} className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded-lg bg-violet-600 text-white"><Check size={12} />Lưu</button>
              <button type="button" onClick={() => setEditing(null)} className="px-2 py-1 text-[12px] rounded-lg border border-gray-300 dark:border-slate-600">Huỷ</button>
            </div>
          </div>
        ) : <>
          <p className="text-[12.5px] leading-snug text-gray-700 dark:text-slate-300">{f.summary}</p>
          {f.change_note && <p className="text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">Đổi so với tin cũ: {f.change_note}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
            {f.effective_from && <span>từ {dmy(f.effective_from)}</span>}
            {f.expires_at && <span>đến {dmy(f.expires_at)}</span>}
            {!past && left != null && <span className={cn("font-medium", left < 0 ? "text-gray-500" : left <= 3 ? "text-red-600" : left <= 14 ? "text-amber-600" : "text-gray-500")}>{left < 0 ? `đã qua ${-left} ngày` : left === 0 ? "hôm nay" : `còn ${left} ngày`}</span>}
            {f.source_id && f.source_name && <button type="button" onClick={() => onOpenSource(f.source_id!)} className="text-violet-700 dark:text-violet-300 hover:underline truncate max-w-[160px]" title={f.evidence || f.source_name}>nguồn: {f.source_name}</button>}
            {f.source_date && <span>tin ngày {dmy(f.source_date)}</span>}
            {f.origin === "manual" && <span>(anh ghi)</span>}
          </div>
          <div className="flex gap-3 text-[11.5px]">
            {f.needs_review && !past && <button type="button" onClick={() => void patch(f.id, { confirm: true })} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"><Check size={11} />Xác nhận</button>}
            <button type="button" onClick={() => { setEditing(f.id); setDraft({ summary: f.summary, from: f.effective_from ?? "", to: f.expires_at ?? "" }) }} className="inline-flex items-center gap-1 text-gray-500 hover:text-violet-700"><Pencil size={11} />Sửa</button>
            {past ? <button type="button" onClick={() => void patch(f.id, { status: "active" })} className="text-gray-500 hover:text-emerald-700">Khôi phục</button>
              : <button type="button" onClick={() => void patch(f.id, { status: "rejected" })} className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600"><X size={11} />{f.needs_review ? "Bỏ (giữ tin cũ)" : "Bỏ (ghi sai)"}</button>}
          </div>
        </>}
      </div>
    )
  }

  const Section = ({ title, rows, tone }: { title: string; rows: FactRow[]; tone?: string }) => rows.length ? (
    <div className="space-y-1.5"><div className={cn("text-[11px] font-semibold uppercase tracking-wide", tone ?? "text-gray-400")}>{title} ({rows.length})</div>{rows.map(f => <Row key={f.id} f={f} />)}</div>
  ) : null

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAdding(v => !v)} className="inline-flex items-center gap-1 text-[12px] text-violet-700 dark:text-violet-300"><Plus size={12} />Ghi một sự việc</button>
      {adding && (
        <div className="space-y-1.5 rounded-xl border border-violet-200 dark:border-violet-800 p-2.5">
          <select value={add.type} onChange={e => setAdd(a => ({ ...a, type: e.target.value as FactType }))} className={input} aria-label="Loại">{Object.entries(FACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <div className="flex gap-1.5"><input value={add.vendor} onChange={e => setAdd(a => ({ ...a, vendor: e.target.value }))} placeholder="Vendor" className={input} /><input value={add.subject} onChange={e => setAdd(a => ({ ...a, subject: e.target.value }))} placeholder="Sản phẩm / nước" className={input} /></div>
          <textarea value={add.summary} onChange={e => setAdd(a => ({ ...a, summary: e.target.value }))} rows={2} placeholder="Nội dung, đủ số liệu" className={input} />
          <div className="flex gap-1.5"><label className="flex-1 text-[10.5px] text-gray-500">Hiệu lực từ<input type="date" value={add.from} onChange={e => setAdd(a => ({ ...a, from: e.target.value }))} className={input} /></label><label className="flex-1 text-[10.5px] text-gray-500">Hết hạn<input type="date" value={add.to} onChange={e => setAdd(a => ({ ...a, to: e.target.value }))} className={input} /></label></div>
          <button type="button" onClick={() => void create()} disabled={!add.summary.trim()} className="px-2.5 py-1 text-[12px] rounded-lg bg-violet-600 text-white disabled:opacity-40">Ghi vào sổ</button>
        </div>
      )}
      {!facts.length && <div className="text-xs text-gray-400 py-6 text-center leading-relaxed">Sổ còn trống. Nạp tài liệu, thread hoặc mail: Argon tự ghi khuyến mãi, ngừng bán, đổi giá, hạn chót vào đây.</div>}
      <Section title="Thay đổi chờ anh xác nhận" rows={pending} tone="text-amber-600" />
      <Section title="Sắp tới hạn (14 ngày)" rows={b.soon} tone="text-amber-600" />
      <Section title="Đang hiệu lực" rows={b.active} />
      {b.past.length > 0 && (
        <div className="space-y-1.5">
          <button type="button" onClick={() => setPastOpen(v => !v)} aria-expanded={pastOpen} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Đã qua ({b.past.length})<ChevronDown size={12} className={cn("transition-transform", pastOpen && "rotate-180")} /></button>
          {pastOpen && b.past.slice(0, 60).map(f => <Row key={f.id} f={f} />)}
        </div>
      )}
    </div>
  )
}
