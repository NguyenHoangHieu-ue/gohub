"use client"

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react"
import {
  Target, Pencil, Save, XCircle, RefreshCw, Plus, Trash2,
  Clock, ChevronDown, ChevronUp, Lock, ShieldCheck, Tag, Gauge,
  Zap, BarChart3, Bot, Info,
  Upload, MessageSquare, ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutoMetrics {
  quarter: string; year: number; start: string; end: string
  data_cutoff: string; generated_at: string
  hk3: { pct: number; hk3_rev: number; total_rev: number; monthly: MonthStat[]; baseline: number }
  gm:  { qtd_pct: number; total_gp: number; total_rev: number; monthly: GmStat[]; baseline: number }
  begau: {
    total: number; web: number; lark: number; excluded_short: number
    by_role: Record<string, number>; monthly: Record<string, MonthCount>
  }
}
interface MonthStat    { month: string; hk3_rev: number; total_rev: number }
interface GmStat       { month: string; gp: number; rev: number; gm_pct: number }
interface MonthCount   { total: number; web: number; lark: number }
interface EvidenceRecord {
  id: string; quarter: string; metric: string; title: string | null
  request_time: string; request_note: string | null; request_image_url: string | null
  completion_time: string | null; completion_note: string | null; completion_image_url: string | null
  duration_value: number | null; created_by: string | null; created_at: string
  updated_by?: string | null; updated_at?: string | null
}
interface EvidenceData { records: EvidenceRecord[]; avg: number | null; count: number; completed: number; verified: number; locked: boolean }
interface Conversation {
  id: number; user_message: string; ai_response: string
  channel: string; user: string; created_at: string
}
interface ManualMetrics {
  target_sla_hours: number; target_sla_pct: number; target_vendor_speed: number
  target_gm_delta: number; target_hk3_pct: number; target_begau: number
  updated_by?: string; updated_at?: string
}
interface SkuPeriod { rev: number; gp: number; gm_pct: number; orders: number }
interface SkuTagItem {
  id: string; sku_code: string; note: string | null; effective_date: string
  evidence_image_url: string | null; created_by: string; created_at: string
  before: SkuPeriod | null; after: SkuPeriod | null
  delta: number | null; delta_basis: string | null
  status: "verified" | "new_sku" | "pending" | "error"
  sku_info: { sku_code: string; status: string; latest_cogs: number | null; latest_cogs_currency: string | null } | null
}
interface SkuTagsData {
  items: SkuTagItem[]; weighted_delta: number | null; total_after_rev: number
  counted: number; pending: number; locked: boolean
}

// Fallback khi chưa lưu target vào DB
const DEFAULT_TARGETS = {
  Q3: { sla_hours: 5, sla_pct: 80, vendor_speed: 15, gm_delta: 2.5, hk3_pct: 74, begau: 450 },
  Q4: { sla_hours: 1, sla_pct: 90, vendor_speed: 5,  gm_delta: 5.0, hk3_pct: 80, begau: 650 },
}
const BASELINE_NOTE = {
  sla:          "2–4 ngày/YC (TB 1–2 ngày thủ công)",
  vendor_speed: "15–30 phút/YC",
  begau_weekly: "10–15 tasks/tuần",
}
// Trọng số quy đổi từ offer letter: "BI & AI Automation (30%)" + phần còn lại (Operational
// Excellence + Product Performance) = 70% theo time-allocation. Offer letter KHÔNG chia trọng số
// riêng cho 4 chỉ số trong nhóm 70% → chia ĐỀU 17.5% mỗi chỉ số (giả định minh bạch, có thể chỉnh
// nếu sếp muốn trọng số khác — sửa ở đây, KHÔNG có công thức ẩn nào khác trong code).
const WEIGHTS = { sla: 17.5, vendor_speed: 17.5, sku_gm: 17.5, hk3: 17.5, begau: 30 }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fck  = (n: number) => formatCompactNumber(n)
const pct  = (n: number) => `${n.toFixed(1)}%`
const hhmm = (iso: string) => iso ? new Date(iso).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"

function currentQuarter(): { q: "Q3" | "Q4"; year: number } {
  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()
  return m <= 9 ? { q: "Q3", year: y } : { q: "Q4", year: y }
}

// Achievement 0-100, "cao hơn = tốt" (revenue%, task count, GM delta)
function achHigherBetter(actual: number, target: number) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (actual / target) * 100))
}
// Achievement 0-100, "thấp hơn = tốt" (SLA giờ, vendor speed phút)
function achLowerBetter(actual: number | null, target: number) {
  if (actual == null || target <= 0) return 0
  return Math.max(0, Math.min(100, 100 - ((actual - target) / target * 100)))
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

function SourceBox({ type, table, filter }: { type: "auto"|"manual"|"context"; table: string; filter?: string }) {
  const [open, setOpen] = useState(false)
  const badge = type === "auto" ? "bg-blue-100 text-blue-700" : type === "manual" ? "bg-purple-100 text-purple-700" : "bg-slate-200 text-slate-600"
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
            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black uppercase", badge)}>{type}</span>
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

// ─── Evidence Card (SLA / Vendor Speed) ───────────────────────────────────────
function EvidenceCard({
  metric, quarter, unit, targetValue, title: cardTitle, targetLabel, baselineLabel, onSummary,
}: {
  metric: "sla" | "vendor_speed"; quarter: string; unit: "giờ" | "phút"
  targetValue: number; title: string; targetLabel: string; baselineLabel: string
  onSummary?: (avg: number | null) => void
}) {
  const [data,       setData]       = useState<EvidenceData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [editRec,    setEditRec]    = useState<EvidenceRecord | null>(null)
  const [uploading,  setUploading]  = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState<string | null>(null)
  const reqImgRef  = useRef<HTMLInputElement>(null)
  const compImgRef = useRef<HTMLInputElement>(null)

  const emptyForm = { title:"", request_time:"", request_note:"", request_image_url:"",
    completion_time:"", completion_note:"", completion_image_url:"" }
  const [form, setForm] = useState(emptyForm)
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const q = `${quarter}`

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/evidence?quarter=${q}&metric=${metric}`)
    if (r.ok) { const d = await r.json(); setData(d); onSummary?.(d.avg) }
    setLoading(false)
  }, [q, metric]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const locked = data?.locked ?? false

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
    setSaving(true); setErr(null)
    const r = await fetch("/api/analytics/my-metrics/evidence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editRec?.id, quarter: q, metric }),
    })
    if (!r.ok) { const j = await r.json(); setErr(j.error ?? "Lỗi lưu"); setSaving(false); return }
    setSaving(false); setShowForm(false); setEditRec(null); setForm(emptyForm)
    fetchData()
  }

  const remove = async (id: string) => {
    if (!confirm("Xóa record này?")) return
    const r = await fetch(`/api/analytics/my-metrics/evidence?id=${id}`, { method: "DELETE" })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi xoá"); return }
    fetchData()
  }

  const avg     = data?.avg ?? null
  const actual  = avg ?? 0
  const progress = targetValue > 0 && avg !== null ? Math.max(0, 100 - ((actual - targetValue) / targetValue * 100)) : 0
  const progressCapped = Math.min(100, progress)
  const unverifiedCount = (data?.count ?? 0) - (data?.verified ?? 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">{cardTitle}</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">Manual · verified</span>
            {locked && <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase"><Lock className="w-2.5 h-2.5" />Khoá</span>}
          </div>
          {!locked && (
            <button onClick={() => { setEditRec(null); setForm(emptyForm); setShowForm(v => !v) }}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Thêm case
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black", avg === null ? "text-slate-300" : avg <= targetValue ? "text-emerald-600" : avg <= targetValue*2 ? "text-[#003B95]" : "text-amber-600")}>
            {loading ? "…" : avg !== null ? avg.toFixed(1) : "—"}
          </span>
          <span className="text-slate-400 font-bold">{unit} TB</span>
          {data && <span className="text-[11px] text-slate-400">({data.verified} verified{unverifiedCount > 0 ? ` · ${unverifiedCount} thiếu ảnh (không tính)` : ""} / {data.count} case)</span>}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Target: {targetLabel} · Baseline: {baselineLabel}</div>
      </div>

      <div className="px-5 py-3 space-y-2">
        <ProgressBar actual={progressCapped} target={100} />

        {locked && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Quý này đã đóng — evidence khoá, không thêm/sửa/xoá được nữa (đảm bảo số báo cáo không đổi sau khi chốt).
          </div>
        )}

        {showForm && !locked && (
          <div className="mt-3 border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
            <p className="text-xs font-black text-blue-700 uppercase tracking-wider">
              {editRec ? "Sửa case" : "Thêm case mới"}
            </p>
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
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
                    Ảnh <span className="text-red-500">*</span>
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
                    Ảnh <span className="text-red-500">*</span>
                  </button>
                  <input ref={compImgRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleUpload("completion_image_url", e.target.files[0])} />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">* Cần đủ CẢ 2 ảnh mới được tính vào số TB báo cáo (case thiếu ảnh vẫn lưu nhưng bị loại khỏi KPI).</p>
            {form.completion_time && form.request_time && (
              <div className="text-[11px] text-slate-500 font-bold">
                Duration sẽ tính: {((new Date(form.completion_time).getTime() - new Date(form.request_time).getTime()) / (unit === "giờ" ? 3600000 : 60000)).toFixed(2)} {unit}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditRec(null); setForm(emptyForm); setErr(null) }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
              <button onClick={submit} disabled={saving || !!uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Đang lưu…" : editRec ? "Cập nhật" : "Thêm"}
              </button>
            </div>
          </div>
        )}

        {(data?.records ?? []).length > 0 && (
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
            {data!.records.map(rec => {
              const isVerified = !!(rec.request_image_url && rec.completion_image_url && rec.duration_value != null)
              return (
              <div key={rec.id} className={cn("border rounded-xl p-3 text-[11px]", isVerified ? "border-slate-100 bg-slate-50/60" : "border-amber-200 bg-amber-50/40")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      {rec.title && <p className="font-bold text-slate-700">{rec.title}</p>}
                      {isVerified
                        ? <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase"><ShieldCheck className="w-2.5 h-2.5" />Verified</span>
                        : <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Thiếu ảnh — không tính KPI</span>}
                    </div>
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
                    <p className="mt-1 text-slate-300 text-[10px]">
                      Tạo lúc {hhmm(rec.created_at)} bởi {rec.created_by ?? "—"}
                      {rec.updated_at && <> · sửa lúc {hhmm(rec.updated_at)} bởi {rec.updated_by ?? "—"}</>}
                    </p>
                  </div>
                  {!locked && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(rec)} className="p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => remove(rec.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )})}
          </div>
        )}
        {!loading && data?.count === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-2">Chưa có evidence. Click "Thêm case" để bắt đầu.</p>
        )}
        <SourceBox type="manual" table="Supabase · okr_evidence_records"
          filter={`metric = '${metric}' · quarter = '${quarter}' · TB chỉ tính case có ĐỦ request_image_url + completion_image_url`} />
      </div>
    </div>
  )
}

// ─── SKU Tag Section (SKU GM verified — số liệu thật từ đơn hàng) ─────────────
function SkuTagSection({ quarter, targetDelta, onSummary }: { quarter: string; targetDelta: number; onSummary?: (delta: number | null) => void }) {
  const [data, setData] = useState<SkuTagsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const emptyForm = { sku_code: "", effective_date: "", note: "", evidence_image_url: "" }
  const [form, setForm] = useState(emptyForm)
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?quarter=${quarter}`)
    if (r.ok) { const d = await r.json(); setData(d); onSummary?.(d.weighted_delta) }
    setLoading(false)
  }, [quarter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const submit = async () => {
    if (!form.sku_code || !form.effective_date) { alert("Cần mã SKU + ngày áp dụng"); return }
    setSaving(true); setErr(null)
    const r = await fetch("/api/analytics/my-metrics/sku-tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, quarter }),
    })
    if (!r.ok) { const j = await r.json(); setErr(j.error ?? "Lỗi lưu"); setSaving(false); return }
    setSaving(false); setShowForm(false); setForm(emptyForm)
    fetchData()
  }

  const remove = async (id: string) => {
    if (!confirm("Bỏ tag SKU này?")) return
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?id=${id}`, { method: "DELETE" })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi xoá"); return }
    fetchData()
  }

  const locked = data?.locked ?? false
  const wd = data?.weighted_delta ?? null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">SKU Gross Margin — verified</span>
            <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase"><ShieldCheck className="w-2.5 h-2.5" />Auto · từ đơn hàng thật</span>
            {locked && <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase"><Lock className="w-2.5 h-2.5" />Khoá</span>}
          </div>
          {!locked && (
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
              <Tag className="w-3.5 h-3.5" /> Gắn SKU
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black", loading ? "text-slate-300" : wd === null ? "text-slate-300" : wd >= targetDelta ? "text-emerald-600" : wd >= 0 ? "text-[#003B95]" : "text-amber-600")}>
            {loading ? "…" : wd !== null ? `${wd >= 0 ? "+" : ""}${wd.toFixed(2)}%` : "—"}
          </span>
          <span className="text-slate-400 text-sm font-bold">weighted (theo doanh thu sau khi áp dụng)</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Target: +{targetDelta}% · {data ? `${data.counted} SKU tính KPI · ${data.pending} SKU chờ dữ liệu` : "…"}
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          Cách tính: gắn mã SKU + ngày áp dụng giá/rate mới → hệ thống tự SO SÁNH margin thật của đúng SKU đó
          TRƯỚC vs SAU ngày áp dụng (đơn hàng thật trong gohub_dw) — không nhập tay số margin, không tự khai được.
        </p>
      </div>

      <div className="px-5 py-3 space-y-2">
        {targetDelta > 0 && <ProgressBar actual={Math.max(0, wd ?? 0)} target={targetDelta} />}

        {locked && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Quý này đã đóng — không gắn/xoá SKU được nữa.
          </div>
        )}

        {showForm && !locked && (
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Mã SKU</label>
                <input value={form.sku_code} onChange={e => setF("sku_code", e.target.value.toUpperCase())}
                  placeholder="VD: JP3HK7D2GB"
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày áp dụng</label>
                <input type="date" value={form.effective_date} onChange={e => setF("effective_date", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <textarea value={form.note} onChange={e => setF("note", e.target.value)}
              placeholder="Ghi chú (VD: renegotiate rate Worldmove, SKU mới thay NCC rẻ hơn...)" rows={2}
              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none" />
            <div className="flex items-center gap-2">
              {form.evidence_image_url && (
                <a href={form.evidence_image_url} target="_blank" rel="noreferrer">
                  <img src={form.evidence_image_url} alt="evidence" className="h-12 w-16 object-cover rounded border" />
                </a>
              )}
              <button onClick={() => imgRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1">
                {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Ảnh rate sheet (tuỳ chọn)
              </button>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={async e => { const f = e.target.files?.[0]; if (!f) return
                  setUploading(true)
                  try { setF("evidence_image_url", await uploadImage(f)) } catch (er: any) { alert("Upload lỗi: " + er.message) }
                  finally { setUploading(false) } }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setForm(emptyForm); setErr(null) }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
              <button onClick={submit} disabled={saving || uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Đang lưu…" : "Gắn SKU"}
              </button>
            </div>
          </div>
        )}

        {(data?.items ?? []).length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {data!.items.map(it => {
              const statusMap = {
                verified: { label: "Verified", cls: "bg-emerald-100 text-emerald-700" },
                new_sku:  { label: "SKU mới", cls: "bg-blue-100 text-blue-700" },
                pending:  { label: "Chờ dữ liệu", cls: "bg-amber-100 text-amber-700" },
                error:    { label: "Lỗi query", cls: "bg-red-100 text-red-700" },
              } as const
              const sm = statusMap[it.status]
              return (
                <div key={it.id} className="border border-slate-100 rounded-xl p-3 text-[11px] bg-slate-50/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-black text-slate-800">{it.sku_code}</span>
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase", sm.cls)}>{sm.label}</span>
                        {it.delta !== null && (
                          <span className={cn("text-[10px] font-black", it.delta >= 0 ? "text-emerald-600" : "text-amber-600")}>
                            {it.delta >= 0 ? "+" : ""}{it.delta.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      {it.note && <p className="text-slate-500 italic mb-1">{it.note}</p>}
                      <p className="text-slate-400">Áp dụng từ {it.effective_date} · {it.delta_basis}</p>
                      {it.before && it.after && (
                        <div className="grid grid-cols-2 gap-x-3 mt-1">
                          <div className="text-slate-500">Trước: GM {pct(it.before.gm_pct)} · {fck(it.before.rev)} · {it.before.orders} đơn</div>
                          <div className="text-slate-500">Sau: GM {pct(it.after.gm_pct)} · {fck(it.after.rev)} · {it.after.orders} đơn</div>
                        </div>
                      )}
                      {it.sku_info && (
                        <p className="text-slate-300 mt-1">Hệ thống ghi COGS hiện tại: {it.sku_info.latest_cogs ?? "—"} {it.sku_info.latest_cogs_currency ?? ""} · status: {it.sku_info.status}</p>
                      )}
                      {it.evidence_image_url && (
                        <a href={it.evidence_image_url} target="_blank" rel="noreferrer" className="mt-1 block">
                          <img src={it.evidence_image_url} alt="evidence" className="h-10 w-16 object-cover rounded border hover:opacity-80" />
                        </a>
                      )}
                      <p className="mt-1 text-slate-300 text-[10px]">Gắn bởi {it.created_by} lúc {hhmm(it.created_at)}</p>
                    </div>
                    {!locked && (
                      <button onClick={() => remove(it.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!loading && (data?.items.length ?? 0) === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-2">Chưa gắn SKU nào. Click "Gắn SKU" để bắt đầu track margin thật.</p>
        )}
        <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue (per-SKU, before/after effective_date)"
          filter="GM% = SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd) · SKU mới (không có giai đoạn trước) so với baseline công ty" />
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

  const [convs,      setConvs]      = useState<Conversation[]>([])
  const [convTotal,  setConvTotal]  = useState(0)
  const [convPage,   setConvPage]   = useState(0)
  const [showConvs,  setShowConvs]  = useState(false)
  const [convLoad,   setConvLoad]   = useState(false)
  const [expandConv, setExpandConv] = useState<number | null>(null)
  const CONV_LIMIT = 15

  const [manual,    setManual]    = useState<ManualMetrics | null>(null)
  const [editTarget, setEditTarget] = useState(false)
  const [draftT,     setDraftT]    = useState<Partial<ManualMetrics>>({})
  const [savingT,    setSavingT]   = useState(false)

  // Summary values lifted từ card con để tính Weighted Score tổng
  const [slaAvg,    setSlaAvg]    = useState<number | null>(null)
  const [vendorAvg, setVendorAvg] = useState<number | null>(null)
  const [skuDelta,  setSkuDelta]  = useState<number | null>(null)

  const qLabel  = `${selQ}-${selYear}`
  const defT    = DEFAULT_TARGETS[selQ]

  const targets = {
    sla_hours:    manual?.target_sla_hours    || defT.sla_hours,
    sla_pct:      manual?.target_sla_pct      || defT.sla_pct,
    vendor_speed: manual?.target_vendor_speed || defT.vendor_speed,
    gm_delta:     manual?.target_gm_delta     || defT.gm_delta,
    hk3_pct:      manual?.target_hk3_pct      || defT.hk3_pct,
    begau:        manual?.target_begau         || defT.begau,
  }

  const fetchAuto = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics?quarter=${selQ}&year=${selYear}`)
    if (r.ok) setAuto(await r.json())
    setLoading(false)
  }, [selQ, selYear])

  const fetchManual = useCallback(async () => {
    const r = await fetch(`/api/analytics/my-metrics/manual?quarter=${selQ}&year=${selYear}`)
    if (r.ok) { const d = await r.json(); setManual(d) }
    else setManual(null)
  }, [selQ, selYear])

  useEffect(() => { fetchAuto(); fetchManual() }, [fetchAuto, fetchManual])

  const openEditTarget = () => {
    setDraftT({
      target_sla_hours:    targets.sla_hours,
      target_sla_pct:      targets.sla_pct,
      target_vendor_speed: targets.vendor_speed,
      target_gm_delta:     targets.gm_delta,
      target_hk3_pct:      targets.hk3_pct,
      target_begau:        targets.begau,
    })
    setEditTarget(true)
  }

  const saveTargets = async () => {
    setSavingT(true)
    const r = await fetch("/api/analytics/my-metrics/manual", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter: selQ, year: String(selYear), ...draftT }),
    })
    if (r.ok) { await fetchManual(); setEditTarget(false) }
    setSavingT(false)
  }

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
  const hk3Pct   = auto?.hk3.pct ?? 0
  const convPages = Math.ceil(convTotal / CONV_LIMIT)

  // ── Weighted OKR Score (composite) ──
  const achSla    = achLowerBetter(slaAvg, targets.sla_hours)
  const achVendor = achLowerBetter(vendorAvg, targets.vendor_speed)
  const achSku    = skuDelta !== null ? achHigherBetter(skuDelta, targets.gm_delta) : 0
  const achHk3    = achHigherBetter(hk3Pct, targets.hk3_pct)
  const achBegau  = achHigherBetter(auto?.begau.total ?? 0, targets.begau)
  const overallScore = (
    achSla * WEIGHTS.sla + achVendor * WEIGHTS.vendor_speed + achSku * WEIGHTS.sku_gm +
    achHk3 * WEIGHTS.hk3 + achBegau * WEIGHTS.begau
  ) / 100

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
              Product Operations & BI Analyst · Q3/Q4 2026 · nguồn dữ liệu minh bạch, kiểm tra được từng số
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
          <button onClick={openEditTarget}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Sửa Target
          </button>
        </div>
      </div>

      {/* Weighted Score card */}
      <div className="bg-slate-900 rounded-2xl px-6 py-5 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gauge className="w-8 h-8 text-white/70" />
            <div>
              <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Weighted OKR Score — {qLabel}</p>
              <p className="text-4xl font-black">{loading ? "…" : `${overallScore.toFixed(1)}%`}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
            {[
              ["SLA", achSla, WEIGHTS.sla],
              ["Vendor Speed", achVendor, WEIGHTS.vendor_speed],
              ["SKU GM", achSku, WEIGHTS.sku_gm],
              ["%3HK", achHk3, WEIGHTS.hk3],
              ["Bé Gấu", achBegau, WEIGHTS.begau],
            ].map(([label, ach, w]) => (
              <div key={label as string} className="bg-white/10 rounded-xl px-2 py-2 min-w-[64px]">
                <p className="text-[9px] font-bold text-white/50 uppercase">{label}</p>
                <p className="text-sm font-black">{(ach as number).toFixed(0)}%</p>
                <p className="text-[9px] text-white/40">w={w}%</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-white/40 mt-3 leading-relaxed">
          Công thức: Σ(đạt-%<sub>i</sub> × trọng-số<sub>i</sub>) / 100. Trọng số 70/30 lấy đúng theo offer letter
          (Operational Excellence + Product Performance = 70% time-allocation, BI &amp; AI Automation = 30%); 4 chỉ số
          trong nhóm 70% chia đều 17.5% (offer letter không ghi trọng số riêng từng chỉ số) — sửa hằng số <code>WEIGHTS</code> trong
          code nếu sếp chốt trọng số khác. Mỗi đạt-% cap 0–100%.
        </p>
      </div>

      {/* Data freshness / trust bar */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[11px] text-amber-700 font-medium space-y-1">
        <div>📌 <strong>Baseline T8/2026:</strong> SLA = {BASELINE_NOTE.sla} · Vendor Speed = {BASELINE_NOTE.vendor_speed} · SKU GM = {auto?.gm.baseline ?? "…"}% · Datapool = {auto?.hk3.baseline ?? "…"}% · Tasks = {BASELINE_NOTE.begau_weekly}</div>
        {auto && <div className="text-amber-500">🕐 {auto.data_cutoff} · Trang tải lúc {new Date(auto.generated_at).toLocaleString("vi-VN")}</div>}
        <div className="flex flex-wrap gap-3 pt-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Auto = tính thẳng từ DB, không sửa được</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" />Manual·verified = tự nhập nhưng bắt buộc 2 ảnh chứng minh, khoá sau khi quý đóng</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" />Context = số tham khảo, KHÔNG phải KPI chính thức</span>
        </div>
      </div>

      {/* Target edit modal */}
      {editTarget && (
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">Sửa Target — {qLabel}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Lưu target theo từng quý, ghi đè default. {manual?.updated_at && `Sửa lần cuối ${hhmm(manual.updated_at)} bởi ${manual.updated_by}.`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditTarget(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                <XCircle className="w-3.5 h-3.5" /> Hủy
              </button>
              <button onClick={saveTargets} disabled={savingT}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {savingT ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {([
              ["SLA — giờ (max)", "target_sla_hours",    "giờ"],
              ["SLA — compliance", "target_sla_pct",     "%"],
              ["Vendor Speed", "target_vendor_speed",    "phút"],
              ["SKU GM delta",    "target_gm_delta",     "%"],
              ["%3HK Datapool",   "target_hk3_pct",      "%"],
              ["Bé Gấu tasks/quý","target_begau",        "tasks"],
            ] as [string, keyof ManualMetrics, string][]).map(([label, field, unit]) => (
              <div key={field}>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="number" step="0.1" min={0}
                    value={(draftT[field] as number) ?? ""}
                    onChange={e => setDraftT(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-400 shrink-0">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 1. Operational Excellence ── */}
      <div>
        <SectionHeader n={1} label="Operational Excellence" note={`w=${WEIGHTS.sla + WEIGHTS.vendor_speed}%`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EvidenceCard
            metric="sla" quarter={qLabel} unit="giờ"
            targetValue={targets.sla_hours}
            title="Product Request SLA Handling Time"
            targetLabel={`≤ ${targets.sla_hours}h (${targets.sla_pct}% requests)`}
            baselineLabel={BASELINE_NOTE.sla}
            onSummary={setSlaAvg}
          />
          <EvidenceCard
            metric="vendor_speed" quarter={qLabel} unit="phút"
            targetValue={targets.vendor_speed}
            title="Rate Comparison & Vendor Selection Speed"
            targetLabel={`≤ ${targets.vendor_speed} phút/query`}
            baselineLabel={BASELINE_NOTE.vendor_speed}
            onSummary={setVendorAvg}
          />
        </div>
      </div>

      {/* ── 2. Product Performance ── */}
      <div>
        <SectionHeader n={2} label="Product Performance" note={`w=${WEIGHTS.sku_gm + WEIGHTS.hk3}%`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkuTagSection quarter={qLabel} targetDelta={targets.gm_delta} onSummary={setSkuDelta} />

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
                Target: {targets.hk3_pct}% · Baseline: {auto?.hk3.baseline ?? "…"}% · Delta: {hk3Pct > 0 && auto ? `${(hk3Pct-auto.hk3.baseline).toFixed(2)}%` : "…"}
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

        {/* SKU GM — company blended, context only (KHÔNG phải KPI chính) */}
        <div className="mt-4 bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-slate-600">SKU Gross Margin — blended toàn công ty</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">Context, không phải KPI chính</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-xl font-black", gmDelta >= 0 ? "text-slate-700" : "text-amber-600")}>
              {loading ? "…" : `${gmDelta >= 0 ? "+" : ""}${gmDelta.toFixed(2)}%`}
            </span>
            <span className="text-slate-400 text-xs">vs baseline {auto?.gm.baseline ?? "…"}% · QTD actual {auto ? pct(auto.gm.qtd_pct) : "…"} · GP {fck(auto?.gm.total_gp ?? 0)} / Rev {fck(auto?.gm.total_rev ?? 0)}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Số này gộp TOÀN BỘ SKU công ty (bị nhiễu bởi channel-mix/khuyến mãi ngoài kiểm soát cá nhân) — chỉ để tham khảo bối cảnh. KPI chính thức = "SKU Gross Margin — verified" bên trên.</p>
          <SourceBox type="context" table="gohub_dw · fact_fulfillment_revenue (mọi SKU)" filter="SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd), cutoff CURRENT_DATE-1" />
        </div>
      </div>

      {/* ── 3. BI & AI Automation ── */}
      <div>
        <SectionHeader n={3} label="BI & AI Automation" note={`w=${WEIGHTS.begau}%`} />
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
                  Target {selQ}: {targets.begau} tasks · Baseline: {BASELINE_NOTE.begau_weekly}
                  {auto && auto.begau.excluded_short > 0 && ` · đã loại ${auto.begau.excluded_short} tin nhắn quá ngắn (<15 ký tự, không tính là task)`}
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

            {auto && Object.keys(auto.begau.by_role).length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Theo phòng ban sử dụng</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(auto.begau.by_role).sort(([,a],[,b]) => b-a).map(([role, n]) => (
                    <span key={role} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{role}: {n}</span>
                  ))}
                </div>
              </div>
            )}

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
              filter="event_type='chat' AND ai_response IS NOT NULL AND length(trim(ai_response)) >= 15 · Lark: user_email LIKE 'lark:%'" />

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
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setAllowed(d?.my_metrics_enabled === true)
    }).catch(() => setAllowed(false))
  }, [])
  if (allowed === null) return null
  if (!allowed) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-slate-400 text-sm">Bạn không có quyền truy cập trang này.</p>
    </div>
  )
  return <Suspense><MyMetricsInner /></Suspense>
}
