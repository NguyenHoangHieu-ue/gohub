"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react"
import dynamic from "next/dynamic"
import {
  Target, Pencil, Save, XCircle, RefreshCw, Plus, Trash2,
  Clock, ChevronDown, ChevronUp, Lock, ShieldCheck, Tag, Gauge,
  Zap, BarChart3, Bot, Info, Settings, Check, X, Search, Sparkles,
  Upload, MessageSquare, ChevronLeft, ChevronRight, BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// Biểu đồ nạp động (ssr:false) → recharts code-split khỏi bundle đầu (khớp pattern bod-charts.tsx).
const chartLoading = () => <div className="w-full h-full animate-pulse bg-white/10 rounded-xl" />
const ScoreRadarChart    = dynamic(() => import("./my-metrics-charts").then(m => m.ScoreRadarChart),    { ssr: false, loading: chartLoading })
const DatapoolTrendChart = dynamic(() => import("./my-metrics-charts").then(m => m.DatapoolTrendChart), { ssr: false, loading: chartLoading })
const BegauTrendChart    = dynamic(() => import("./my-metrics-charts").then(m => m.BegauTrendChart),    { ssr: false, loading: chartLoading })
const SkuMoversChart     = dynamic(() => import("./my-metrics-charts").then(m => m.SkuMoversChart),     { ssr: false, loading: chartLoading })

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutoMetrics {
  quarter: string; year: number; start: string; end: string
  data_cutoff: string; generated_at: string
  hk3: { pct: number; hk3_rev: number; hk3_only_rev: number; bc_only_rev: number; total_rev: number; monthly: MonthStat[]; baseline: number }
  gm:  { qtd_pct: number; total_gp: number; total_rev: number; monthly: GmStat[]; baseline: number }
  begau: {
    total: number; web: number; lark: number; excluded_short: number
    by_role: Record<string, number>; monthly: Record<string, MonthCount>
  }
}
interface MonthStat    { month: string; hk3_rev: number; bc_rev: number; total_rev: number }
interface GmStat       { month: string; gp: number; rev: number; gm_pct: number }
interface MonthCount   { total: number; web: number; lark: number }
interface EvidenceRecord {
  id: string; quarter: string; metric: string; title: string | null
  request_time: string; request_note: string | null; request_image_url: string | null
  completion_time: string | null; completion_note: string | null; completion_image_url: string | null
  duration_value: number | null; created_by: string | null; created_at: string
  updated_by?: string | null; updated_at?: string | null
  source?: "manual" | "lark_auto"
}
interface EvidenceData {
  records: EvidenceRecord[]; avg: number | null; count: number; completed: number; verified: number
  locked: boolean; sources?: { manual: number; lark_auto: number }
}
interface LarkEvent {
  id: string; quarter: string; metric: string; message_id: string
  request_time: string; request_snippet: string | null; request_sender: string | null
  completion_time: string | null; completion_snippet: string | null; completion_sender: string | null
  duration_value: number | null; ai_reason: string | null
  status: "pending_review" | "confirmed" | "rejected"
}
interface Conversation {
  id: number; user_message: string; ai_response: string
  channel: string; user: string; created_at: string
}
interface ManualMetrics {
  target_sla_hours: number; target_sla_pct: number; target_vendor_speed: number
  target_gm_delta: number; target_hk3_pct: number; target_begau: number
  updated_by?: string; updated_at?: string
}
interface SkuScanItem {
  sku: string; category: string | null; vendor: string | null
  rev_cur: number; gp_cur: number; gm_pct_cur: number; orders_cur: number
  rev_prev: number; gp_prev: number; gm_pct_prev: number; orders_prev: number
  delta: number | null; delta_basis: string
  is_key: boolean; is_new: boolean; cum_rev_pct: number
}
interface SkuScanData {
  quarter: string; prevQuarter: string; key_threshold_pct: number
  items: SkuScanItem[]; weighted_delta: number | null
  key_count: number; new_count: number; scored_count: number; total_rev_cur: number
}
interface SkuNote { id: string; sku_code: string; note: string | null; created_by: string }
interface DatapoolDetailItem { sku: string; vendor: string; category: string | null; rev: number; units: number; orders: number }
interface DatapoolDetailData { items: DatapoolDetailItem[]; total_rev: number; total_orders: number; total_units: number }

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
const OKR_GM_BASELINE_DISPLAY = 36.7 // hiển thị context — nguồn thật nằm ở lib/okr-helpers.ts

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
  const color = p >= 100 ? "bg-emerald-500" : p >= 75 ? "bg-brand-600" : "bg-amber-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${p}%` }} />
      </div>
      <span className={cn("text-xs font-black w-12 text-right", p >= 100 ? "text-emerald-600" : p >= 75 ? "text-brand-600" : "text-amber-600")}>
        {p.toFixed(1)}%
      </span>
    </div>
  )
}

function SourceBox({ type, table, filter }: { type: "auto"|"manual"|"context"; table: string; filter?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
        <Info className="w-3 h-3" />
        Nguồn dữ liệu
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1.5 pl-2.5 border-l-2 border-slate-200 text-[11px] font-mono text-slate-500 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wide">{type}</span>
            <span className="font-bold text-slate-600">{table}</span>
          </div>
          {filter && <div className="text-slate-400 break-all">{filter}</div>}
        </div>
      )}
    </div>
  )
}

// ─── Notes Drawer — mọi ghi chú/công thức/giải thích gộp vào 1 nơi, ẩn mặc định ──
// Trước đây các đoạn text này nằm rải rác luôn-hiện trong từng card → rối mắt. Nay dồn hết vào đây,
// mở bằng 1 nút duy nhất trên header trang. Số liệu chính vẫn hiện ngay trên card; chỉ "vì sao/tính
// thế nào" mới cần bấm xem.
interface NoteSection { id: string; title: string; body: React.ReactNode }

function NotesDrawer({ sections, onClose }: { sections: NoteSection[]; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 animate-overlay-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-black text-slate-900">Cách tính &amp; ghi chú</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-2">
          {sections.map(s => (
            <div key={s.id} className="border border-slate-100 rounded-xl overflow-hidden">
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors">
                <span className="text-xs font-black text-slate-700">{s.title}</span>
                {openId === s.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>
              {openId === s.id && (
                <div className="px-3.5 pb-3.5 text-[11px] text-slate-500 leading-relaxed space-y-1.5">{s.body}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Generic data table — dùng cho mọi widget lấy số từ DB, theo yêu cầu "hiển thị dữ liệu bảng" ──
function DataTable<T>({ columns, rows, rowKey, pageSize = 50, emptyLabel = "Chưa có dữ liệu." }: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; render: (row: T) => React.ReactNode }[]
  rows: T[]
  rowKey: (row: T) => string
  pageSize?: number
  emptyLabel?: string
}) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows.length])
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize)
  if (rows.length === 0) return <p className="text-[11px] text-slate-400 text-center py-4">{emptyLabel}</p>
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={cn("px-2.5 py-2 font-black text-slate-500 uppercase tracking-wider text-[9px] whitespace-nowrap",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={rowKey(row)} className={cn("border-t border-slate-50", i % 2 === 1 && "bg-slate-50/40")}>
                {columns.map(c => (
                  <td key={c.key} className={cn("px-2.5 py-1.5 text-slate-700 align-top",
                    c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "text-left")}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-500">{page + 1}/{pages} · {rows.length} dòng</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
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

// ─── Bé Gấu review queue (Lark auto-detect) ───────────────────────────────────
function LarkReviewPanel({ metric, quarter, unit, onReviewed }: {
  metric: "sla" | "vendor_speed"; quarter: string; unit: "giờ" | "phút"; onReviewed?: () => void
}) {
  const [pending,    setPending]    = useState<LarkEvent[]>([])
  const [rejected,   setRejected]   = useState<LarkEvent[]>([])
  const [notMatched, setNotMatched] = useState<LarkEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(true)
  const [rejOpen, setRejOpen] = useState(false)
  const [nmOpen, setNmOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, { request_time: string; completion_time: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [p, r, nm] = await Promise.all([
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=pending_review`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=rejected`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=not_matched`),
    ])
    if (p.ok) { const j = await p.json(); setPending(j.items ?? []) }
    if (r.ok) { const j = await r.json(); setRejected(j.items ?? []) }
    if (nm.ok) { const j = await nm.json(); setNotMatched(j.items ?? []) }
    setLoaded(true)
  }, [quarter, metric])

  useEffect(() => { fetchData() }, [fetchData])

  const startEdit = (ev: LarkEvent) => setEditing(p => ({
    ...p, [ev.id]: { request_time: ev.request_time?.slice(0, 16) ?? "", completion_time: ev.completion_time?.slice(0, 16) ?? "" },
  }))

  const review = async (id: string, action: "confirm" | "reject", times?: { request_time?: string; completion_time?: string }) => {
    setBusy(id)
    const r = await fetch(`/api/analytics/my-metrics/lark-events/${id}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...times }),
    })
    setBusy(null)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi duyệt"); return }
    setEditing(p => { const n = { ...p }; delete n[id]; return n })
    fetchData()
    onReviewed?.()
  }

  if (!loaded) return null
  const totalSeen = pending.length + rejected.length + notMatched.length
  if (totalSeen === 0) return null

  return (
    <div className="border border-amber-200 rounded-xl bg-amber-50/50 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="flex items-center gap-1.5 text-xs font-black text-amber-700">
          <Sparkles className="w-3.5 h-3.5" />
          {pending.length > 0 ? `Bé Gấu phát hiện ${pending.length} case mới — chờ duyệt` : "Chưa có case mới chờ duyệt"}
          <span className="font-normal text-amber-600/70">· đã quét {totalSeen} thread</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-amber-600" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-600" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {pending.map(ev => {
            const isEditing = !!editing[ev.id]
            return (
              <div key={ev.id} className="bg-white border border-amber-200 rounded-lg p-2.5 text-[11px]">
                <p className="text-slate-500 italic mb-1 truncate">"{ev.ai_reason || "(không có lý do)"}"</p>
                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <div><span className="text-slate-400">📩 </span><span className="font-bold">{hhmm(ev.request_time)}</span><p className="text-slate-400 truncate">{ev.request_snippet}</p></div>
                    <div><span className="text-slate-400">✅ </span><span className="font-bold">{ev.completion_time ? hhmm(ev.completion_time) : "chưa xong"}</span><p className="text-slate-400 truncate">{ev.completion_snippet}</p></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="datetime-local" value={editing[ev.id].request_time}
                      onChange={e => setEditing(p => ({ ...p, [ev.id]: { ...p[ev.id], request_time: e.target.value } }))}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                    <input type="datetime-local" value={editing[ev.id].completion_time}
                      onChange={e => setEditing(p => ({ ...p, [ev.id]: { ...p[ev.id], completion_time: e.target.value } }))}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                  </div>
                )}
                {ev.duration_value != null && !isEditing && <p className="mt-1 font-black text-slate-700">⏱ {ev.duration_value.toFixed(2)} {unit}</p>}
                <div className="flex gap-1.5 mt-2">
                  {!isEditing ? (
                    <>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "confirm")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="w-3 h-3" /> Xác nhận
                      </button>
                      <button onClick={() => startEdit(ev)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <Pencil className="w-3 h-3" /> Sửa giờ
                      </button>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "reject")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                        <X className="w-3 h-3" /> Từ chối
                      </button>
                    </>
                  ) : (
                    <>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "confirm", {
                        request_time: editing[ev.id].request_time ? new Date(editing[ev.id].request_time).toISOString() : undefined,
                        completion_time: editing[ev.id].completion_time ? new Date(editing[ev.id].completion_time).toISOString() : undefined,
                      })} className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        Lưu &amp; xác nhận
                      </button>
                      <button onClick={() => setEditing(p => { const n = { ...p }; delete n[ev.id]; return n })}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {rejected.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setRejOpen(v => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                {rejOpen ? "Ẩn" : "Xem"} {rejected.length} case đã từ chối (Hiếu từ chối tay)
              </button>
              {rejOpen && (
                <div className="mt-1.5 space-y-1">
                  {rejected.map(ev => (
                    <div key={ev.id} className="text-[10px] text-slate-400 bg-white/60 rounded px-2 py-1">
                      {hhmm(ev.request_time)} · {(ev.request_snippet ?? "").slice(0, 60)} — <em>{ev.ai_reason}</em>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {notMatched.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setNmOpen(v => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                {nmOpen ? "Ẩn" : "Xem"} {notMatched.length} thread Bé Gấu ĐÃ XEM nhưng không khớp (audit AI — kiểm tra bot có bỏ sót không)
              </button>
              {nmOpen && (
                <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto">
                  {notMatched.map(ev => (
                    <div key={ev.id} className="text-[10px] text-slate-400 bg-white/60 rounded px-2 py-1">
                      {hhmm(ev.request_time)} · {(ev.request_snippet ?? "").slice(0, 80)} — <em>{ev.ai_reason || "(không có lý do)"}</em>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Evidence Section (SLA / Vendor Speed) — manual + Lark auto merged ────────
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
            { key: "act", label: "", align: "right", render: r => r.source === "manual" && !locked ? (
              <div className="flex gap-1 justify-end">
                <button onClick={() => openEdit(r)} className="p-1 rounded text-slate-300 hover:text-brand-600 hover:bg-brand-50"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => remove(r.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
              </div>
            ) : null },
          ]}
        />

        <SourceBox type="manual" table="Supabase · okr_evidence_records (ảnh) + okr_lark_events (Lark, đã duyệt)"
          filter={`metric = '${metric}' · quarter = '${quarter}' · TB chỉ tính case verified (đủ 2 ảnh HOẶC Lark đã Xác nhận)`} />
      </div>
    </div>
  )
}

// ─── Datapool Rev — chi tiết theo SKU (đơn/rev/units) ─────────────────────────
function DatapoolDetailTable({ quarter }: { quarter: string }) {
  const [data, setData] = useState<DatapoolDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [vendorFilter, setVendorFilter] = useState<"all" | "3HK Datapool" | "BC Datapool">("all")

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/datapool-detail?quarter=${quarter}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [quarter])

  useEffect(() => { fetchData() }, [fetchData])

  const items = data?.items ?? []
  const filtered = items.filter(it => {
    if (vendorFilter !== "all" && it.vendor !== vendorFilter) return false
    if (search.trim() && ![it.sku, it.category, it.vendor].some(v => (v ?? "").toLowerCase().includes(search.trim().toLowerCase()))) return false
    return true
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">Datapool Rev — chi tiết theo SKU</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value as any)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="all">Mọi vendor</option>
              <option value="3HK Datapool">3HK Datapool</option>
              <option value="BC Datapool">BC Datapool</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm SKU / category…"
                className="pl-7 pr-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-44" />
            </div>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5">
          {data ? `${items.length} SKU · ${fck(data.total_rev)} rev · ${data.total_orders.toLocaleString()} đơn · ${data.total_units.toLocaleString()} units` : "…"}
          {filtered.length !== items.length && ` — đang lọc còn ${filtered.length} SKU`}
        </div>
      </div>
      <div className="px-5 py-3">
        <DataTable<DatapoolDetailItem>
          rows={filtered}
          rowKey={it => it.sku}
          emptyLabel={loading ? "Đang tải…" : "Không có SKU nào khớp."}
          columns={[
            { key: "sku", label: "SKU", render: it => <span className="font-black text-slate-800">{it.sku}</span> },
            { key: "vendor", label: "Vendor", render: it => <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">{it.vendor}</span> },
            { key: "orders", label: "Đơn", align: "right", render: it => it.orders.toLocaleString() },
            { key: "units", label: "Units", align: "right", render: it => it.units.toLocaleString() },
            { key: "rev", label: "Revenue", align: "right", render: it => <span className="font-black">{fck(it.rev)}</span> },
          ]}
        />
        <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue (GROUP BY sku, vendor)"
          filter="REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')" />
      </div>
    </div>
  )
}

// ─── SKU Gross Margin — quét toàn hệ thống (thay tag tay) ─────────────────────
function SkuScanSection({ quarter, targetDelta, onSummary }: { quarter: string; targetDelta: number; onSummary?: (delta: number | null) => void }) {
  const [data, setData] = useState<SkuScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, SkuNote>>({})
  const [locked, setLocked] = useState(false)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "key" | "new">("all")
  const [editingSku, setEditingSku] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const fetchScan = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/sku-scan?quarter=${quarter}`)
    if (r.ok) { const d = await r.json(); setData(d); onSummary?.(d.weighted_delta) }
    setLoading(false)
  }, [quarter]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotes = useCallback(async () => {
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?quarter=${quarter}`)
    if (r.ok) {
      const d = await r.json()
      setLocked(d.locked)
      const map: Record<string, SkuNote> = {}
      for (const it of (d.items ?? [])) map[it.sku_code] = it
      setNotes(map)
    }
  }, [quarter])

  useEffect(() => { fetchScan(); fetchNotes() }, [fetchScan, fetchNotes])

  const items = data?.items ?? []
  const categories = Array.from(new Set(items.map(it => it.category).filter(Boolean))) as string[]
  const vendors    = Array.from(new Set(items.map(it => it.vendor).filter(Boolean))) as string[]
  const filtered = items.filter(it => {
    if (categoryFilter !== "all" && it.category !== categoryFilter) return false
    if (vendorFilter !== "all" && it.vendor !== vendorFilter) return false
    if (typeFilter === "key" && !it.is_key) return false
    if (typeFilter === "new" && !it.is_new) return false
    if (search.trim() && ![it.sku, it.category, it.vendor].some(v => (v ?? "").toLowerCase().includes(search.trim().toLowerCase()))) return false
    return true
  })

  const saveNote = async (sku: string) => {
    setSavingNote(true)
    const r = await fetch("/api/analytics/my-metrics/sku-tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter, sku_code: sku, note: noteDraft }),
    })
    setSavingNote(false)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi lưu ghi chú"); return }
    setEditingSku(null); setNoteDraft("")
    fetchNotes()
  }

  const removeNote = async (id: string) => {
    if (!confirm("Xoá ghi chú này?")) return
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?id=${id}`, { method: "DELETE" })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi xoá"); return }
    fetchNotes()
  }

  const wd = data?.weighted_delta ?? null

  // Top 5 tăng + top 5 giảm delta GM% trong nhóm tính KPI (key/new) — cho biểu đồ movers.
  const movers = useMemo(() => {
    const scored = items.filter(it => (it.is_key || it.is_new) && it.delta !== null)
    const gainers = [...scored].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5)
    const losers  = [...scored].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5).reverse()
    const merged = [...gainers, ...losers.filter(l => !gainers.some(g => g.sku === l.sku))]
    return merged.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).map(it => ({ sku: it.sku, delta: it.delta ?? 0 }))
  }, [items])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">SKU Gross Margin — quét toàn hệ thống</span>
            <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide"><ShieldCheck className="w-2.5 h-2.5" />Auto · mọi SKU</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="all">Mọi loại</option>
              <option value="key">Chỉ Trọng điểm</option>
              <option value="new">Chỉ Mới</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[140px]">
              <option value="all">Mọi category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[140px]">
              <option value="all">Mọi vendor</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm SKU…"
                className="pl-7 pr-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-36" />
            </div>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black tabular-nums", loading ? "text-slate-300" : wd === null ? "text-slate-300" : wd >= targetDelta ? "text-emerald-600" : wd >= 0 ? "text-brand-600" : "text-amber-600")}>
            {loading ? "…" : wd !== null ? `${wd >= 0 ? "+" : ""}${wd.toFixed(2)}%` : "—"}
          </span>
          <span className="text-slate-400 text-sm font-bold">weighted, {data ? `${data.scored_count} SKU trọng điểm/mới tính KPI` : "…"}</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Target: +{targetDelta}% · {data ? `${data.key_count} SKU top ${data.key_threshold_pct}% doanh thu · ${data.new_count} SKU mới quý này · ${items.length} SKU có phát sinh` : "…"}
          {filtered.length !== items.length && ` — đang lọc còn ${filtered.length} SKU`}
        </div>
      </div>

      <div className="px-5 py-3 space-y-3">
        {targetDelta > 0 && <ProgressBar actual={Math.max(0, wd ?? 0)} target={targetDelta} />}

        {movers.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Biến động GM% lớn nhất (SKU trọng điểm/mới)</p>
            <div style={{ height: Math.max(140, movers.length * 26) }}>
              <SkuMoversChart data={movers} />
            </div>
          </div>
        )}

        <DataTable<SkuScanItem>
          rows={filtered}
          rowKey={it => it.sku}
          emptyLabel={loading ? "Đang tải…" : "Không có SKU nào khớp."}
          columns={[
            { key: "sku", label: "SKU", render: it => (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-black text-slate-800">{it.sku}</span>
                {it.is_key && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-brand-50 text-brand-600 uppercase">Key</span>}
                {it.is_new && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">Mới</span>}
              </div>
            ) },
            { key: "vendor", label: "Vendor", render: it => <span className="text-slate-500">{it.vendor ?? "—"}</span> },
            { key: "rev_cur", label: "Rev quý này", align: "right", render: it => fck(it.rev_cur) },
            { key: "gm_cur", label: "GM% quý này", align: "right", render: it => it.rev_cur > 0 ? pct(it.gm_pct_cur) : "—" },
            { key: "rev_prev", label: "Rev quý trước", align: "right", render: it => fck(it.rev_prev) },
            { key: "gm_prev", label: "GM% quý trước", align: "right", render: it => it.rev_prev > 0 ? pct(it.gm_pct_prev) : "—" },
            { key: "delta", label: "Δ GM%", align: "right", render: it => it.delta !== null
                ? <span className={cn("font-black", it.delta >= 0 ? "text-emerald-600" : "text-amber-600")}>{it.delta >= 0 ? "+" : ""}{it.delta.toFixed(2)}%</span>
                : <span className="text-slate-300">—</span> },
            { key: "note", label: "Ghi chú", render: it => {
              const n = notes[it.sku]
              if (editingSku === it.sku) return (
                <div className="flex items-center gap-1">
                  <input autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveNote(it.sku)}
                    className="border border-slate-200 rounded px-1.5 py-0.5 text-[10px] w-32" />
                  <button disabled={savingNote} onClick={() => saveNote(it.sku)} className="text-emerald-600"><Check className="w-3 h-3" /></button>
                  <button onClick={() => setEditingSku(null)} className="text-slate-400"><X className="w-3 h-3" /></button>
                </div>
              )
              return (
                <div className="flex items-center gap-1">
                  <button disabled={locked} onClick={() => { setEditingSku(it.sku); setNoteDraft(n?.note ?? "") }}
                    className={cn("text-left hover:text-brand-600 disabled:hover:text-slate-400 truncate max-w-[140px]", n?.note ? "text-slate-600" : "text-slate-300 italic")}>
                    {n?.note || (locked ? "—" : "+ thêm ghi chú")}
                  </button>
                  {n?.note && !locked && (
                    <button onClick={() => removeNote(n.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-2.5 h-2.5" /></button>
                  )}
                </div>
              )
            } },
          ]}
        />
        <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue (toàn bộ SKU, quý này vs quý trước)"
          filter={`GM% = SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd) · trọng điểm = top ${data?.key_threshold_pct ?? 80}% doanh thu tích luỹ · mới = so baseline ${OKR_GM_BASELINE_DISPLAY}%`} />
      </div>
    </div>
  )
}

// ─── Lark scan config modal (admin/creator) ───────────────────────────────────
function LarkConfigModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState({ enabled: false, chat_id: "", days_back: 3 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ scanned: number; classified: number; inserted: number; not_matched: number; backlog_remaining: number; skipped?: string } | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/analytics/my-metrics/lark-config").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setCfg({ enabled: d.enabled ?? false, chat_id: d.chat_id ?? "", days_back: d.days_back ?? 3 })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setErr(null)
    const r = await fetch("/api/analytics/my-metrics/lark-config", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    })
    setSaving(false)
    if (!r.ok) { const j = await r.json(); setErr(j.error ?? "Lỗi lưu"); return }
    onClose()
  }

  const scanNow = async () => {
    setScanning(true); setScanErr(null); setScanResult(null)
    const r = await fetch("/api/analytics/my-metrics/lark-config/scan-now", { method: "POST" })
    const j = await r.json()
    setScanning(false)
    if (!r.ok) { setScanErr(j.error ?? "Lỗi quét"); return }
    setScanResult(j)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Settings className="w-4 h-4" /> Cấu hình Bé Gấu quét Lark</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        {loading ? <p className="text-xs text-slate-400">Đang tải…</p> : (
          <>
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(p => ({ ...p, enabled: e.target.checked }))} />
              Bật quét tự động
            </label>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Chat ID group Lark</label>
              <input value={cfg.chat_id} onChange={e => setCfg(p => ({ ...p, chat_id: e.target.value }))}
                placeholder="oc_xxxxxxxxxxxxx"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <p className="text-[10px] text-slate-400 mt-1">Group Sales/PIC nhắn yêu cầu sản phẩm / hỏi giá NCC. Bot quét thread trong group này mỗi vài giờ.</p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Quét ngược N ngày</label>
              <input type="number" min={1} value={cfg.days_back} onChange={e => setCfg(p => ({ ...p, days_back: parseInt(e.target.value) || 3 }))}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="border-t border-slate-100 pt-3">
              <button onClick={scanNow} disabled={scanning || !cfg.chat_id}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                <Sparkles className="w-3.5 h-3.5" /> {scanning ? "Đang quét (có thể mất 30-60s)…" : "Quét ngay để test"}
              </button>
              {!cfg.chat_id && <p className="text-[10px] text-slate-400 mt-1 text-center">Nhập Chat ID trước đã.</p>}
              {scanErr && <p className="text-[11px] text-red-600 font-bold mt-2">{scanErr}</p>}
              {scanResult && (
                scanResult.skipped
                  ? <p className="text-[11px] text-slate-500 mt-2">Bỏ qua: {scanResult.skipped}</p>
                  : (
                    <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2.5 space-y-0.5">
                      <div>Đã quét <strong className="tabular-nums">{scanResult.scanned}</strong> thread có reply trong cửa sổ {cfg.days_back} ngày.</div>
                      <div>Phân loại lần này: <strong className="tabular-nums">{scanResult.classified}</strong> thread mới.</div>
                      <div>→ <strong className="text-emerald-600 tabular-nums">{scanResult.inserted}</strong> case mới vào hàng chờ duyệt · <strong className="tabular-nums">{scanResult.not_matched}</strong> không khớp.</div>
                      {scanResult.backlog_remaining > 0 && (
                        <div className="text-amber-600">Còn <strong className="tabular-nums">{scanResult.backlog_remaining}</strong> thread cũ hơn chưa kịp phân loại — chạy thêm lần nữa hoặc đợi cron ngày mai.</div>
                      )}
                    </div>
                  )
              )}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
              <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function MyMetricsInner({ canConfigLark }: { canConfigLark: boolean }) {
  const def = currentQuarter()
  const [selQ,    setSelQ]    = useState<"Q3"|"Q4">(def.q)
  const [selYear, setSelYear] = useState(def.year)
  const [auto,    setAuto]    = useState<AutoMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLarkConfig, setShowLarkConfig] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

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

  const gmDelta  = auto ? +(auto.gm.qtd_pct - auto.gm.baseline).toFixed(2) : 0
  const hk3Pct   = auto?.hk3.pct ?? 0
  const convPages = Math.ceil(convTotal / CONV_LIMIT)

  const hk3TableRows = auto?.hk3.monthly ?? []
  const begauMonthEntries = Object.entries(auto?.begau.monthly ?? {}).sort(([a], [b]) => a.localeCompare(b))

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

  // ── Dữ liệu cho chart (đều suy từ state đã fetch, không gọi API riêng) ──
  const radarData = [
    { metric: "SLA", value: Math.min(120, achSla), weight: WEIGHTS.sla, target: 100 as const },
    { metric: "Vendor Speed", value: Math.min(120, achVendor), weight: WEIGHTS.vendor_speed, target: 100 as const },
    { metric: "SKU GM", value: Math.min(120, achSku), weight: WEIGHTS.sku_gm, target: 100 as const },
    { metric: "%3HK", value: Math.min(120, achHk3), weight: WEIGHTS.hk3, target: 100 as const },
    { metric: "Bé Gấu", value: Math.min(120, achBegau), weight: WEIGHTS.begau, target: 100 as const },
  ]
  const datapoolTrend = hk3TableRows.map(m => ({
    month: m.month, pct: m.total_rev > 0 ? ((m.hk3_rev + m.bc_rev) / m.total_rev) * 100 : 0,
  }))
  const begauTrendData = begauMonthEntries.map(([month, d]) => ({ month, web: d.web, lark: d.lark }))

  // ── Nội dung Notes Drawer — mọi công thức/giải thích trước đây nằm rải rác luôn-hiện trong card ──
  const noteSections: NoteSection[] = [
    {
      id: "score", title: "Weighted OKR Score — công thức",
      body: (
        <>
          <p>Σ(đạt-%<sub>i</sub> × trọng-số<sub>i</sub>) / 100. Mỗi đạt-% cap 0–100% trước khi nhân trọng số.</p>
          <p>Trọng số 70/30 lấy đúng theo offer letter (Operational Excellence + Product Performance = 70% time-allocation, BI &amp; AI Automation = 30%); 4 chỉ số trong nhóm 70% chia đều 17.5% (offer letter không ghi trọng số riêng từng chỉ số) — sửa hằng số <code>WEIGHTS</code> trong code nếu sếp chốt trọng số khác.</p>
          <p>Radar hiển thị đạt-% từng trục tới 120% (vượt target vẫn thấy rõ) — vòng nét đứt = mốc 100%.</p>
        </>
      ),
    },
    {
      id: "status", title: "Trạng thái &amp; màu badge",
      body: (
        <>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />Chờ duyệt = Bé Gấu đề xuất, chưa tính vào KPI.</p>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />Verified = có bằng chứng kiểm tra được (ảnh hoặc log chat + người duyệt).</p>
          <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />Auto/Context = tính thẳng từ DB hoặc chỉ tham khảo — không phải case cần duyệt.</p>
        </>
      ),
    },
    {
      id: "sku-gm", title: "SKU Gross Margin — cách tính",
      body: (
        <>
          <p>Tự quét TOÀN BỘ SKU có đơn trong quý (không cần gắn tay) — so GM% quý này vs quý trước cho từng SKU.</p>
          <p>"Trọng điểm" = SKU nằm trong nhóm đóng góp 80% doanh thu tích luỹ (Pareto). "Mới" = SKU chưa bán quý trước, so với baseline công ty {OKR_GM_BASELINE_DISPLAY}%.</p>
          <p>KPI chính thức = weighted theo SKU trọng điểm/mới. Số "blended toàn công ty" (thẻ xám bên dưới bảng) chỉ để tham khảo bối cảnh — gộp mọi SKU nên bị nhiễu bởi channel-mix/khuyến mãi ngoài kiểm soát cá nhân.</p>
        </>
      ),
    },
    {
      id: "datapool", title: "%3HK + Datapool — cách tính",
      body: <p>Doanh thu SKU vendor 3HK Datapool hoặc BC Datapool / tổng doanh thu công ty trong quý — tính trên gohub_dw, cutoff hôm qua.</p>,
    },
    {
      id: "begau", title: "Tasks via Bé Gấu — cách tính",
      body: (
        <>
          <p>Đếm hội thoại chat có phản hồi AI dài ≥15 ký tự (loại chào hỏi/lỗi cụt), company-wide, trong quý.</p>
          {auto && auto.begau.excluded_short > 0 && <p>Đã loại {auto.begau.excluded_short} tin nhắn quá ngắn khỏi kỳ này.</p>}
          <p>Không có structured "success flag" — độ dài phản hồi là proxy, không phải thước đo chuẩn xác tuyệt đối.</p>
        </>
      ),
    },
  ]

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
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
          {canConfigLark && (
            <button onClick={() => setShowLarkConfig(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
              <Settings className="w-3.5 h-3.5" /> Lark Bot
            </button>
          )}
          <button onClick={openEditTarget}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Sửa Target
          </button>
          <button onClick={() => setShowNotes(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> Cách tính
          </button>
        </div>
      </div>

      {showLarkConfig && <LarkConfigModal onClose={() => setShowLarkConfig(false)} />}
      {showNotes && <NotesDrawer sections={noteSections} onClose={() => setShowNotes(false)} />}

      {/* Weighted Score hero — radar 5 trục + tier tiles */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-brand-800 rounded-3xl px-6 py-6 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-center">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Gauge className="w-7 h-7 text-white/60" />
              <div>
                <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Weighted OKR Score — {qLabel}</p>
                <p className="text-5xl font-black tabular-nums leading-none mt-0.5">{loading ? "…" : `${overallScore.toFixed(1)}%`}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {[
                ["SLA", achSla, WEIGHTS.sla],
                ["Vendor Speed", achVendor, WEIGHTS.vendor_speed],
                ["SKU GM", achSku, WEIGHTS.sku_gm],
                ["%3HK", achHk3, WEIGHTS.hk3],
                ["Bé Gấu", achBegau, WEIGHTS.begau],
              ].map(([label, ach, w]) => {
                const achNum = ach as number
                const tier = achNum >= 100 ? "bg-emerald-400" : achNum >= 75 ? "bg-white/60" : "bg-amber-400"
                return (
                  <div key={label as string} className="bg-white/10 rounded-xl px-3 py-2 min-w-[76px] overflow-hidden relative"
                    style={{ flexGrow: w as number, flexBasis: `${(w as number) * 2}px` }}>
                    <p className="text-[9px] font-bold text-white/50 uppercase truncate">{label}</p>
                    <p className="text-lg font-black tabular-nums">{achNum.toFixed(0)}%</p>
                    <p className="text-[9px] text-white/40">w={w}%</p>
                    <div className={cn("absolute bottom-0 left-0 h-[3px]", tier)} style={{ width: `${Math.min(achNum, 100)}%` }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="h-56 hidden lg:block">
            <ScoreRadarChart data={radarData} />
          </div>
        </div>
      </div>

      {/* Data freshness — chỉ số cần biết ngay, còn phần "vì sao/công thức" đã dồn vào nút Cách tính */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>📌 <strong className="text-slate-600">Baseline T8/2026:</strong> SLA {BASELINE_NOTE.sla} · Vendor Speed {BASELINE_NOTE.vendor_speed} · SKU GM {OKR_GM_BASELINE_DISPLAY}% · Datapool {auto?.hk3.baseline ?? "…"}%</span>
        {auto && <span className="text-slate-400">🕐 {auto.data_cutoff} · tải lúc {new Date(auto.generated_at).toLocaleString("vi-VN")}</span>}
      </div>

      {/* Target edit modal */}
      {editTarget && (
        <div className="bg-white border border-brand-200 rounded-2xl shadow-sm overflow-hidden">
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
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-500"
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
        <div className="space-y-4">
          <SkuScanSection quarter={qLabel} targetDelta={targets.gm_delta} onSummary={setSkuDelta} />

          {/* Datapool Rev (3HK + BC) % — auto */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-black text-slate-800">%Datapool Rev (3HK + BC Datapool)</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-3xl font-black tabular-nums", loading ? "text-slate-300" : hk3Pct >= targets.hk3_pct ? "text-emerald-600" : hk3Pct >= targets.hk3_pct*0.75 ? "text-brand-600" : "text-amber-600")}>
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
              <div className="flex gap-4 text-[11px] text-slate-500">
                <span>Datapool Rev (tổng): <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.hk3_rev ?? 0)}</strong></span>
                <span className="pl-3 border-l border-slate-200">↳ 3HK Rev: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.hk3_only_rev ?? 0)}</strong></span>
                <span>↳ BC Rev: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.bc_only_rev ?? 0)}</strong></span>
                <span>Total Rev công ty: <strong className="text-slate-700 tabular-nums">{fck(auto?.hk3.total_rev ?? 0)}</strong></span>
              </div>
              {datapoolTrend.length > 1 && (
                <div className="h-40">
                  <DatapoolTrendChart data={datapoolTrend} target={targets.hk3_pct} />
                </div>
              )}
              <DataTable<MonthStat>
                rows={hk3TableRows}
                rowKey={m => m.month}
                emptyLabel="Chưa có dữ liệu tháng nào."
                columns={[
                  { key: "m", label: "Tháng", render: m => m.month },
                  { key: "pct", label: "%Datapool", align: "right", render: m => {
                    const mp = m.total_rev > 0 ? ((m.hk3_rev + m.bc_rev) / m.total_rev) * 100 : 0
                    return <span className="font-black text-slate-700">{pct(mp)}</span>
                  } },
                  { key: "hk3", label: "3HK Rev", align: "right", render: m => fck(m.hk3_rev) },
                  { key: "bc", label: "BC Rev", align: "right", render: m => fck(m.bc_rev) },
                  { key: "total", label: "Total Rev", align: "right", render: m => fck(m.total_rev) },
                ]}
              />
              <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue"
                filter="REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')" />
            </div>
          </div>

          <DatapoolDetailTable quarter={qLabel} />

          {/* SKU GM — company blended, context only (KHÔNG phải KPI chính) */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black text-slate-600">SKU Gross Margin — blended toàn công ty</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Context, không phải KPI chính</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-xl font-black", gmDelta >= 0 ? "text-slate-700" : "text-amber-600")}>
                {loading ? "…" : `${gmDelta >= 0 ? "+" : ""}${gmDelta.toFixed(2)}%`}
              </span>
              <span className="text-slate-400 text-xs">vs baseline {auto?.gm.baseline ?? "…"}% · QTD actual {auto ? pct(auto.gm.qtd_pct) : "…"} · GP {fck(auto?.gm.total_gp ?? 0)} / Rev {fck(auto?.gm.total_rev ?? 0)}</span>
            </div>
            <SourceBox type="context" table="gohub_dw · fact_fulfillment_revenue (mọi SKU)" filter="SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd), cutoff CURRENT_DATE-1" />
          </div>
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
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-4xl font-black tabular-nums", loading ? "text-slate-300" :
                    (auto?.begau.total ?? 0) >= targets.begau ? "text-emerald-600" :
                    (auto?.begau.total ?? 0) >= targets.begau*0.75 ? "text-brand-600" : "text-slate-900")}>
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

            {begauTrendData.length > 1 && (
              <div className="mt-4 h-40">
                <BegauTrendChart data={begauTrendData} />
              </div>
            )}

            {begauMonthEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Theo tháng</p>
                <DataTable<[string, MonthCount]>
                  rows={begauMonthEntries}
                  rowKey={([month]) => month}
                  columns={[
                    { key: "m", label: "Tháng", render: ([month]) => month },
                    { key: "total", label: "Total", align: "right", render: ([, d]) => <span className="font-black">{d.total}</span> },
                    { key: "web", label: "Web", align: "right", render: ([, d]) => d.web },
                    { key: "lark", label: "Lark", align: "right", render: ([, d]) => d.lark },
                  ]}
                />
              </div>
            )}
            <SourceBox type="auto" table="Supabase · app_usage_events"
              filter="event_type='chat' AND ai_response IS NOT NULL AND length(trim(ai_response)) >= 15 · Lark: user_email LIKE 'lark:%'" />

            <div className="mt-4 border-t border-slate-100 pt-4">
              <button onClick={() => setShowConvs(v => !v)}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-600 transition-colors">
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
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 tracking-wide">
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
                          <div className="bg-brand-50 rounded-lg p-2.5">
                            <p className="text-[10px] font-black text-brand-600 uppercase tracking-wider mb-1">Bé Gấu</p>
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
  const [role, setRole] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setAllowed(d?.my_metrics_enabled === true)
      setRole(d?.role ?? null)
    }).catch(() => setAllowed(false))
  }, [])
  if (allowed === null) return null
  if (!allowed) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-slate-400 text-sm">Bạn không có quyền truy cập trang này.</p>
    </div>
  )
  return <Suspense><MyMetricsInner canConfigLark={role === "admin" || role === "creator"} /></Suspense>
}
