"use client"

// My Metrics › Kế hoạch quý (s227): hệ thống tự phân tích thị trường (giá vốn, vendor/nguồn hàng, thị trường chưa có) → đề xuất;
// Hiếu duyệt thì vào kế hoạch (tự theo dõi số nếu đo được), bỏ qua thì không hiện lại. Việc tự thêm = văn bản.
import { useState, useEffect, useCallback, useMemo } from "react"
import { Check, X, RotateCcw, Ban, Trash2, Pencil, RefreshCw, ListChecks, Lightbulb, Plus, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { SourceBox } from "@/components/my-metrics/shared-ui"
import type { PlanItem, PlanKind, PlanKindDef, PlanEvaluation, PlanStatus } from "@/lib/okr-plan"
import type { Proposal } from "@/lib/okr-proposals"

type Row = PlanItem & { eval: PlanEvaluation }
interface PlanData {
  quarter: string; start: string; end: string; today: string; locked: boolean; analysis_quarter?: string
  items: Row[]; kinds: Record<PlanKind, PlanKindDef>; proposals?: Proposal[]
}
type Draft = { id?: string; title: string; note: string; due_date: string; target: string; tracked: boolean }

const STATUS: Record<PlanStatus, [string, string]> = {
  done:     ["Đạt",            "bg-emerald-100 text-emerald-700"],
  on_track: ["Đúng tiến độ",   "bg-sky-100 text-sky-700"],
  behind:   ["Chậm",           "bg-amber-100 text-amber-700"],
  overdue:  ["Quá hạn",        "bg-rose-100 text-rose-700"],
  no_data:  ["Chưa đo được",   "bg-slate-100 text-slate-500"],
  dropped:  ["Đã bỏ",          "bg-slate-100 text-slate-400"],
}
const GROUP_CLS: Record<string, string> = {
  "Giá vốn": "bg-amber-50 text-amber-700",
  "Vendor & nguồn hàng": "bg-violet-50 text-violet-700",
  "Mở rộng thị trường": "bg-emerald-50 text-emerald-700",
}
const fmt = (n: number | null | undefined, unit: string) =>
  n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`
const API = "/api/analytics/my-metrics/plan"

export function PlanSection({ quarter, canEdit }: { quarter: string; canEdit: boolean }) {
  const [data, setData] = useState<PlanData | null>(null)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [analysisQ, setAnalysisQ] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [propLoading, setPropLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showDropped, setShowDropped] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`${API}?quarter=${quarter}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setData(d)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [quarter])

  const loadProposals = useCallback(async () => {
    setPropLoading(true)
    try {
      const r = await fetch(`${API}?quarter=${quarter}&proposals=1`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setData(d); setProposals(d.proposals ?? []); setAnalysisQ(d.analysis_quarter ?? null)
    } catch (e: any) { setErr(e.message) }
    setPropLoading(false)
  }, [quarter])

  useEffect(() => { setProposals(null); setDraft(null); load(); loadProposals() }, [load, loadProposals])

  const send = async (method: string, body: unknown, url = API) => {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return false }
    return true
  }

  const decide = async (p: Proposal, approve: boolean) => {
    setBusy(p.key); setErr(null)
    const ok = await send("POST", {
      quarter, title: p.title, note: `${p.reason}\nNên làm: ${p.action}`, dropped: !approve,
      kind: approve && p.track ? p.track.kind : "manual",
      scope: { ...(approve && p.track ? p.track.scope : {}), proposal: p.key },
      target: approve && p.track ? p.track.target : null,
    })
    if (ok) { setProposals(ps => (ps ?? []).filter(x => x.key !== p.key)); await load() }
    setBusy(null)
  }

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) { setErr("Nhập nội dung việc"); return }
    setBusy("draft"); setErr(null)
    const body: Record<string, unknown> = { title: draft.title, note: draft.note, due_date: draft.due_date || null }
    if (draft.tracked) body.target = draft.target === "" ? null : Number(draft.target)
    const ok = draft.id ? await send("PATCH", { id: draft.id, ...body }) : await send("POST", { quarter, kind: "manual", ...body })
    if (ok) { setDraft(null); await load() }
    setBusy(null)
  }
  const patch = async (id: string, fields: Partial<PlanItem>) => { if (await send("PATCH", { id, ...fields })) load() }
  const remove = async (id: string) => { if (await send("DELETE", null, `${API}?id=${id}`)) load() }

  const items = data?.items ?? []
  const active = items.filter(i => !i.dropped)
  const dropped = items.filter(i => i.dropped)
  const counts = useMemo(() => {
    const c: Partial<Record<PlanStatus, number>> = {}
    active.forEach(i => { c[i.eval.status] = (c[i.eval.status] ?? 0) + 1 })
    return c
  }, [active])
  const editable = canEdit && !data?.locked

  return (
    <div className="space-y-4">
      {err && <p className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50">{err}</p>}

      {/* ── Đề xuất của hệ thống ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-black text-slate-800">Đề xuất của hệ thống</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Phân tích doanh thu {analysisQ ? `quý ${analysisQ.replace("-", "/")}` : "quý gần nhất"} + so giá vendor + báo giá đang chào + nước chưa bán.
              Chỉ việc của Product (giá vốn, nguồn hàng, mở thị trường) — không gồm việc bán hàng.
            </p>
          </div>
          <button onClick={loadProposals} aria-label="Phân tích lại" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", propLoading && "animate-spin")} />
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {propLoading && !proposals && <p className="px-5 py-6 text-xs text-slate-400 text-center">Đang phân tích… lần đầu trong ngày có thể mất 30–60 giây.</p>}
          {proposals && proposals.length === 0 && <p className="px-5 py-6 text-xs text-slate-400 text-center">Không còn đề xuất mới — đã duyệt hoặc bỏ qua hết.</p>}
          {proposals?.map(p => (
            <div key={p.key} className="px-5 py-3.5 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", GROUP_CLS[p.group])}>{p.group}</span>
                  <p className="text-sm font-bold text-slate-800">{p.title}</p>
                </div>
                <p className="text-[11px] text-slate-600">{p.reason}</p>
                <p className="text-[11px] text-slate-500 mt-0.5"><b className="text-slate-600">Nên làm:</b> {p.action}</p>
                {p.track && <p className="text-[11px] text-sky-700 mt-0.5">Duyệt thì hệ thống tự theo dõi: {p.track.label}</p>}
              </div>
              {editable && (
                <div className="flex gap-1.5 shrink-0">
                  <button disabled={busy === p.key} onClick={() => decide(p, true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> Duyệt
                  </button>
                  <button disabled={busy === p.key} onClick={() => decide(p, false)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Bỏ qua
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Kế hoạch đã duyệt ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <ListChecks className="w-4 h-4 text-slate-400" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-black text-slate-800">Kế hoạch quý {quarter}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Việc đo được thì số tự cập nhật tới {data?.today ?? "hôm qua"}; việc khác tick khi xong.{data?.locked && " Quý đã đóng, chỉ xem."}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS) as PlanStatus[]).filter(s => counts[s]).map(s => (
              <span key={s} className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", STATUS[s][1])}>{STATUS[s][0]} {counts[s]}</span>
            ))}
          </div>
          <button onClick={load} aria-label="Làm mới" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
          {editable && (
            <button onClick={() => setDraft({ title: "", note: "", due_date: "", target: "", tracked: false })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200">
              <Plus className="w-3.5 h-3.5" /> Tự thêm việc
            </button>
          )}
        </div>

        {draft && (
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-2">
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Việc cần làm (vd: Đàm phán lại giá 3HK cho Nhật)"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} rows={3} placeholder="Ghi chú / cách làm (không bắt buộc)"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-[11px] font-bold text-slate-500">Hạn
                <input type="date" value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })}
                  className="ml-2 border border-slate-200 rounded-lg px-2 py-1 text-xs" />
              </label>
              {draft.tracked && (
                <label className="text-[11px] font-bold text-slate-500">Mục tiêu
                  <input type="number" step="any" value={draft.target} onChange={e => setDraft({ ...draft, target: e.target.value })}
                    className="ml-2 w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs" />
                </label>
              )}
              <div className="flex-1" />
              <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Huỷ</button>
              <button onClick={saveDraft} disabled={busy === "draft"} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                {busy === "draft" ? "Đang lưu…" : draft.id ? "Lưu" : "Thêm"}
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {loading && !data && <p className="px-5 py-6 text-xs text-slate-400 text-center">Đang tải…</p>}
          {data && active.length === 0 && <p className="px-5 py-6 text-xs text-slate-400 text-center">Chưa có việc nào — duyệt đề xuất ở trên hoặc tự thêm.</p>}
          {active.map(i => <PlanRow key={i.id} i={i} kinds={data!.kinds} editable={editable}
            onDone={() => patch(i.id, { done: !i.done })} onDrop={() => patch(i.id, { dropped: true })} onDelete={() => remove(i.id)}
            onEdit={() => setDraft({ id: i.id, title: i.title, note: i.note ?? "", due_date: i.due_date ?? "", target: i.target === null ? "" : String(i.target), tracked: i.kind !== "manual" })} />)}
        </div>

        {dropped.length > 0 && (
          <div className="border-t border-slate-100">
            <button onClick={() => setShowDropped(v => !v)} className="w-full px-5 py-2.5 flex items-center gap-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50">
              {showDropped ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Đã bỏ qua / đã bỏ ({dropped.length})
            </button>
            {showDropped && dropped.map(i => (
              <div key={i.id} className="px-5 py-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="flex-1">{i.title}</span>
                {editable && <>
                  <button title="Lấy lại" aria-label="Lấy lại" onClick={() => patch(i.id, { dropped: false })} className="p-1 rounded bg-slate-100 hover:bg-slate-200"><RotateCcw className="w-3 h-3" /></button>
                  <button title="Xoá hẳn (đề xuất sẽ hiện lại)" aria-label="Xoá hẳn" onClick={() => remove(i.id)} className="p-1 rounded bg-slate-100 hover:bg-slate-200"><Trash2 className="w-3 h-3" /></button>
                </>}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 pb-4 pt-2">
          <SourceBox type="auto" table="Supabase okr_plan_items · gohub_dw fact_fulfillment_revenue (B2B+B2C, bỏ phí ship) · so giá vendor + vendor_quotes (tab Thị trường & Báo giá)"
            filter="Đề xuất = phân tích quý đủ dữ liệu gần nhất; số theo dõi = từ đầu quý tới hôm qua, mốc = cùng chỉ số quý trước" />
        </div>
      </div>
    </div>
  )
}

function PlanRow({ i, kinds, editable, onDone, onDrop, onDelete, onEdit }: {
  i: Row; kinds: Record<PlanKind, PlanKindDef>; editable: boolean
  onDone: () => void; onDrop: () => void; onDelete: () => void; onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const unit = kinds[i.kind]?.unit ?? ""
  const e = i.eval
  const p = e.progress === null ? null : Math.max(0, Math.min(1, e.progress))
  const tracked = i.kind !== "manual"
  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-start gap-2">
        <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 mt-0.5", STATUS[e.status][1])}>{STATUS[e.status][0]}</span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-bold text-slate-800">{i.title}</p>
          <p className="text-[11px] text-slate-400">
            {i.scope?.proposal ? "Từ đề xuất hệ thống" : "Tự thêm"} · hạn {e.due}
            {i.note && <button onClick={() => setOpen(v => !v)} className="ml-2 text-brand-600 font-bold">{open ? "ẩn ghi chú" : "xem ghi chú"}</button>}
          </p>
        </div>
        {editable && (
          <div className="flex gap-1 shrink-0">
            <IconBtn title={i.done ? "Mở lại" : "Đánh dấu xong"} onClick={onDone}>{i.done ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}</IconBtn>
            <IconBtn title="Sửa" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></IconBtn>
            <IconBtn title="Bỏ việc (giữ lịch sử)" onClick={onDrop}><Ban className="w-3.5 h-3.5" /></IconBtn>
            <IconBtn title="Xoá hẳn" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
          </div>
        )}
      </div>
      {open && i.note && <p className="mt-1.5 text-[11px] text-slate-600 whitespace-pre-line bg-slate-50 rounded-lg px-3 py-2">{i.note}</p>}
      {tracked && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 max-w-md text-[11px]">
            <Stat label={i.baseline === null && i.kind !== "quotes_review" ? "Mốc (quý trước)" : "Mốc"} value={fmt(e.baseline, unit)} />
            <Stat label="Hiện tại" value={fmt(e.value, unit)} strong />
            <Stat label="Mục tiêu" value={fmt(e.target, unit)} />
          </div>
          {p !== null && (
            <div className="mt-2 relative h-2 max-w-md bg-slate-100 rounded-full">
              <div className={cn("h-full rounded-full", e.status === "done" ? "bg-emerald-500" : e.status === "on_track" ? "bg-sky-500" : "bg-amber-400")} style={{ width: `${p * 100}%` }} />
              <div className="absolute -top-0.5 w-0.5 h-3 bg-slate-700" style={{ left: `${e.expected * 100}%` }} title="Lẽ ra phải đạt hôm nay" />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-600">{e.message}</p>
        </>
      )}
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
