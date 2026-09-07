"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { Award, Users, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/my-metrics/shared-ui"
import { hhmm } from "@/lib/my-metrics-format"
import type { BegauInsightsData, QualityItem } from "@/lib/my-metrics-types"

const chartLoading = () => <div className="w-full h-full animate-pulse bg-white/10 rounded-xl" />
const TopUsersChart = dynamic(
  () => import("@/app/(dashboard)/analytics/my-metrics/my-metrics-charts").then(m => m.TopUsersChart),
  { ssr: false, loading: chartLoading },
)

// ─── Bé Gấu Insights — ai dùng nhiều, chủ đề hay hỏi, chấm điểm heuristic câu trả lời ─────────
export function BegauInsightsSection({ quarter }: { quarter: string }) {
  const [data, setData] = useState<BegauInsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [bucketFilter, setBucketFilter] = useState<"all" | "high" | "medium" | "low">("all")

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/begau-insights?quarter=${quarter}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [quarter])

  useEffect(() => { fetchData() }, [fetchData])

  const items = data?.quality.items ?? []
  const filteredItems = bucketFilter === "all" ? items : items.filter(i => i.bucket === bucketFilter)
  const maxKwCount = Math.max(1, ...(data?.topKeywords.map(k => k.count) ?? [1]))

  const bucketBadge = (b: "high" | "medium" | "low") => {
    const cls = b === "high" ? "bg-emerald-50 text-emerald-700" : b === "medium" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"
    const label = b === "high" ? "Tốt" : b === "medium" ? "Trung bình" : "Cần soát"
    return <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide", cls)}>{label}</span>
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Award className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-black text-slate-800">Bé Gấu Insights</span>
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto · heuristic</span>
      </div>

      {loading && <p className="text-xs text-slate-400 text-center py-4">Đang tải…</p>}

      {!loading && data && (
        <>
          {/* Top users + topics side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" /> Người dùng nhiều nhất</p>
              {data.topUsers.length > 0 ? (
                <div style={{ height: Math.max(120, data.topUsers.length * 30) }}>
                  <TopUsersChart data={data.topUsers} />
                </div>
              ) : <p className="text-[11px] text-slate-300 text-center py-4">Chưa có dữ liệu.</p>}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Chủ đề hay được hỏi</p>
              {data.topKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 content-start">
                  {data.topKeywords.map(k => {
                    const intensity = k.count / maxKwCount
                    return (
                      <span key={k.phrase}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg border border-brand-100"
                        style={{ background: `rgba(15,76,129,${0.05 + intensity * 0.15})`, color: "#0a3560" }}>
                        {k.phrase} <span className="opacity-50">· {k.count}</span>
                      </span>
                    )
                  })}
                </div>
              ) : <p className="text-[11px] text-slate-300 text-center py-4">Chưa có dữ liệu.</p>}
            </div>
          </div>

          {/* Quality summary */}
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Award className="w-3 h-3" /> Chất lượng câu trả lời (heuristic, điểm TB {data.quality.avgScore})</p>
              <div className="flex gap-1.5">
                {([["all", "Tất cả", items.length], ["high", "Tốt", data.quality.high], ["medium", "Trung bình", data.quality.medium], ["low", "Cần soát", data.quality.low]] as const).map(([key, label, n]) => (
                  <button key={key} onClick={() => setBucketFilter(key)}
                    className={cn("text-[10px] font-black px-2 py-1 rounded-lg transition-colors",
                      bucketFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                    {label} ({n})
                  </button>
                ))}
              </div>
            </div>
            <DataTable<QualityItem>
              rows={filteredItems}
              rowKey={r => String(r.id)}
              emptyLabel="Không có mục nào."
              columns={[
                { key: "user", label: "Người hỏi", render: r => <span className="font-bold">{r.user}</span> },
                { key: "time", label: "Thời gian", render: r => hhmm(r.created_at) },
                { key: "q", label: "Câu hỏi", render: r => <p className="text-slate-500 truncate max-w-[220px]">{r.user_message}</p> },
                { key: "a", label: "Trích trả lời", render: r => <p className="text-slate-500 truncate max-w-[220px]">{r.ai_response_preview}</p> },
                { key: "score", label: "Điểm", align: "right", render: r => <span className="font-black tabular-nums">{r.score}</span> },
                { key: "bucket", label: "Đánh giá", align: "center", render: r => bucketBadge(r.bucket) },
              ]}
            />
          </div>
        </>
      )}
    </div>
  )
}
