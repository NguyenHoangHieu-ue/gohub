"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback, useRef } from "react"
import { Clock, Lock, Plus, RefreshCw, Upload, Pencil, Trash2, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProgressBar, SourceBox, DataTable } from "@/components/my-metrics/shared-ui"
import { LarkReviewPanel } from "@/components/my-metrics/lark-review-panel"
import { hhmm, uploadImage } from "@/lib/my-metrics-format"
import type { EvidenceData, EvidenceRecord } from "@/lib/my-metrics-types"

// ─── Evidence Section (SLA / Vendor Speed) — manual + Lark auto merged ────────
export function EvidenceCard({
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

  // Case Lark đã confirm (source lark_auto) lỡ bấm nhầm — xoá khỏi okr_lark_events (khác bảng với
  // evidence tay). Xoá thay vì un-confirm: hết bị dedupe ở lần scan sau, tự vào lại hàng chờ duyệt
  // nếu vẫn còn là thread thật.
  const removeLark = async (id: string) => {
    if (!confirm("Xoá case Lark này? (thread vẫn còn thì sẽ tự vào lại hàng chờ duyệt lần quét sau)")) return
    const r = await fetch(`/api/analytics/my-metrics/lark-events/${id}`, { method: "DELETE" })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi xoá"); return }
    fetchData()
  }

  const avg     = data?.avg ?? null
  const actual  = avg ?? 0
  const progress = targetValue > 0 && avg !== null ? Math.max(0, 100 - ((actual - targetValue) / targetValue * 100)) : 0
  const progressCapped = Math.min(100, progress)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">{cardTitle}</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Manual + Lark auto</span>
            {locked && <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide"><Lock className="w-2.5 h-2.5" />Khoá</span>}
          </div>
          {!locked && (
            <button onClick={() => { setEditRec(null); setForm(emptyForm); setShowForm(v => !v) }}
              className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Thêm case tay
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black tabular-nums", avg === null ? "text-slate-300" : avg <= targetValue ? "text-emerald-600" : avg <= targetValue*2 ? "text-brand-600" : "text-amber-600")}>
            {loading ? "…" : avg !== null ? avg.toFixed(1) : "—"}
          </span>
          <span className="text-slate-400 font-bold">{unit} TB</span>
          {data && <span className="text-[11px] text-slate-400">({data.verified} verified / {data.count} case — 🤳 {data.sources?.manual ?? 0} ảnh · 🤖 {data.sources?.lark_auto ?? 0} Lark)</span>}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Target: {targetLabel} · Baseline: {baselineLabel}</div>
      </div>

      <div className="px-5 py-3 space-y-3">
        <ProgressBar actual={progressCapped} target={100} />

        <LarkReviewPanel metric={metric} quarter={quarter} unit={unit} onReviewed={fetchData} />

        {locked && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Quý này đã đóng — không thêm/sửa/xoá/duyệt được nữa (đảm bảo số báo cáo không đổi sau khi chốt).
          </div>
        )}

        {showForm && !locked && (
          <div className="border border-brand-200 rounded-xl p-4 bg-brand-50 space-y-3">
            <p className="text-xs font-black text-brand-600 uppercase tracking-wider">
              {editRec ? "Sửa case" : "Thêm case tay (case Lark không bắt được)"}
            </p>
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
            <input value={form.title} onChange={e => setF("title", e.target.value)}
              placeholder="Mô tả yêu cầu (tuỳ chọn)"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider">📩 Request</p>
                <input type="datetime-local" value={form.request_time} onChange={e => setF("request_time", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
                    className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-2 py-1">
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
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
                    className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-2 py-1">
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
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Đang lưu…" : editRec ? "Cập nhật" : "Thêm"}
              </button>
            </div>
          </div>
        )}

        <DataTable<EvidenceRecord>
          rows={data?.records ?? []}
          rowKey={r => r.id}
          emptyLabel={loading ? "Đang tải…" : "Chưa có case nào — thêm tay hoặc chờ Bé Gấu phát hiện từ Lark."}
          columns={[
            { key: "src", label: "Nguồn", render: r => (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">
                {r.source === "lark_auto" ? "Lark" : "Ảnh"}
              </span>
            ) },
            { key: "req", label: "Request", render: r => (
              <div>
                <span className="font-bold">{hhmm(r.request_time)}</span>
                {(r.title || r.request_note) && <p className="text-slate-400 truncate max-w-[180px]">{r.title || r.request_note}</p>}
              </div>
            ) },
            { key: "comp", label: "Hoàn thành", render: r => r.completion_time
                ? <div><span className="font-bold">{hhmm(r.completion_time)}</span>{r.completion_note && <p className="text-slate-400 truncate max-w-[180px]">{r.completion_note}</p>}</div>
                : <span className="text-slate-300">—</span> },
            { key: "dur", label: "Duration", align: "right", render: r => r.duration_value != null ? `${r.duration_value.toFixed(2)} ${unit}` : "—" },
            { key: "verified", label: "Trạng thái", align: "center", render: r => {
              const isVerified = r.source === "lark_auto" || !!(r.request_image_url && r.completion_image_url && r.duration_value != null)
              return isVerified
                ? <span className="flex items-center justify-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase w-fit mx-auto"><ShieldCheck className="w-2.5 h-2.5" />Verified</span>
                : <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 uppercase">Thiếu ảnh</span>
            } },
            { key: "act", label: "", align: "right", render: r => {
              if (locked) return null
              if (r.source === "manual") return (
                <div className="flex gap-1 justify-end">
                  <button onClick={() => openEdit(r)} className="p-1 rounded text-slate-300 hover:text-brand-600 hover:bg-brand-50"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => remove(r.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                </div>
              )
              return (
                <div className="flex gap-1 justify-end">
                  <button onClick={() => removeLark(r.id)} title="Xoá case Lark đã xác nhận nhầm"
                    className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                </div>
              )
            } },
          ]}
        />

        <SourceBox type="manual" table="Supabase · okr_evidence_records (ảnh) + okr_lark_events (Lark, đã duyệt)"
          filter={`metric = '${metric}' · quarter = '${quarter}' · TB chỉ tính case verified (đủ 2 ảnh HOẶC Lark đã Xác nhận)`} />
      </div>
    </div>
  )
}
