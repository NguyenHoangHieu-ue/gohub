"use client"

import React, { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/dashboard-kit"
import { formatCurrency, formatCompactNumber, formatDateTime } from "@/lib/analytics-formatters"

const chartLoading = () => <div className="h-full w-full animate-pulse bg-slate-100 rounded-xl" />
const RevenueSparkline = dynamic(() => import("./data-health-charts").then(m => m.RevenueSparkline), { ssr: false, loading: chartLoading })

// Creator-only: tab "Giám sát Dữ liệu" — quan sát/kiểm tra dữ liệu bằng mắt (freshness/anomaly/cross-check),
// không cần Hiếu tự viết SQL hay nhờ Claude vào DB check mỗi lần nghi ngờ số liệu (yêu cầu Hiếu 2026-09-16).
export default function DataHealthPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [freshRole, setFreshRole] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setFreshRole(d?.role ?? session?.user?.role ?? "staff")
    }).catch(() => setFreshRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (!freshRole) return
    if (freshRole !== "creator") router.push("/chatbot")
  }, [freshRole, router])

  if (status !== "authenticated" || !freshRole) return null
  if (freshRole !== "creator") return null
  return <DataHealth />
}

type Tab = "freshness" | "anomaly" | "crosscheck"

function DataHealth() {
  const [tab, setTab] = useState<Tab>("freshness")

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
          <Gauge className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Giám sát Dữ liệu</h1>
          <p className="text-sm text-slate-500">Quan sát/kiểm tra dữ liệu bằng mắt — không cần viết SQL. Chỉ Creator.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {([
          ["freshness", "Độ tươi"],
          ["anomaly", "Bất thường"],
          ["crosscheck", "Đối chiếu"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
            )}>
            {label}
          </button>
        ))}
      </div>

      {tab === "freshness" && <FreshnessTab />}
      {tab === "anomaly" && <AnomalyTab />}
      {tab === "crosscheck" && <CrossCheckTab />}
    </div>
  )
}

// ─── Khối 1 — Độ tươi dữ liệu ────────────────────────────────────────────────

interface FreshnessItem {
  key: string; label: string; category: string; relatedTab?: string
  rows: number; latest: string | null; lastLoaded: string | null; delayHours: number | null
  status: "green" | "yellow" | "red" | "unknown"; error?: string
}

const STATUS_STYLE: Record<FreshnessItem["status"], { dot: string; ring: string; text: string; Icon: any }> = {
  green:   { dot: "bg-emerald-500", ring: "ring-emerald-100", text: "text-emerald-700", Icon: CheckCircle2 },
  yellow:  { dot: "bg-amber-500",   ring: "ring-amber-100",   text: "text-amber-700",   Icon: AlertTriangle },
  red:     { dot: "bg-rose-500",    ring: "ring-rose-100",    text: "text-rose-700",    Icon: AlertTriangle },
  unknown: { dot: "bg-slate-300",   ring: "ring-slate-100",   text: "text-slate-500",   Icon: HelpCircle },
}

function fmtDelay(h: number | null): string {
  if (h == null) return "—"
  if (h < 48) return `${Math.round(h)} giờ trước`
  return `${Math.round(h / 24)} ngày trước`
}

function FreshnessTab() {
  const [items, setItems] = useState<FreshnessItem[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics/data-health/freshness")
      const json = await res.json()
      setItems(json.items ?? [])
      setCheckedAt(json.checkedAt ?? null)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = (items ?? []).reduce<Record<string, FreshnessItem[]>>((acc, it) => {
    (acc[it.category] ??= []).push(it)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {checkedAt ? `Kiểm tra lúc ${formatDateTime(checkedAt)}` : "Đang tải..."}
        </p>
        <button onClick={load} disabled={loading} aria-label="Làm mới"
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
        </button>
      </div>

      {!items && <div className="text-sm text-slate-400">Đang tải...</div>}

      {Object.entries(grouped).map(([category, list]) => (
        <div key={category}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{category}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map(it => {
              const st = STATUS_STYLE[it.status]
              return (
                <div key={it.key} className={cn("rounded-2xl border border-slate-200/70 bg-white p-4 ring-1", st.ring)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{it.label}</p>
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", st.dot)} />
                  </div>
                  {it.error ? (
                    <p className="mt-2 text-xs text-rose-600">{it.error}</p>
                  ) : (
                    <>
                      <p className={cn("mt-2 text-xs font-semibold", st.text)}>{fmtDelay(it.delayHours)}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Mới nhất: {it.latest ? formatDateTime(it.latest) : "—"}
                        {it.lastLoaded && ` · ETL: ${formatDateTime(it.lastLoaded)}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatCompactNumber(it.rows)} dòng</p>
                    </>
                  )}
                  {it.relatedTab && (
                    <a href={it.relatedTab} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700">
                      Xem tab liên quan <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Khối 2 — Bất thường số liệu ─────────────────────────────────────────────

function AnomalyTab() {
  const [series, setSeries] = useState<Record<string, any[]> | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics/data-health/anomalies?days=30")
      const json = await res.json()
      setSeries(json.series ?? {})
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Doanh thu 30 ngày gần nhất — chấm đỏ = lệch &gt;35% so trung bình 7 ngày liền trước.</p>
        <button onClick={load} disabled={loading} aria-label="Làm mới"
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
        </button>
      </div>

      {!series && <div className="text-sm text-slate-400">Đang tải...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {series && Object.entries(series).map(([label, data]) => {
          const anomalyCount = data.filter((d: any) => d.anomaly).length
          return (
            <div key={label} className="rounded-2xl border border-slate-200/70 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                {anomalyCount > 0 && (
                  <span className="text-[11px] font-semibold text-rose-600">{anomalyCount} ngày bất thường</span>
                )}
              </div>
              <div className="h-40">
                <RevenueSparkline data={data} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Khối 3 — Đối chiếu chéo ─────────────────────────────────────────────────

interface CrossCheckRow {
  month: string; field?: string; live?: number; snapshot?: number; diffPct?: number
  snapshotRefreshedAt?: string | null; status?: "ok" | "warn" | "bad"; error?: string
}

const CC_STATUS_CLS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700",
}

function CrossCheckTab() {
  const [rows, setRows] = useState<CrossCheckRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics/data-health/cross-check")
      const json = await res.json()
      setRows(json.results ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const dataRows = (rows ?? []).filter(r => !r.error)
  const errorRows = (rows ?? []).filter(r => r.error)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          So số LIVE (tính lại ngay) vs snapshot Bé Gấu/chatbot đang dùng (`analytics_monthly_kpis`) — lệch nhiều nghĩa là cron chưa chạy/lỗi.
        </p>
        <button onClick={load} disabled={loading} aria-label="Làm mới"
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
        </button>
      </div>

      {errorRows.map((r, i) => (
        <div key={i} className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <b>{r.month}</b>: {r.error}
        </div>
      ))}

      {!rows && <div className="text-sm text-slate-400">Đang tải...</div>}

      {rows && dataRows.length > 0 && (
        <DataTable<CrossCheckRow>
          rows={dataRows}
          rowKey={r => `${r.month}-${r.field}`}
          pageSize={20}
          columns={[
            { key: "month", label: "Tháng", render: r => r.month },
            { key: "field", label: "Chỉ số", render: r => r.field },
            { key: "live", label: "Live", align: "right", render: r => r.field?.includes("%") ? `${r.live}%` : formatCurrency(r.live ?? 0) },
            { key: "snapshot", label: "Snapshot", align: "right", render: r => r.field?.includes("%") ? `${r.snapshot}%` : formatCurrency(r.snapshot ?? 0) },
            { key: "diffPct", label: "Lệch", align: "right", render: r => `${(r.diffPct ?? 0) > 0 ? "+" : ""}${r.diffPct}${r.field?.includes("%") ? "đ" : "%"}` },
            {
              key: "status", label: "Trạng thái", align: "center",
              render: r => (
                <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", CC_STATUS_CLS[r.status ?? "ok"])}>
                  {r.status === "ok" ? "Khớp" : r.status === "warn" ? "Lệch nhẹ" : "Lệch nhiều"}
                </span>
              ),
            },
            { key: "snapshotRefreshedAt", label: "Snapshot cập nhật lúc", render: r => formatDateTime(r.snapshotRefreshedAt) },
          ]}
        />
      )}
    </div>
  )
}
