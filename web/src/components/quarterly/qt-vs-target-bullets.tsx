// Đề xuất redesign (Hiếu duyệt qua mockup) — thay "Tổng hợp cả Quý — So sánh với Target" (bảng 12 cột +
// 2 hàng Target lồng bên trong) bằng bullet-chart: 1 thanh/segment, đậm = actual, nhạt = pro-rata, vạch =
// target. Dùng ĐÚNG số đã tính sẵn ở quarterly/page.tsx (actRev/prRev/target/cm1...) — không tính lại gì.
import { cn } from "@/lib/utils"
import { fc, pct } from "@/lib/quarterly-format"

function clampPct(v: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.max((v / target) * 100, 0), 100)
}

function Bullet({ metricLabel, act, pr, target, revStyle }: {
  metricLabel: string; act: number; pr: number; target: number; revStyle?: boolean
}) {
  const actPct = target > 0 ? (act / target) * 100 : 0
  const prPct  = target > 0 ? (pr  / target) * 100 : 0
  const badgeCls = actPct >= 100 ? "text-emerald-600" : actPct >= 75 ? "text-[#0f4c81]" : "text-red-500"
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-bold text-slate-700">{metricLabel}</span>
        <span className={cn("text-[12px] font-bold tabular-nums", badgeCls)}>
          PR {pct(prPct)} · TT {pct(actPct)}
        </span>
      </div>
      <div className="relative h-5 bg-slate-100 rounded-md overflow-visible">
        <div className={cn("absolute inset-y-0 left-0 rounded-md", revStyle ? "bg-sky-200" : "bg-blue-100")}
          style={{ width: `${clampPct(pr, target)}%` }} />
        <div className={cn("absolute inset-y-1 left-0 rounded", revStyle ? "bg-sky-600" : "bg-[#0f4c81]")}
          style={{ width: `${clampPct(act, target)}%` }} />
        {target > 0 && <div className="absolute -top-1 -bottom-1 w-[2px] bg-slate-800 rounded" style={{ left: "100%" }} title={`Target: ${fc(target)}`} />}
      </div>
      <div className="flex justify-between text-[10.5px] text-slate-400 mt-1 tabular-nums">
        <span>Actual <b className="text-slate-600">{fc(act)}</b></span>
        <span>Pro-rata <b className="text-slate-600">{fc(pr)}</b></span>
        <span>Target <b className="text-slate-600">{target > 0 ? fc(target) : "—"}</b></span>
      </div>
    </div>
  )
}

export function QtVsTargetPanel({ label, actRev, prRev, targetRev, cm1Act, cm1Pr, cm1Target, qoqPct }: {
  label: string
  actRev: number; prRev: number; targetRev: number
  cm1Act: number; cm1Pr: number; cm1Target: number
  qoqPct: number | null
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[13px] font-bold text-slate-800">{label}</h3>
        {qoqPct != null && (
          <span className={cn("text-[11px] font-bold tabular-nums", qoqPct >= 0 ? "text-emerald-600" : "text-red-500")}>
            QoQ {qoqPct >= 0 ? "+" : ""}{qoqPct.toFixed(1)}%
          </span>
        )}
      </div>
      <Bullet metricLabel="Revenue" act={actRev} pr={prRev} target={targetRev} revStyle />
      <Bullet metricLabel="CM1" act={cm1Act} pr={cm1Pr} target={cm1Target} />
    </div>
  )
}
