"use client"

// Tồn kho thời gian thực — nguồn fact_inventory (Sapo sync, gohub_dw). Thay thế cách cũ OPS phải tự copy
// 1 tab Lark mới mỗi vài ngày để lưu lịch sử (xem docs/wiki/system/tabs/analytics-fulfillment.md) — snapshot
// theo NGÀY đã có sẵn trong DB nên trend vẽ trực tiếp từ query, không cần copy tay.
import { useEffect, useMemo, useState } from "react"
import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { Package, AlertTriangle, Clock, Warehouse, ChevronRight, ChevronDown, Search, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, CHART_PALETTE, CHART_GRID_COLOR, chartTooltipStyle, type MetricAccent } from "@/components/dashboard-kit"

type AlertLevel = "critical" | "warning" | "ok" | "none"

interface WarehouseQty { code: string; name: string; type: string; quantity: number; expiredDate: string | null }
interface StockSku {
  sku: string; vendor: string | null; productName: string | null; category: string | null
  totalQty: number; warehouses: WarehouseQty[]
  nearestExpiry: string | null; daysToExpiry: number | null
  velocityPerDay: number; daysOfCover: number | null
  alert: AlertLevel
}
interface StockResponse {
  asOfDate: string | null; skus: StockSku[]; trend: { date: string; totalQty: number }[]
  warehouses: { code: string; name: string; type: string }[]
}

const n0 = (v: number) => Math.round(v).toLocaleString("vi-VN")
const fmtDate = (ymd: string | null) => {
  if (!ymd) return "—"
  const [y, m, d] = ymd.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}
const fmtDayLabel = (ymd: string) => { const [, m, d] = ymd.split("-"); return `${d}/${m}` }

const ALERT_CFG: Record<AlertLevel, { cls: string; label: string }> = {
  critical: { cls: "bg-red-100 text-red-700", label: "Nguy hiểm" },
  warning: { cls: "bg-amber-100 text-amber-700", label: "Cần chú ý" },
  ok: { cls: "bg-emerald-100 text-emerald-700", label: "Ổn định" },
  none: { cls: "bg-slate-100 text-slate-400", label: "—" },
}
function AlertBadge({ level }: { level: AlertLevel }) {
  const c = ALERT_CFG[level]
  return <span className={cn("inline-flex text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap", c.cls)}>{c.label}</span>
}

export function InventoryStockView() {
  const [data, setData] = useState<StockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<AlertLevel | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/analytics/inventory-stock")
      setData(r.ok ? await r.json() : null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    let rows = data.skus
    if (filter) rows = rows.filter(s => s.alert === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(s => s.sku.toLowerCase().includes(q) || (s.vendor ?? "").toLowerCase().includes(q) || (s.productName ?? "").toLowerCase().includes(q))
    }
    return rows
  }, [data, filter, search])

  const counts = useMemo(() => {
    const c: Record<AlertLevel, number> = { critical: 0, warning: 0, ok: 0, none: 0 }
    data?.skus.forEach(s => { c[s.alert]++ })
    return c
  }, [data])

  const nearExpiryCount = useMemo(() => data?.skus.filter(s => s.daysToExpiry != null && s.daysToExpiry < 30).length ?? 0, [data])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
      <RefreshCw className="w-5 h-5 animate-spin" />Đang tải tồn kho…
    </div>
  )
  if (!data || data.skus.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
      Chưa có dữ liệu tồn kho (fact_inventory) — kiểm tra ETL sync Sapo.
    </div>
  )

  const tiles: { label: string; value: string; accent: MetricAccent; icon: React.ReactNode }[] = [
    { label: "SKU theo dõi", value: n0(data.skus.length), accent: "neutral", icon: <Package className="w-5 h-5" /> },
    { label: "SKU nguy hiểm", value: n0(counts.critical), accent: "warn", icon: <AlertTriangle className="w-5 h-5" /> },
    { label: "Sắp hết hạn (<30 ngày)", value: n0(nearExpiryCount), accent: "cost", icon: <Clock className="w-5 h-5" /> },
    { label: "Kho đang có hàng", value: n0(data.warehouses.length), accent: "positive", icon: <Warehouse className="w-5 h-5" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500 font-bold">
          Dữ liệu tồn kho thật (Sapo sync){data.asOfDate && <> · cập nhật {fmtDate(data.asOfDate)}</>}
        </p>
        <button onClick={load} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800">
          <RefreshCw className="w-3 h-3" />Tải lại
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(t => <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} />)}
      </div>

      {data.trend.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tổng tồn kho theo ngày (mọi SKU × mọi kho)</p>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend.map(t => ({ name: fmtDayLabel(t.date), qty: t.totalQty }))}>
                <defs>
                  <linearGradient id="invTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_PALETTE[0]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_PALETTE[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => n0(v)} width={56} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => n0(v)} />
                <Area type="monotone" dataKey="qty" stroke={CHART_PALETTE[0]} strokeWidth={2} fill="url(#invTrend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {(["critical", "warning", "ok"] as AlertLevel[]).map(lv => counts[lv] > 0 && (
            <button key={lv} onClick={() => setFilter(filter === lv ? null : lv)}
              className={cn("text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all",
                filter === lv ? ALERT_CFG[lv].cls + " border-transparent" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}>
              {ALERT_CFG[lv].label} ({counts[lv]})
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm SKU, vendor..."
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                {["", "SKU", "Sản phẩm / Vendor", "Tồn kho", "Tốc độ bán/ngày", "Ước tính hết hàng", "Hạn dùng gần nhất", "Cảnh báo"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không tìm thấy SKU khớp</td></tr>
              )}
              {filtered.map(s => {
                const isOpen = expanded === s.sku
                return (
                  <>
                    <tr key={s.sku} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(isOpen ? null : s.sku)}>
                      <td className="px-3 py-2.5 text-center">{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mx-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mx-auto" />}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap">{s.sku}</td>
                      <td className="px-3 py-2.5 text-center text-slate-600 max-w-[220px] truncate">{s.productName || s.category || "—"} <span className="text-slate-400">· {s.vendor || "—"}</span></td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 text-center whitespace-nowrap">{n0(s.totalQty)}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-center whitespace-nowrap">{s.velocityPerDay > 0 ? n0(s.velocityPerDay) : "—"}</td>
                      <td className={cn("px-3 py-2.5 text-center font-bold whitespace-nowrap", s.daysOfCover != null && s.daysOfCover < 7 ? "text-red-600" : s.daysOfCover != null && s.daysOfCover < 14 ? "text-amber-600" : "text-slate-600")}>
                        {s.daysOfCover != null ? `${n0(s.daysOfCover)} ngày` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {s.nearestExpiry ? (
                          <span className={cn("font-bold", s.daysToExpiry != null && s.daysToExpiry < 14 ? "text-red-600" : s.daysToExpiry != null && s.daysToExpiry < 30 ? "text-amber-600" : "text-slate-500")}>
                            {fmtDate(s.nearestExpiry)}{s.daysToExpiry != null && <span className="block text-[10px] font-normal">còn {n0(s.daysToExpiry)} ngày</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center"><AlertBadge level={s.alert} /></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div className="bg-slate-50 border-t border-b border-slate-200 px-4 py-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Chi tiết theo kho</p>
                            <table className="text-[11px] border-collapse w-full max-w-xl">
                              <thead>
                                <tr className="text-slate-400">
                                  <th className="text-center font-bold uppercase px-2 py-1">Kho</th>
                                  <th className="text-center font-bold uppercase px-2 py-1">Tồn kho</th>
                                  <th className="text-center font-bold uppercase px-2 py-1">% tổng</th>
                                  <th className="text-center font-bold uppercase px-2 py-1">Hạn dùng</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.warehouses.map(w => (
                                  <tr key={w.code} className="border-t border-slate-200 bg-white">
                                    <td className="px-2 py-1.5 text-center font-bold text-slate-700">{w.name}</td>
                                    <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{n0(w.quantity)}</td>
                                    <td className="px-2 py-1.5 text-center text-slate-400">{s.totalQty > 0 ? `${Math.round(w.quantity / s.totalQty * 100)}%` : "—"}</td>
                                    <td className="px-2 py-1.5 text-center text-slate-500">{fmtDate(w.expiredDate)}</td>
                                  </tr>
                                ))}
                                {s.warehouses.length === 0 && (
                                  <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400 italic">Không còn tồn ở kho nào</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
