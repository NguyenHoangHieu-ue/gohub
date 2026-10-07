"use client"

// My Metrics › Kế hoạch quý (M3, plan my-metrics-plan-quy.md): mỗi việc = loại + phạm vi + mốc + mục tiêu + hạn;
// số thực tế server tự đo (lib/okr-plan.ts), không nhập tay.
import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, Check, RotateCcw, Ban, Trash2, Pencil, RefreshCw, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"
import { SourceBox } from "@/components/my-metrics/shared-ui"
import type { PlanItem, PlanKind, PlanKindDef, PlanEvaluation, PlanStatus } from "@/lib/okr-plan"

type Row = PlanItem & { eval: PlanEvaluation }
interface PlanData {
  quarter: string; start: string; end: string; today: string; locked: boolean
  items: Row[]; kinds: Record<PlanKind, PlanKindDef>
  options?: { countries: string[]; vendors: string[] }
}
type Draft = { id?: string; kind: PlanKind; title: string; country: string; vendor: string; baseline: string; target: string; due_date: string; note: string }

const STATUS: Record<PlanStatus, [string, string]> = {
  done:     ["Đạt",            "bg-emerald-100 text-emerald-700"],
  on_track: ["Đúng tiến độ",   "bg-sky-100 text-sky-700"],
  behind:   ["Chậm",           "bg-amber-100 text-amber-700"],
  overdue:  ["Quá hạn",        "bg-rose-100 text-rose-700"],
  no_data:  ["Chưa đo được",   "bg-slate-100 text-slate-500"],
  dropped:  ["Đã bỏ",          "bg-slate-100 text-slate-400"],
}
const emptyDraft = (): Draft => ({ kind: "vendor_share", title: "", country: "", vendor: "", baseline: "", target: "", due_date: "", note: "" })
const fmt = (n: number | null | undefined, unit: string) =>
  n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`

export function PlanSection({ quarter, canEdit }: { quarter: string; canEdit: boolean }) {
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [options, setOptions] = useState<PlanData["options"]>()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (withOptions = false) => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`/api/analytics/my-metrics/plan?quarter=${quarter}${withOptions ? "&options=1" : ""}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setData(d)
      if (d.options) setOptions(d.options)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [quarter])

  useEffect(() => { setOptions(undefined); setDraft(null); load() }, [load])

  const openForm = (d: Draft) => { setDraft(d); if (!options) load(true) }

  const save = async () => {
    if (!draft) return
    setSaving(true); setErr(null)
    const body = {
      id: draft.id, quarter, kind: draft.kind, title: draft.title,
      scope: { country: draft.country || undefined, vendor: draft.vendor || undefined },
      baseline: draft.baseline === "" ? null : Number(draft.baseline),
      target: draft.target === "" ? null : Number(draft.target),
      due_date: draft.due_date || null, note: draft.note,
    }
    const r = await fetch("/api/analytics/my-metrics/plan", { method: draft.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setErr(d.error || `HTTP ${r.status}`); return }
    setDraft(null); load()
  }

  const patch = async (id: string, fields: Partial<PlanItem>) => {
    const r = await fetch("/api/analytics/my-metrics/plan", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) })
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
    load()
  }
  const remove = async (id: string) => {
    const r = await fetch(`/api/analytics/my-metrics/plan?id=${id}`, { method: "DELETE" })
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
    load()
  }

  const items = data?.items ?? []
  const counts = useMemo(() => {
    const c: Partial<Record<PlanStatus, number>> = {}
    items.forEach(i => { c[i.eval.status] = (c[i.eval.status] ?? 0) + 1 })
    return c
  }, [items])
  const kinds = data?.kinds
  const editable = canEdit && !data?.locked

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <ListChecks className="w-4 h-4 text-slate-400" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-black text-slate-800">Kế hoạch quý {quarter}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Số thực tế tự đo tới {data?.today ?? "hôm qua"} · "lẽ ra phải đạt" = chia đều quãng đường từ đầu quý tới hạn
            {data?.locked && " · Quý đã đóng, chỉ xem"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS) as PlanStatus[]).filter(s => counts[s]).map(s => (
            <span key={s} className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", STATUS[s][1])}>{STATUS[s][0]} {counts[s]}</span>
          ))}
        </div>
        <button onClick={() => load()} aria-label="Làm mới" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
          <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
        </button>
        {editable && (
          <button onClick={() => openForm(emptyDraft())}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="w-3.5 h-3.5" /> Thêm việc
          </button>
        )}
      </div>

      {err && <p className="px-5 py-2 text-xs font-bold text-rose-600 bg-rose-50">{err}</p>}

      {draft && kinds && (
        <PlanForm draft={draft} setDraft={setDraft} kinds={kinds} options={options} saving={saving}
          onSave={save} onCancel={() => setDraft(null)} />
      )}

      <div className="divide-y divide-slate-100">
        {loading && !data && <p className="px-5 py-6 text-xs text-slate-400 text-center">Đang tải… lần đầu trong ngày có thể mất 20–40 giây (đọc doanh thu theo SKU).</p>}
        {data && items.length === 0 && (
          <p className="px-5 py-6 text-xs text-slate-400 text-center">Chưa có việc nào trong kế hoạch {quarter}.{editable && " Bấm \"Thêm việc\" để bắt đầu."}</p>
        )}
        {items.map(i => {
          const def = kinds?.[i.kind]
          const unit = def?.unit ?? ""
          const e = i.eval
          const scope = [i.scope?.country, i.scope?.vendor].filter(Boolean).join(" · ")
          const p = e.progress === null ? null : Math.max(0, Math.min(1, e.progress))
          return (
            <div key={i.id} className={cn("px-5 py-3.5", i.dropped && "opacity-50")}>
              <div className="flex flex-wrap items-start gap-2">
                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 mt-0.5", STATUS[e.status][1])}>{STATUS[e.status][0]}</span>
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-bold text-slate-800">{i.title}</p>
                  <p className="text-[11px] text-slate-400">{def?.group}{scope && ` · ${scope}`} · hạn {e.due}</p>
                </div>
                {editable && (
                  <div className="flex gap-1 shrink-0">
                    <IconBtn title={i.done ? "Mở lại" : "Đánh dấu xong"} onClick={() => patch(i.id, { done: !i.done })}>
                      {i.done ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </IconBtn>
                    <IconBtn title="Sửa" onClick={() => openForm({
                      id: i.id, kind: i.kind, title: i.title, country: i.scope?.country ?? "", vendor: i.scope?.vendor ?? "",
                      baseline: i.baseline === null ? "" : String(i.baseline), target: i.target === null ? "" : String(i.target),
                      due_date: i.due_date ?? "", note: i.note ?? "",
                    })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn title={i.dropped ? "Lấy lại" : "Bỏ việc (giữ lịch sử)"} onClick={() => patch(i.id, { dropped: !i.dropped })}><Ban className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn title="Xoá hẳn" onClick={() => remove(i.id)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                  </div>
                )}
              </div>
              {i.kind !== "manual" && (
                <div className="mt-2 grid grid-cols-3 gap-2 max-w-md text-[11px]">
                  <Stat label={i.baseline === null && i.kind !== "quotes_review" ? "Mốc (quý trước)" : "Mốc"} value={fmt(e.baseline, unit)} />
                  <Stat label="Hiện tại" value={fmt(e.value, unit)} strong />
                  <Stat label="Mục tiêu" value={fmt(e.target, unit)} />
                </div>
              )}
              {p !== null && i.kind !== "manual" && (
                <div className="mt-2 relative h-2 max-w-md bg-slate-100 rounded-full">
                  <div className={cn("h-full rounded-full", e.status === "done" ? "bg-emerald-500" : e.status === "on_track" ? "bg-sky-500" : "bg-amber-400")}
                    style={{ width: `${p * 100}%` }} />
                  <div className="absolute -top-0.5 w-0.5 h-3 bg-slate-700" style={{ left: `${e.expected * 100}%` }} title="Lẽ ra phải đạt hôm nay" />
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-600">{e.message}{def?.hint && i.kind !== "manual" && <span className="text-slate-400"> · {def.hint}</span>}</p>
              {i.note && <p className="mt-1 text-[11px] text-slate-500 italic">{i.note}</p>}
            </div>
          )
        })}
      </div>

      <div className="px-5 pb-4">
        <SourceBox type="auto" table="Supabase okr_plan_items · gohub_dw fact_fulfillment_revenue (B2B+B2C, bỏ phí ship — như tab Thị trường) · vendor_quotes"
          filter="Hiện tại = từ đầu quý tới hôm qua; mốc trống = cùng chỉ số của quý trước" />
      </div>
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} aria-label={title} onClick={onClick} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">{children}</button>
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2 py-1">
      <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
      <p className={cn("tabular-nums", strong ? "font-black text-slate-900" : "font-bold text-slate-600")}>{value}</p>
    </div>
  )
}

function PlanForm({ draft, setDraft, kinds, options, saving, onSave, onCancel }: {
  draft: Draft; setDraft: (d: Draft) => void; kinds: Record<PlanKind, PlanKindDef>
  options?: { countries: string[]; vendors: string[] }; saving: boolean; onSave: () => void; onCancel: () => void
}) {
  const def = kinds[draft.kind]
  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v })
  const groups = Array.from(new Set(Object.values(kinds).map(k => k.group)))
  const input = "w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
  const label = "text-[11px] font-bold text-slate-500 uppercase tracking-wider"
  return (
    <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label}>Loại việc</label>
          <select value={draft.kind} disabled={!!draft.id} onChange={e => setDraft({ ...draft, kind: e.target.value as PlanKind })} className={cn(input, "mt-1 bg-white")}>
            {groups.map(g => (
              <optgroup key={g} label={g}>
                {(Object.entries(kinds) as [PlanKind, PlanKindDef][]).filter(([, k]) => k.group === g).map(([id, k]) => <option key={id} value={id}>{k.label}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">Đo bằng: {def.hint}</p>
        </div>
        {def.needs.includes("country") && (
          <div>
            <label className={label}>Thị trường</label>
            <input list="plan-countries" value={draft.country} onChange={e => set("country", e.target.value)} className={cn(input, "mt-1")}
              placeholder={options ? "Gõ để tìm" : "Đang tải danh sách…"} />
            <datalist id="plan-countries">{options?.countries.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        {def.needs.includes("vendor") && (
          <div>
            <label className={label}>Vendor</label>
            <input list="plan-vendors" value={draft.vendor} onChange={e => set("vendor", e.target.value)} className={cn(input, "mt-1")}
              placeholder={options ? "Gõ để tìm" : "Đang tải danh sách…"} />
            <datalist id="plan-vendors">{options?.vendors.map(v => <option key={v} value={v} />)}</datalist>
          </div>
        )}
        <div className="md:col-span-2">
          <label className={label}>Tên việc (bỏ trống = tên loại việc)</label>
          <input value={draft.title} onChange={e => set("title", e.target.value)} className={cn(input, "mt-1")} placeholder={def.label} />
        </div>
        {draft.kind !== "manual" && (
          <>
            <div>
              <label className={label}>Mục tiêu {def.unit && `(${def.unit})`}</label>
              <input type="number" step="any" value={draft.target} onChange={e => set("target", e.target.value)} className={cn(input, "mt-1")} />
            </div>
            <div>
              <label className={label}>Mốc đầu {def.unit && `(${def.unit})`}</label>
              <input type="number" step="any" value={draft.baseline} onChange={e => set("baseline", e.target.value)} className={cn(input, "mt-1")}
                placeholder={draft.kind === "quotes_review" ? "Trống = số đang chờ lúc tạo" : "Trống = tự lấy số quý trước"} />
            </div>
          </>
        )}
        <div>
          <label className={label}>Hạn (trống = cuối quý)</label>
          <input type="date" value={draft.due_date} onChange={e => set("due_date", e.target.value)} className={cn(input, "mt-1")} />
        </div>
        <div>
          <label className={label}>Ghi chú</label>
          <input value={draft.note} onChange={e => set("note", e.target.value)} className={cn(input, "mt-1")} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Huỷ</button>
        <button onClick={onSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? "Đang lưu…" : draft.id ? "Lưu" : "Thêm"}
        </button>
      </div>
    </div>
  )
}
