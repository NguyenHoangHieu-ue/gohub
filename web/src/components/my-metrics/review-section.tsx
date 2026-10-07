"use client"

// My Metrics › "Đánh giá hôm nay" (M4, s227): cùng nội dung Lark DM 8:30 (lib/okr-review*.ts) — KPI so mục tiêu + nhịp, việc
// kế hoạch chậm/quá hạn, cảnh báo thị trường/SKU, thread Lark chưa chốt, báo giá đang chờ.
import { useState, useEffect, useCallback } from "react"
import { ClipboardCheck, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DailyReview, KpiStatus } from "@/lib/okr-review"

const DOT: Record<KpiStatus, string> = { ok: "bg-emerald-500", watch: "bg-amber-400", behind: "bg-rose-500", no_data: "bg-slate-300" }

export function ReviewSection({ quarter, onOpenPlan }: { quarter: string; onOpenPlan: () => void }) {
  const [r, setR] = useState<DailyReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/analytics/my-metrics/review?quarter=${quarter}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      setR(d)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [quarter])
  useEffect(() => { load() }, [load])

  const issues = r ? r.kpis.filter(k => k.status === "behind" || k.status === "watch").length + r.plan.issues.length + r.alerts.length : 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 flex items-center gap-3">
        <ClipboardCheck className="w-4 h-4 text-brand-600" />
        <button onClick={() => setOpen(v => !v)} className="flex-1 text-left">
          <p className="text-sm font-black text-slate-800">Đánh giá hôm nay</p>
          <p className="text-[11px] text-slate-400">
            {r ? `Dữ liệu tới ${r.today} · ngày ${r.dayOfQuarter}/${r.quarterDays} của quý · ${issues ? `${issues} điểm cần chú ý` : "không có điểm nào đáng lo"} · gửi Lark DM 8:30 mỗi sáng`
              : loading ? "Đang tổng hợp…" : ""}
          </p>
        </button>
        <button onClick={load} aria-label="Làm mới" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
          <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
        </button>
        <button onClick={() => setOpen(v => !v)} aria-label={open ? "Thu gọn" : "Mở"} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
          {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
      </div>
      {err && <p className="px-5 pb-3 text-xs font-bold text-rose-600">Hiếu đang fix, vui lòng đợi ({err})</p>}
      {open && r && (
        <div className="px-5 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">KPI — điểm OKR hiện tại {r.score.toFixed(1)}%</p>
            <ul className="space-y-1">
              {r.kpis.map(k => (
                <li key={k.key} className="flex items-start gap-2 text-slate-700">
                  <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", DOT[k.status])} />{k.text}
                </li>
              ))}
            </ul>
            {r.targetNote && <p className="mt-1.5 text-[11px] text-amber-600">⚠ {r.targetNote}</p>}
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Kế hoạch quý</p>
              {r.plan.total === 0
                ? <p className="text-slate-500">Chưa có việc nào. <button onClick={onOpenPlan} className="text-brand-600 font-bold">Xem đề xuất của hệ thống →</button></p>
                : <>
                    <p className="text-slate-700">{r.plan.done}/{r.plan.total} việc đã xong{r.plan.issues.length ? `, ${r.plan.issues.length} việc chậm/quá hạn:` : " — các việc còn lại đúng tiến độ."}</p>
                    <ul className="mt-1 space-y-0.5">
                      {r.plan.issues.slice(0, 5).map((i, n) => <li key={n} className="text-slate-600">• <b className={i.status === "overdue" ? "text-rose-600" : "text-amber-600"}>{i.status === "overdue" ? "Quá hạn" : "Chậm"}</b>: {i.title}</li>)}
                    </ul>
                  </>}
            </div>
            {r.alerts.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Cảnh báo tự động</p>
                <ul className="space-y-0.5">{r.alerts.map((a, n) => <li key={n} className="text-slate-600">• {a}</li>)}</ul>
              </div>
            )}
            <div className="text-slate-600 space-y-0.5">
              {r.pendingQuotes ? <p>📥 {r.pendingQuotes} báo giá vendor đang chờ quyết.</p> : null}
              {r.lark.open ? <p>💬 {r.lark.open} thread Lark được tag tháng này chưa chốt{r.lark.yesNoTyping ? ` (${r.lark.yesNoTyping} đã YES, chưa Typing)` : ""}.</p> : <p>💬 Không còn thread Lark nào chưa chốt trong tháng.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
