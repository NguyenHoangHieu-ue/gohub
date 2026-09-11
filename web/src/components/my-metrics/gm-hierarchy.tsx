"use client"

// Hierarchy Vendor → Nước → Product Code → SKU dùng chung cho SKU Gross Margin + %Datapool Rev
// (s195+18-B) — "REV actual kỳ trước vs REV prorata kỳ này + Δ GM%" theo yêu cầu Hiếu, tự đề xuất
// thêm bảng AI giải thích (on-demand, không tự chạy mỗi lần tải trang).
import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { ChevronRight, Home, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/my-metrics/shared-ui"
import { fck, pct } from "@/lib/my-metrics-format"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"
import type { HierarchyMonthlyRow } from "@/lib/my-metrics-types"

const chartLoading = () => <div className="w-full h-full animate-pulse bg-white/10 rounded-xl" />
const RevCompareChart = dynamic(
  () => import("@/app/(dashboard)/analytics/my-metrics/my-metrics-charts").then(m => m.RevCompareChart),
  { ssr: false, loading: chartLoading },
)
const SkuMoversChart = dynamic(
  () => import("@/app/(dashboard)/analytics/my-metrics/my-metrics-charts").then(m => m.SkuMoversChart),
  { ssr: false, loading: chartLoading },
)

export interface HierarchyLeaf {
  sku: string; vendor: string | null; country: string | null; product_code: string
  rev_cur: number; gp_cur: number; rev_prev: number; gp_prev: number
}
interface HierarchyRow {
  key: string; label: string; count: number
  rev_cur: number; gp_cur: number; rev_prev: number; gp_prev: number
  gm_pct_cur: number; gm_pct_prev: number
}

const LEVELS = ["vendor", "country", "product_code", "sku"] as const
type Level = typeof LEVELS[number]
const LEVEL_LABEL: Record<Level, string> = { vendor: "Vendor", country: "Nước", product_code: "Product Code", sku: "SKU" }

function monthEndOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function groupBy(leaves: HierarchyLeaf[], level: Level): HierarchyRow[] {
  const map = new Map<string, HierarchyLeaf[]>()
  for (const l of leaves) {
    const key = level === "sku" ? l.sku : (l[level] || "(không rõ)")
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(l)
  }
  return Array.from(map.entries()).map(([key, group]) => {
    const rev_cur = group.reduce((a, g) => a + g.rev_cur, 0)
    const gp_cur = group.reduce((a, g) => a + g.gp_cur, 0)
    const rev_prev = group.reduce((a, g) => a + g.rev_prev, 0)
    const gp_prev = group.reduce((a, g) => a + g.gp_prev, 0)
    return {
      key, label: key, count: group.length, rev_cur, gp_cur, rev_prev, gp_prev,
      gm_pct_cur: rev_cur > 0 ? +(gp_cur / rev_cur * 100).toFixed(2) : 0,
      gm_pct_prev: rev_prev > 0 ? +(gp_prev / rev_prev * 100).toFixed(2) : 0,
    }
  }).sort((a, b) => b.rev_cur - a.rev_cur)
}

export function GmHierarchySection({
  scope, title, leaves, monthly, quarterLabel, prevQuarterLabel, curStart, curEnd,
}: {
  scope: "sku_gm" | "datapool"; title: string
  leaves: HierarchyLeaf[]; monthly: HierarchyMonthlyRow[]
  quarterLabel: string; prevQuarterLabel: string; curStart: string; curEnd: string
}) {
  const [mode, setMode] = useState<"quarter" | "month">("quarter")
  const [path, setPath] = useState<string[]>([])
  const [explanations, setExplanations] = useState<Record<string, string> | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainErr, setExplainErr] = useState<string | null>(null)

  const months = useMemo(() => Array.from(new Set(monthly.map(m => m.month))).sort(), [monthly])
  const curMonth = months.at(-1)
  const prevMonth = months.length > 1 ? months.at(-2) : undefined

  const normalizedLeaves = useMemo((): HierarchyLeaf[] => {
    if (mode === "quarter") return leaves
    if (!curMonth) return []
    const monthlyMap = new Map(monthly.map(m => [`${m.sku}|${m.month}`, m]))
    return leaves
      .map(l => {
        const cur = monthlyMap.get(`${l.sku}|${curMonth}`)
        const prev = prevMonth ? monthlyMap.get(`${l.sku}|${prevMonth}`) : undefined
        return { ...l, rev_cur: cur?.rev ?? 0, gp_cur: cur?.gp ?? 0, rev_prev: prev?.rev ?? 0, gp_prev: prev?.gp ?? 0 }
      })
      .filter(l => l.rev_cur > 0 || l.rev_prev > 0)
  }, [mode, leaves, monthly, curMonth, prevMonth])

  const factor = mode === "quarter"
    ? getProjectionFactor(curStart, curEnd)
    : curMonth ? getProjectionFactor(`${curMonth}-01`, monthEndOf(curMonth)) : 1

  const level: Level = LEVELS[Math.min(path.length, LEVELS.length - 1)]
  const filteredLeaves = normalizedLeaves.filter(l => path.every((val, i) => (l[LEVELS[i]] ?? "(không rõ)") === val))
  const rows: HierarchyRow[] = level === "sku"
    ? filteredLeaves.map(l => ({
        key: l.sku, label: l.sku, count: 1,
        rev_cur: l.rev_cur, gp_cur: l.gp_cur, rev_prev: l.rev_prev, gp_prev: l.gp_prev,
        gm_pct_cur: l.rev_cur > 0 ? +(l.gp_cur / l.rev_cur * 100).toFixed(2) : 0,
        gm_pct_prev: l.rev_prev > 0 ? +(l.gp_prev / l.rev_prev * 100).toFixed(2) : 0,
      })).sort((a, b) => b.rev_cur - a.rev_cur)
    : groupBy(filteredLeaves, level)

  const curLabel  = mode === "quarter" ? quarterLabel : (curMonth ?? "—")
  const prevLabel = mode === "quarter" ? prevQuarterLabel : (prevMonth ?? "—")
  const prorated = factor > 1.001

  const chartRows = rows.slice(0, 8).map(r => ({ label: r.label, rev_prev: r.rev_prev, rev_cur: r.rev_cur * factor }))
  const moversRows = [...rows]
    .filter(r => r.rev_cur > 0 || r.rev_prev > 0)
    .sort((a, b) => Math.abs(b.gm_pct_cur - b.gm_pct_prev) - Math.abs(a.gm_pct_cur - a.gm_pct_prev))
    .slice(0, 8)
    .map(r => ({ sku: r.label, delta: +(r.gm_pct_cur - r.gm_pct_prev).toFixed(2) }))

  const drillInto = (key: string) => { if (level !== "sku") { setPath(p => [...p, key]); setExplanations(null) } }
  const goTo = (i: number) => { setPath(p => p.slice(0, i)); setExplanations(null) }

  const runExplain = async () => {
    setExplaining(true); setExplainErr(null)
    try {
      const nodes = moversRows.map(m => {
        const src = rows.find(r => r.label === m.sku)!
        return { key: src.key, label: src.label, rev_cur: src.rev_cur * factor, rev_prev: src.rev_prev, gm_pct_cur: src.gm_pct_cur, gm_pct_prev: src.gm_pct_prev }
      })
      const r = await fetch("/api/analytics/my-metrics/explain-nodes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, quarter: quarterLabel, mode, level, path, nodes }),
      })
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? "Lỗi gọi AI") }
      const j = await r.json()
      const map: Record<string, string> = {}
      for (const e of j.explanations ?? []) map[e.key] = e.text
      setExplanations(map)
    } catch (e: any) { setExplainErr(e.message) }
    finally { setExplaining(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-sm font-black text-slate-800">{title}</span>
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(["quarter", "month"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setPath([]); setExplanations(null) }}
                className={cn("px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors",
                  mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {m === "quarter" ? "Quý" : "Tháng"}
              </button>
            ))}
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[11px] font-bold flex-wrap">
          <button onClick={() => goTo(0)} className="flex items-center gap-1 text-slate-500 hover:text-brand-600">
            <Home className="w-3 h-3" /> Tất cả
          </button>
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <button onClick={() => goTo(i + 1)} className={cn(i === path.length - 1 ? "text-brand-700" : "text-slate-500 hover:text-brand-600")}>
                {p}
              </button>
            </span>
          ))}
          <span className="text-slate-300 ml-1">· đang xem theo {LEVEL_LABEL[level]}</span>
        </div>
      </div>

      <div className="px-5 py-3 space-y-3">
        <DataTable<HierarchyRow>
          rows={rows}
          rowKey={r => r.key}
          emptyLabel="Không có dữ liệu."
          columns={[
            { key: "label", label: LEVEL_LABEL[level], render: r => (
              <button disabled={level === "sku"} onClick={() => drillInto(r.key)}
                className={cn("font-black text-left", level !== "sku" && "text-brand-700 hover:underline")}>
                {r.label} {r.count > 1 && <span className="text-slate-400 font-normal">({r.count} SKU)</span>}
              </button>
            ) },
            { key: "rev_prev", label: `Rev ${prevLabel}`, align: "right", render: r => fck(r.rev_prev) },
            { key: "rev_cur", label: `Rev ${curLabel}${prorated ? " (prorata)" : ""}`, align: "right", render: r => fck(r.rev_cur * factor) },
            { key: "rev_delta", label: "Δ Rev%", align: "right", render: r => {
              if (r.rev_prev <= 0) return <span className="text-emerald-600 font-black">Mới</span>
              const d = ((r.rev_cur * factor - r.rev_prev) / r.rev_prev) * 100
              return <span className={cn("font-black", d >= 0 ? "text-emerald-600" : "text-amber-600")}>{d >= 0 ? "+" : ""}{d.toFixed(1)}%</span>
            } },
            { key: "gm_prev", label: `GM% ${prevLabel}`, align: "right", render: r => r.rev_prev > 0 ? pct(r.gm_pct_prev) : "—" },
            { key: "gm_cur", label: `GM% ${curLabel}`, align: "right", render: r => r.rev_cur > 0 ? pct(r.gm_pct_cur) : "—" },
            { key: "gm_delta", label: "Δ GM%", align: "right", render: r => {
              if (r.rev_cur <= 0 || r.rev_prev <= 0) return <span className="text-slate-300">—</span>
              const d = r.gm_pct_cur - r.gm_pct_prev
              return <span className={cn("font-black", d >= 0 ? "text-emerald-600" : "text-amber-600")}>{d >= 0 ? "+" : ""}{d.toFixed(2)}%</span>
            } },
          ]}
        />

        {chartRows.length > 1 && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
              Rev {prevLabel} (actual) vs {curLabel} ({prorated ? "prorata" : "actual"}) — top {chartRows.length}
            </p>
            <div style={{ height: Math.max(160, chartRows.length * 34) }}>
              <RevCompareChart data={chartRows} prevLabel={prevLabel} curLabel={curLabel} />
            </div>
          </div>
        )}

        {moversRows.length > 1 && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Biến động GM% lớn nhất ở mức {LEVEL_LABEL[level]}</p>
            <div style={{ height: Math.max(160, moversRows.length * 34) }}>
              <SkuMoversChart data={moversRows} />
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <button onClick={runExplain} disabled={explaining || moversRows.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 disabled:opacity-40">
            {explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {explanations ? "Giải thích lại bằng AI" : "Giải thích biến động bằng AI"}
          </button>
          <p className="text-[10px] text-slate-400 mt-1">AI suy luận khả dĩ từ đúng số liệu đang xem (kênh/giá/mùa vụ/khuyến mãi...) — không phải kết luận chắc chắn, không tra thêm dữ liệu ngoài. Cache 12h.</p>
          {explainErr && <p className="text-[11px] text-red-600 font-bold mt-1">{explainErr}</p>}
          {explanations && (
            <div className="mt-2 space-y-1.5">
              {moversRows.map(m => {
                const src = rows.find(r => r.label === m.sku)!
                const text = explanations[src.key]
                if (!text) return null
                return (
                  <div key={src.key} className="text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                    <span className="font-black text-slate-700">{src.label}: </span>
                    <span className="text-slate-600">{text}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
