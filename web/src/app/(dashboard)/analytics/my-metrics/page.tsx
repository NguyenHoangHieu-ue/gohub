"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react"
import {
  Target, Pencil, Save, XCircle, RefreshCw, Plus, Trash2,
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  Zap, BarChart3, Bot, TrendingUp, Info, Image as ImageIcon,
  Upload, MessageSquare, ChevronLeft, ChevronRight, ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutoMetrics {
  quarter: string; year: number; start: string; end: string
  hk3: { pct: number; hk3_rev: number; total_rev: number; monthly: MonthStat[] }
  gm:  { qtd_pct: number; total_gp: number; total_rev: number; monthly: GmStat[]; baseline: number }
  begau: { total: number; web: number; lark: number; monthly: Record<string, MonthCount> }
}
interface MonthStat    { month: string; hk3_rev: number; total_rev: number }
interface GmStat       { month: string; gp: number; rev: number; gm_pct: number }
interface MonthCount   { total: number; web: number; lark: number }
interface EvidenceRecord {
  id: string; quarter: string; metric: string; title: string | null
  request_time: string; request_note: string | null; request_image_url: string | null
  completion_time: string | null; completion_note: string | null; completion_image_url: string | null
  duration_value: number | null; created_by: string | null; created_at: string
}
interface EvidenceData { records: EvidenceRecord[]; avg: number | null; count: number; completed: number }
interface Conversation {
  id: number; user_message: string; ai_response: string
  channel: string; user: string; created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGETS = {
  Q3: { sla_hours: 5, sla_pct: 80, vendor_speed: 15, gm_delta: 2.5, hk3_pct: 74, begau: 450 },
  Q4: { sla_hours: 1, sla_pct: 90, vendor_speed: 5,  gm_delta: 5.0, hk3_pct: 80, begau: 650 },
}
const BASELINES = {
  sla:          "2–4 ngày/YC (TB 1–2 ngày thủ công)",
  vendor_speed: "15–30 phút/YC",
  gm_pct:       36.7,  // T8/2026
  hk3_pct:      67.5,  // T8/2026
  begau_weekly: "10–15 tasks/tuần",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fck  = (n: number) => formatCompactNumber(n)
const pct  = (n: number) => `${n.toFixed(1)}%`
const hhmm = (iso: string) => iso ? new Date(iso).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"

function currentQuarter(): { q: "Q3" | "Q4"; year: number } {
  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()
  return m <= 9 ? { q: "Q3", year: y } : { q: "Q4", year: y }
}

function pctColor(actual: number, target: number) {
  if (target <= 0) return "text-slate-400"
  const p = actual / target
  if (p >= 1)    return "text-emerald-600"
  if (p >= 0.75) return "text-[#003B95]"
  return "text-amber-600"
}

function ProgressBar({ actual, target }: { actual: number; target: number }) {
  const p = target > 0 ? Math.min((actual / target) * 100, 100) : 0
  const color = p >= 100 ? "bg-emerald-500" : p >= 75 ? "bg-[#003B95]" : "bg-amber-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${p}%` }} />
      </div>
      <span className={cn("text-xs font-black w-12 text-right", p >= 100 ? "text-emerald-600" : p >= 75 ? "text-[#003B95]" : "text-amber-600")}>
        {p.toFixed(1)}%
      </span>
    </div>
  )
}

function SourceBox({ type, table, filter }: { type: "auto"|"manual"; table: string; filter?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
        <Info className="w-3 h-3" />
        📊 Data source
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1 bg-slate-50 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-500 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
              type === "auto" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
            )}>{type}</span>
            <span className="font-bold text-slate-600">{table}</span>
          </div>
          {filter && <div className="text-slate-400 pl-1 break-all">{filter}</div>}
        </div>
      )}
    </div>
  )
}

// ─── Image Upload Helper ──────────────────────────────────────────────────────
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)
  const r = await fetch("/api/analytics/my-metrics/evidence/upload", { method: "POST", body: fd })
  if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? "Upload failed") }
  const j = await r.json()
  return j.url as string
}

// ─── Evidence Card ────────────────────────────────────────────────────────────
function EvidenceCard({
  metric, quarter, unit, targetValue, title: cardTitle, targetLabel, baselineLabel,
}: {
  metric: "sla" | "vendor_speed"; quarter: string; unit: "giờ" | "phút"
  targetValue: number; title: string; targetLabel: string; baselineLabel: string
}) {
  const [data,       setData]       = useState<EvidenceData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [editRec,    setEditRec]    = useState<EvidenceRecord | null>(null)
  const [uploading,  setUploading]  = useState<string | null>(null) // "req_img" | "comp_img"
  const [saving,     setSaving]     = useState(false)
  const reqImgRef  = useRef<HTMLInputElement>(null)
  const compImgRef = useRef<HTMLInputElement>(null)

  const emptyForm = { title:"", request_time:"", request_note:"", request_image_url:"",
    completion_time:"", completion_note:"", completion_image_url:"" }
  const [form, setForm] = useState(emptyForm)
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const q = `${quarter}`  // e.g. "Q3-2026"

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/evidence?quarter=${q}&metric=${metric}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [q, metric])

  useEffect(() => { fetchData() }, [fetchData])

  const openEdit = (rec: EvidenceRecord) => {
    setEditRec(rec)
    setForm({
      title: rec.title ?? "", request_time: rec.request_time?.slice(0,16) ?? "",
      request_note: rec.request_note ?? "", request_image_url: rec.request_image_url ?? "",
      completion_time: rec.completion_time?.slice(0,16) ?? "",
      completion_note: rec.completion_note ?? "", completion_image_url: rec.completion_image_url ?? "",
    })
    setShowForm(true)
  }

  const handleUpload = async (field: "request_image_url"|"completion_image_url", file: File) => {
    setUploading(field)
    try { const url = await uploadImage(file); setF(field, url) }
    catch (e: any) { alert("Upload lỗi: " + e.message) }
    finally { setUploading(null) }
  }

  const submit = async () => {
    if (!form.request_time) { alert("Cần nhập thời gian request"); return }
    setSaving(true)
    await fetch("/api/analytics/my-metrics/evidence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editRec?.id, quarter: q, metric }),
    })
    setSaving(false); setShowForm(false); setEditRec(null); setForm(emptyForm)
    fetchData()
  }

  const remove = async (id: string) => {
    if (!confirm("Xóa record này?")) return
    await fetch(`/api/analytics/my-metrics/evidence?id=${id}`, { method: "DELETE" })
    fetchData()
  }

  const avg     = data?.avg ?? null
  const actual  = avg ?? 0
  // Với SLA và vendor speed: thấp hơn = tốt hơn
  const progress = targetValue > 0 && avg !== null ? Math.max(0, 100 - ((actual - targetValue) / targetValue * 100)) : 0
  const progressCapped = Math.min(100, progress)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">{cardTitle}</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">Evidence</span>
          </div>
          <button onClick={() => { setEditRec(null); setForm(emptyForm); setShowForm(v => !v) }}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Thêm case
          </button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black", avg === null ? "text-slate-300" : avg <= targetValue ? "text-emerald-600" : avg <= targetValue*2 ? "text-[#003B95]" : "text-amber-600")}>
            {loading ? "…" : avg !== null ? avg.toFixed(1) : "—"}
          </span>
          <span className="text-slate-400 font-bold">{unit} TB</span>
          {data && data.completed > 0 && <span className="text-[11px] text-slate-400">({data.completed}/{data.count} cases)</span>}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Target: {targetLabel} · Baseline: {baselineLabel}</div>
      </div>

      <div className="px-5 py-3 space-y-2">
        <ProgressBar actual={progressCapped} target={100} />

        {/* Form thêm/sửa */}
        {showForm && (
          <div className="mt-3 border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
            <p className="text-xs font-black text-blue-700 uppercase tracking-wider">
              {editRec ? "Sửa case" : "Thêm case mới"}
            </p>
            <input value={form.title} onChange={e => setF("title", e.target.value)}
              placeholder="Mô tả yêu cầu (tuỳ chọn)"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">📩 Request</p>
                <input type="datetime-local" value={form.request_time} onChange={e => setF("request_time", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <textarea value={form.request_note} onChange={e => setF("request_note", e.target.value)}
                  placeholder="Ghi chú request…" rows={2}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none" />
                <div className="flex items-center gap-2">
                  {form.request_image_url && (
                    <a href={form.request_image_url} target="_blank" rel="noreferrer">
                      <img src={form.request_image_url} alt="req" className="h-12 w-16 object-cover rounded border" />
                    </a>
                  )}
                  <button onClick={() => reqImgRef.current?.click()}
                    disabled={!!uploading}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1">
                    {uploading === "request_image_url" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Ảnh
                  </button>
                  <input ref={reqImgRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleUpload("request_image_url", e.target.files[0])} />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">✅ Hoàn thành</p>
                <input type="datetime-local" value={form.completion_time} onChange={e => setF("completion_time", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <textarea value={form.completion_note} onChange={e => setF("completion_note", e.target.value)}
                  placeholder="Ghi chú hoàn thành…" rows={2}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none" />
                <div className="flex items-center gap-2">
                  {form.completion_image_url && (
                    <a href={form.completion_image_url} target="_blank" rel="noreferrer">
                      <img src={form.completion_image_url} alt="comp" className="h-12 w-16 object-cover rounded border" />
                    </a>
                  )}
                  <button onClick={() => compImgRef.current?.click()}
                    disabled={!!uploading}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1">
                    {uploading === "completion_image_url" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Ảnh
                  </button>
                  <input ref={compImgRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleUpload("completion_image_url", e.target.files[0])} />
                </div>
              </div>
            </div>
            {form.completion_time && form.request_time && (
              <div className="text-[11px] text-slate-500 font-bold">
                Duration sẽ tính: {((new Date(form.completion_time).getTime() - new Date(form.request_time).getTime()) / (unit === "giờ" ? 3600000 : 60000)).toFixed(2)} {unit}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditRec(null); setForm(emptyForm) }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
              <button onClick={submit} disabled={saving || !!uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Đang lưu…" : editRec ? "Cập nhật" : "Thêm"}
              </button>
            </div>
          </div>
        )}

        {/* Evidence list */}
        {(data?.records ?? []).length > 0 && (
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
            {data!.records.map(rec => (
              <div key={rec.id} className="border border-slate-100 rounded-xl p-3 text-[11px] bg-slate-50/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {rec.title && <p className="font-bold text-slate-700 mb-1">{rec.title}</p>}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <div>
                        <span className="text-slate-400">📩 Request: </span>
                        <span className="font-bold text-slate-600">{hhmm(rec.request_time)}</span>
                        {rec.request_note && <p className="text-slate-400 mt-0.5 italic">{rec.request_note}</p>}
                        {rec.request_image_url && (
                          <a href={rec.request_image_url} target="_blank" rel="noreferrer" className="mt-1 block">
                            <img src={rec.request_image_url} alt="req" className="h-10 w-16 object-cover rounded border hover:opacity-80" />
                          </a>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400">✅ Done: </span>
                        <span className="font-bold text-slate-600">{rec.completion_time ? hhmm(rec.completion_time) : "—"}</span>
                        {rec.completion_note && <p className="text-slate-400 mt-0.5 italic">{rec.completion_note}</p>}
                        {rec.completion_image_url && (
                          <a href={rec.completion_image_url} target="_blank" rel="noreferrer" className="mt-1 block">
                            <img src={rec.completion_image_url} alt="comp" className="h-10 w-16 object-cover rounded border hover:opacity-80" />
                          </a>
                        )}
                      </div>
                    </div>
                    {rec.duration_value != null && (
                      <p className="mt-1 font-black text-slate-700">⏱ {rec.duration_value.toFixed(2)} {unit}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(rec)} className="p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => remove(rec.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && data?.count === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-2">Chưa có evidence. Click "Thêm case" để bắt đầu.</p>
        )}
        <SourceBox type="manual" table="Supabase · okr_evidence_records"
          filter={`metric = '${metric}' · quarter = '${quarter}'`} />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function MyMetricsInner() {
  const def = currentQuarter()
  const [selQ,    setSelQ]    = useState<"Q3"|"Q4">(def.q)
  const [selYear, setSelYear] = useState(def.year)
  const [auto,    setAuto]    = useState<AutoMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  // Conversations
  const [convs,      setConvs]      = useState<Conversation[]>([])
  const [convTotal,  setConvTotal]  = useState(0)
  const [convPage,   setConvPage]   = useState(0)
  const [showConvs,  setShowConvs]  = useState(false)
  const [convLoad,   setConvLoad]   = useState(false)
  const [expandConv, setExpandConv] = useState<number | null>(null)
  const CONV_LIMIT = 15

  const targets  = TARGETS[selQ]
  const qLabel   = `${selQ}-${selYear}`

  const fetchAuto = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics?quarter=${selQ}&year=${selYear}`)
    if (r.ok) setAuto(await r.json())
    setLoading(false)
  }, [selQ, selYear])

  useEffect(() => { fetchAuto() }, [fetchAuto])

  const fetchConvs = useCallback(async (page = 0) => {
    setConvLoad(true)
    const r = await fetch(`/api/analytics/my-metrics/conversations?quarter=${qLabel}&page=${page}&limit=${CONV_LIMIT}`)
    if (r.ok) {
      const j = await r.json()
      setConvs(j.rows); setConvTotal(j.total); setConvPage(page)
    }
    setConvLoad(false)
  }, [qLabel])

  useEffect(() => { if (showConvs) fetchConvs(0) }, [showConvs, fetchConvs])

  const gmDelta = auto ? +(auto.gm.qtd_pct - auto.gm.baseline).toFixed(2) : 0

  // Progress helper for "lower is better" metrics (SLA, vendor speed)
  const hk3Pct   = auto?.hk3.pct ?? 0
  const convPages = Math.ceil(convTotal / CONV_LIMIT)

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">My OKR Metrics</h1>
            <p className="text-sm text-slate-500 font-medium italic">
              Tiến độ OKR 2026 · Baseline T8/2026 · Nguồn dữ liệu rõ ràng
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(["Q3","Q4"] as const).map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-4 py-1.5 text-xs font-black rounded-lg transition-all",
                  selQ === q ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {q} {selYear}
              </button>
            ))}
          </div>
          <button onClick={fetchAuto} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Baseline note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[11px] text-amber-700 font-medium">
        📌 <strong>Baseline T8/2026:</strong> SLA = {BASELINES.sla} · Vendor Speed = {BASELINES.vendor_speed} · SKU GM = {BASELINES.gm_pct}% · Datapool = {BASELINES.hk3_pct}% · Tasks = {BASELINES.begau_weekly}
      </div>

      {/* ── 1. Operational Excellence ── */}
      <div>
        <SectionHeader n={1} label="Operational Excellence" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EvidenceCard
            metric="sla" quarter={qLabel} unit="giờ"
            targetValue={targets.sla_hours}
            title="Product Request SLA Handling Time"
            targetLabel={`≤ ${targets.sla_hours}h (${targets.sla_pct}% requests)`}
            baselineLabel={BASELINES.sla}
          />
          <EvidenceCard
            metric="vendor_speed" quarter={qLabel} unit="phút"
            targetValue={targets.vendor_speed}
            title="Rate Comparison & Vendor Selection Speed"
            targetLabel={`≤ ${targets.vendor_speed} phút/query`}
            baselineLabel={BASELINES.vendor_speed}
          />
        </div>
      </div>

      {/* ── 2. Product Performance ── */}
      <div>
        <SectionHeader n={2} label="Product Performance" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* SKU GM — auto */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-black text-slate-800">SKU Gross Margin (GM%)</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Auto</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-3xl font-black", loading ? "text-slate-300" : gmDelta >= targets.gm_delta ? "text-emerald-600" : gmDelta >= 0 ? "text-[#003B95]" : "text-amber-600")}>
                  {loading ? "…" : `${gmDelta >= 0 ? "+" : ""}${gmDelta.toFixed(2)}%`}
                </span>
                <span className="text-slate-400 text-sm font-bold">vs baseline</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Target: +{targets.gm_delta}% · Baseline: {BASELINES.gm_pct}% · QTD actual: {auto ? pct(auto.gm.qtd_pct) : "…"}
              </div>
            </div>
            <div className="px-5 py-3 space-y-2">
              <ProgressBar actual={Math.max(0, gmDelta)} target={targets.gm_delta} />
              <div className="flex gap-3 text-[11px] text-slate-500">
                <span>GP: <strong className="text-slate-700">{fck(auto?.gm.total_gp ?? 0)}</strong></span>
                <span>Revenue: <strong className="text-slate-700">{fck(auto?.gm.total_rev ?? 0)}</strong></span>
              </div>
              {(auto?.gm.monthly ?? []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {auto!.gm.monthly.map(m => (
                    <div key={m.month} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400 w-14">{m.month.slice(5)}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-600 rounded-full" style={{ width: `${Math.min((m.gm_pct/50)*100, 100)}%` }} />
                      </div>
                      <span className="font-bold text-slate-600 w-14 text-right">{pct(m.gm_pct)}</span>
                      <span className={cn("font-bold w-14 text-right text-[10px]", m.gm_pct >= BASELINES.gm_pct+targets.gm_delta ? "text-emerald-600" : m.gm_pct >= BASELINES.gm_pct ? "text-[#003B95]" : "text-amber-500")}>
                        {m.gm_pct >= BASELINES.gm_pct ? `+${(m.gm_pct-BASELINES.gm_pct).toFixed(2)}%` : `${(m.gm_pct-BASELINES.gm_pct).toFixed(2)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue"
                filter="SUM(gross_profit_vnd) / SUM(fulfilled_revenue_amount_vnd) · cutoff: CURRENT_DATE - 1" />
            </div>
          </div>

          {/* 3HK % — auto */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-black text-slate-800">%3HK + Other Datapool Vendor</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Auto</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-3xl font-black", loading ? "text-slate-300" : hk3Pct >= targets.hk3_pct ? "text-emerald-600" : hk3Pct >= targets.hk3_pct*0.75 ? "text-[#003B95]" : "text-amber-600")}>
                  {loading ? "…" : pct(hk3Pct)}
                </span>
                <span className="text-slate-400 text-sm font-bold">of revenue</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Target: {targets.hk3_pct}% · Baseline: {BASELINES.hk3_pct}% · Delta: {hk3Pct > 0 ? `${(hk3Pct-BASELINES.hk3_pct).toFixed(2)}%` : "…"}
              </div>
            </div>
            <div className="px-5 py-3 space-y-2">
              <ProgressBar actual={hk3Pct} target={targets.hk3_pct} />
              <div className="flex gap-3 text-[11px] text-slate-500">
                <span>3HK: <strong className="text-slate-700">{fck(auto?.hk3.hk3_rev ?? 0)}</strong></span>
                <span>Total: <strong className="text-slate-700">{fck(auto?.hk3.total_rev ?? 0)}</strong></span>
              </div>
              {(auto?.hk3.monthly ?? []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {auto!.hk3.monthly.map(m => {
                    const mp = m.total_rev > 0 ? (m.hk3_rev/m.total_rev)*100 : 0
                    return (
                      <div key={m.month} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-400 w-14">{m.month.slice(5)}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#003B95] rounded-full" style={{ width: `${Math.min((mp/100)*100,100)}%` }} />
                        </div>
                        <span className="font-bold text-slate-600 w-14 text-right">{pct(mp)}</span>
                        <span className="font-bold text-slate-400 w-20 text-right text-[10px]">{fck(m.hk3_rev)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue"
                filter="REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. BI & AI Automation ── */}
      <div>
        <SectionHeader n={3} label="BI & AI Automation" note="(weight 30%)" />
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-black text-slate-800">Tasks Completed via Bé Gấu</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Auto</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-4xl font-black", loading ? "text-slate-300" :
                    (auto?.begau.total ?? 0) >= targets.begau ? "text-emerald-600" :
                    (auto?.begau.total ?? 0) >= targets.begau*0.75 ? "text-[#003B95]" : "text-slate-900")}>
                    {loading ? "…" : (auto?.begau.total ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xl text-slate-400 font-bold">/ {targets.begau.toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Target {selQ}: {targets.begau} tasks · Baseline: {BASELINES.begau_weekly}
                </div>
              </div>
              <div className="text-right space-y-1 shrink-0">
                <div className="text-[11px] text-slate-500">Web: <strong className="text-slate-700">{auto?.begau.web ?? 0}</strong></div>
                <div className="text-[11px] text-slate-500">Lark: <strong className="text-slate-700">{auto?.begau.lark ?? 0}</strong></div>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar actual={auto?.begau.total ?? 0} target={targets.begau} />
            </div>
            {Object.keys(auto?.begau.monthly ?? {}).length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {Object.entries(auto!.begau.monthly).sort(([a],[b]) => a.localeCompare(b)).map(([month, d]) => (
                  <div key={month} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{month.slice(5)}</p>
                    <p className="text-xl font-black text-slate-900">{d.total}</p>
                    <p className="text-[10px] text-slate-400">Web {d.web} · Lark {d.lark}</p>
                  </div>
                ))}
              </div>
            )}
            <SourceBox type="auto" table="Supabase · app_usage_events"
              filter="event_type='chat' AND ai_response IS NOT NULL · Lark: user_email LIKE 'lark:%'" />

            {/* Conversation list toggle */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button onClick={() => setShowConvs(v => !v)}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-700 transition-colors">
                <MessageSquare className="w-4 h-4" />
                {showConvs ? "Ẩn" : "Xem"} danh sách cuộc hội thoại được tính ({convTotal > 0 ? convTotal : "…"})
                {showConvs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showConvs && (
                <div className="mt-3 space-y-2">
                  {convLoad && <div className="text-xs text-slate-400 text-center py-4"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></div>}
                  {!convLoad && convs.map(c => (
                    <div key={c.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandConv(expandConv === c.id ? null : c.id)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                              c.channel === "Lark" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>
                              {c.channel}
                            </span>
                            <span className="text-[10px] text-slate-400">{c.user}</span>
                            <span className="text-[10px] text-slate-400 ml-auto">{hhmm(c.created_at)}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate">{c.user_message}</p>
                        </div>
                        {expandConv === c.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />}
                      </button>
                      {expandConv === c.id && (
                        <div className="px-4 pb-3 space-y-2 border-t border-slate-100">
                          <div className="bg-slate-50 rounded-lg p-2.5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">User</p>
                            <p className="text-xs text-slate-700">{c.user_message}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-2.5">
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">Bé Gấu</p>
                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.ai_response}{c.ai_response?.length >= 400 ? "…" : ""}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Pagination */}
                  {convPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button disabled={convPage === 0} onClick={() => fetchConvs(convPage-1)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-bold text-slate-600">{convPage+1} / {convPages}</span>
                      <button disabled={convPage >= convPages-1} onClick={() => fetchConvs(convPage+1)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ n, label, note }: { n: number; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">{n}</span>
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">{label}</h2>
      {note && <span className="text-slate-400 font-normal normal-case text-xs">{note}</span>}
    </div>
  )
}

export default function MyMetricsPage() {
  return <Suspense><MyMetricsInner /></Suspense>
}
