"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Search, RefreshCw, Globe, Package, Wallet, Terminal, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface BCProduct {
  sku_id: string; name: string; type: string; days: string | null
  capacity_kb: string | null; high_flow_size_kb: string | null
  hotspot_support: string | null; plan_type: string | null
  description: string | null; countries: { mcc: string; name: string }[] | null
  synced_at: string
}
interface BCPrice { sku_id: string; copies: string; retail_price: number; settlement_price: number }
interface BCBalance { balance: number; synced_at: string }
interface BCCountry { mcc: string; continent: string; name: string; url: string | null }
interface SyncLog { changes: Record<string, unknown> | null; error: string | null; synced_at: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PRODUCT_TYPES: Record<string, string> = {
  "110": "Self-select plan", "111": "Fixed plan",
  "210": "SIM (single)", "211": "SIM (multi)", "212": "Hard SIM",
  "220": "MIFI sale", "221": "MIFI lease", "230": "eSIM",
  "311": "Hard SIM + data", "3101": "SIM + self-select", "3102": "SIM + fixed",
  "3103": "Multi-SIM + self-select", "3104": "Multi-SIM + fixed",
  "3105": "eSIM + self-select", "3106": "eSIM + fixed",
  "3201": "MIFI + self-select", "3202": "MIFI + fixed",
  "3211": "MIFI lease + self-select", "3212": "MIFI lease + fixed",
}

function fmtMB(kb: string | null): string {
  if (!kb || kb === "" || kb === "0") return "—"
  const mb = parseFloat(kb) / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })
}

// ─── Tab components ───────────────────────────────────────────────────────────
function CatalogTab({ products, prices }: { products: BCProduct[]; prices: BCPrice[] }) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const priceMap = new Map<string, BCPrice[]>()
  for (const p of prices) {
    if (!priceMap.has(p.sku_id)) priceMap.set(p.sku_id, [])
    priceMap.get(p.sku_id)!.push(p)
  }

  const types = [...new Set(products.map(p => p.type))].sort()
  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const match = !q || p.name.toLowerCase().includes(q) || p.sku_id.includes(q)
    const tMatch = !typeFilter || p.type === typeFilter
    return match && tMatch
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc SKU ID..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tất cả loại</option>
          {types.map(t => <option key={t} value={t}>{PRODUCT_TYPES[t] ?? t}</option>)}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtered.length} / {products.length} sản phẩm</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">SKU ID</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tên</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Loại</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Ngày</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data/ngày</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Quốc gia</th>
              <th className="px-3 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wide">Giá gốc (copies=1)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(p => {
              const pList = priceMap.get(p.sku_id) ?? []
              const base  = pList.find(x => x.copies === "1") ?? pList[0]
              const isExp = expanded === p.sku_id
              return (
                <React.Fragment key={p.sku_id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.sku_id}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-48">{p.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                        {PRODUCT_TYPES[p.type] ?? p.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{p.days ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtMB(p.high_flow_size_kb)}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {(p.countries ?? []).slice(0, 3).map(c => c.mcc).join(", ")}
                      {(p.countries ?? []).length > 3 && ` +${(p.countries ?? []).length - 3}`}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {base ? (
                        <span>{base.settlement_price} <span className="text-xs text-gray-400">(retail {base.retail_price})</span></span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {(pList.length > 0 || (p.countries ?? []).length > 0) && (
                        <button onClick={() => setExpanded(isExp ? null : p.sku_id)} className="text-gray-400 hover:text-gray-600">
                          {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExp && (
                    <tr className="bg-blue-50/30">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {pList.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-600 mb-1">Bảng giá (theo số lượng copies):</p>
                              <table className="text-xs">
                                <thead><tr className="text-gray-500"><th className="pr-4">Copies</th><th className="pr-4">Retail</th><th>Settlement</th></tr></thead>
                                <tbody>
                                  {pList.sort((a, b) => parseInt(a.copies) - parseInt(b.copies)).map(px => (
                                    <tr key={px.copies}>
                                      <td className="pr-4">{px.copies}</td>
                                      <td className="pr-4">{px.retail_price}</td>
                                      <td className="font-medium text-blue-700">{px.settlement_price}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {(p.countries ?? []).length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-600 mb-1">Quốc gia áp dụng:</p>
                              <div className="flex flex-wrap gap-1">
                                {(p.countries ?? []).map((c) => (
                                  <span key={c.mcc} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">{c.mcc} {c.name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {p.description && <p className="mt-2 text-xs text-gray-500 italic">{p.description}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">Không có sản phẩm</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BalanceTab({ balance, syncLog }: { balance: BCBalance[]; syncLog: SyncLog[] }) {
  const latest = balance[0]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
          <p className="text-blue-100 text-sm font-medium">Số dư tài khoản BC</p>
          <p className="text-3xl font-bold mt-1">{latest ? Number(latest.balance).toLocaleString("vi-VN", { minimumFractionDigits: 2 }) : "—"}</p>
          <p className="text-blue-200 text-xs mt-1">{latest ? `Cập nhật: ${fmtTime(latest.synced_at)}` : "Chưa sync"}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-gray-500 text-sm font-medium">Lịch sử số dư (30 lần gần nhất)</p>
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {balance.map((b, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500 text-xs">{fmtTime(b.synced_at)}</span>
                <span className="font-medium text-gray-700">{Number(b.balance).toLocaleString("vi-VN", { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            {balance.length === 0 && <p className="text-sm text-gray-400">Chưa có dữ liệu</p>}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Lịch sử sync gần nhất</p>
        <div className="space-y-2">
          {syncLog.map((s, i) => {
            const ch = s.changes as Record<string, { added?: string[]; removed?: string[]; modified?: string[]; changed?: string[] }> | null
            const hasChange = ch && (
              (ch.products?.added?.length ?? 0) + (ch.products?.removed?.length ?? 0) +
              (ch.products?.modified?.length ?? 0) + (ch.prices?.changed?.length ?? 0) +
              (ch.countries?.added?.length ?? 0) + (ch.countries?.removed?.length ?? 0) > 0
            )
            return (
              <div key={i} className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                {s.error ? <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  : hasChange ? <AlertCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  : <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-gray-500 text-xs">{fmtTime(s.synced_at)}</span>
                  {s.error && <p className="text-red-600 text-xs mt-0.5">{s.error}</p>}
                  {hasChange && ch && (
                    <p className="text-gray-600 text-xs mt-0.5">
                      {(ch.products?.added?.length ?? 0) > 0 && `+${ch.products!.added!.length} sản phẩm `}
                      {(ch.products?.removed?.length ?? 0) > 0 && `-${ch.products!.removed!.length} sản phẩm `}
                      {(ch.products?.modified?.length ?? 0) > 0 && `~${ch.products!.modified!.length} đổi `}
                      {(ch.prices?.changed?.length ?? 0) > 0 && `${ch.prices!.changed!.length} giá thay đổi`}
                    </p>
                  )}
                  {!s.error && !hasChange && <p className="text-gray-400 text-xs mt-0.5">Không có thay đổi</p>}
                </div>
              </div>
            )
          })}
          {syncLog.length === 0 && <p className="text-sm text-gray-400 px-3">Chưa sync lần nào</p>}
        </div>
      </div>
    </div>
  )
}

function CountriesTab({ countries }: { countries: BCCountry[] }) {
  const [search, setSearch] = useState("")
  const byContinent = countries
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.mcc.toLowerCase().includes(search.toLowerCase()))
    .reduce<Record<string, BCCountry[]>>((acc, c) => {
      ;(acc[c.continent] ??= []).push(c)
      return acc
    }, {})

  return (
    <div className="space-y-3">
      <div className="relative w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm quốc gia..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <p className="text-xs text-gray-400">{countries.length} quốc gia / vùng lãnh thổ BC hỗ trợ</p>
      {Object.entries(byContinent).sort().map(([continent, list]) => (
        <div key={continent}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{continent || "Other"} ({list.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {list.map(c => (
              <div key={c.mcc} className="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg text-xs hover:bg-gray-100 transition-colors">
                {c.url && <img src={c.url} alt="" className="w-4 h-3 object-cover rounded-sm" onError={e => (e.currentTarget.style.display = "none")} />}
                <span className="font-mono text-gray-500">{c.mcc}</span>
                <span className="text-gray-700">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {Object.keys(byContinent).length === 0 && (
        <p className="text-sm text-gray-400">Không tìm thấy quốc gia</p>
      )}
    </div>
  )
}

// ─── Query Tab ────────────────────────────────────────────────────────────────
type QueryType = "F011" | "F012" | "F023" | "F046" | "F042"

interface QueryForm {
  channelOrderId?: string; iccid?: string; orderId?: string
  beginDate?: string; endDate?: string; eid?: string
}

function QueryTab() {
  const [qType, setQType]   = useState<QueryType>("F011")
  const [form, setForm]     = useState<QueryForm>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<object | null>(null)
  const [error, setError]   = useState("")

  const QUERIES: { type: QueryType; label: string; fields: { key: keyof QueryForm; label: string; placeholder: string; required?: boolean }[] }[] = [
    {
      type: "F011", label: "Thông tin đơn hàng (F011)",
      fields: [{ key: "channelOrderId", label: "Channel Order ID", placeholder: "Mã đơn hàng phía GoHub", required: true }],
    },
    {
      type: "F012", label: "Mức dùng data plan (F012)",
      fields: [
        { key: "iccid", label: "ICCID", placeholder: "Số ICCID thẻ SIM", required: true },
        { key: "channelOrderId", label: "Channel Order ID (tùy chọn)", placeholder: "" },
      ],
    },
    {
      type: "F023", label: "Daily flow từng ngày (F023)",
      fields: [
        { key: "iccid", label: "ICCID", placeholder: "Số ICCID thẻ SIM", required: true },
        { key: "beginDate", label: "Từ ngày (YYYY-MM-DD)", placeholder: "2026-08-01", required: true },
        { key: "endDate", label: "Đến ngày (YYYY-MM-DD)", placeholder: "2026-08-14", required: true },
      ],
    },
    {
      type: "F046", label: "Mức dùng data plan V2 (F046)",
      fields: [
        { key: "iccid", label: "ICCID", placeholder: "Số ICCID thẻ SIM", required: true },
        { key: "channelOrderId", label: "Channel Order ID (tùy chọn)", placeholder: "" },
        { key: "orderId", label: "BC Order ID (tùy chọn)", placeholder: "" },
      ],
    },
    {
      type: "F042", label: "Trạng thái eSIM profile (F042)",
      fields: [
        { key: "iccid", label: "ICCID", placeholder: "Số ICCID" },
        { key: "eid", label: "EID (tùy chọn)", placeholder: "" },
      ],
    },
  ]

  const current = QUERIES.find(q => q.type === qType)!

  async function runQuery() {
    const tradeData: Record<string, string> = {}
    for (const f of current.fields) {
      if (form[f.key]) tradeData[f.key] = form[f.key]!
    }
    setLoading(true); setResult(null); setError("")
    try {
      const res = await fetch("/api/bc/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeType: qType, tradeData }),
      })
      const data = await res.json() as object
      if (!res.ok) { setError((data as { error?: string }).error ?? "Lỗi không xác định"); return }
      setResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap border-b border-gray-100 pb-3">
        {QUERIES.map(q => (
          <button
            key={q.type}
            onClick={() => { setQType(q.type); setForm({}); setResult(null); setError("") }}
            className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              qType === q.type ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          >
            {q.type}
          </button>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">{current.label}</p>
        <div className="space-y-2 max-w-md">
          {current.fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-0.5">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</label>
              <input
                value={form[f.key] ?? ""}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <button
            onClick={runQuery}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
            Query BC API
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <XCircle size={15} className="mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Kết quả</p>
          <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-auto max-h-96 font-mono">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
type Tab = "catalog" | "balance" | "countries" | "query"

export default function BCDatapoolPage() {
  const [tab, setTab]         = useState<Tab>("catalog")
  const [products, setProducts] = useState<BCProduct[]>([])
  const [prices, setPrices]     = useState<BCPrice[]>([])
  const [balance, setBalance]   = useState<BCBalance[]>([])
  const [countries, setCountries] = useState<BCCountry[]>([])
  const [syncLog, setSyncLog]   = useState<SyncLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState("")
  const [lastLoad, setLastLoad] = useState("")

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/bc/data")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setProducts(d.products ?? [])
      setPrices(d.prices ?? [])
      setBalance(d.balance ?? [])
      setCountries(d.countries ?? [])
      setSyncLog(d.syncLog ?? [])
      setLastLoad(new Date().toLocaleTimeString("vi-VN"))
    } catch (e) {
      console.error("BC data load error:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function triggerSync() {
    setSyncing(true)
    setSyncError("")
    try {
      const res = await fetch("/api/cron/bc-sync", { method: "POST" })
      const json = await res.json() as { ok?: boolean; error?: string; changes?: unknown }
      if (!res.ok || !json.ok) {
        setSyncError(json.error ?? `HTTP ${res.status}`)
      } else {
        await loadData()
      }
    } catch (e) {
      setSyncError((e as Error).message)
    }
    setSyncing(false)
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "catalog",   label: "Catalog",   icon: Package,  badge: products.length },
    { id: "balance",   label: "Số dư",     icon: Wallet                           },
    { id: "countries", label: "Quốc gia",  icon: Globe,    badge: countries.length },
    { id: "query",     label: "Tra cứu",   icon: Terminal                         },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">BC Datapool</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Billion Connect — catalog sản phẩm, số dư tài khoản, tra cứu đơn / SIM
            {lastLoad && <span className="ml-2 text-gray-400">· Tải lúc {lastLoad}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            Làm mới
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
            Sync ngay
          </button>
        </div>
      </div>

      {syncError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          <XCircle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
          <span><span className="font-medium">Sync lỗi:</span> {syncError}</span>
        </div>
      )}

      {/* Balance banner */}
      {balance[0] && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
          <Wallet size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-sm text-blue-800">
            <span className="font-semibold">Số dư BC:</span>{" "}
            <span className="font-bold text-blue-700 text-base">{Number(balance[0].balance).toLocaleString("vi-VN", { minimumFractionDigits: 2 })}</span>
            <span className="text-blue-500 ml-2">· Cập nhật {fmtTime(balance[0].synced_at)}</span>
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
            )}
          >
            <t.icon size={14} />
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-normal">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400 text-sm">Đang tải dữ liệu...</span>
        </div>
      ) : (
        <div>
          {tab === "catalog"   && <CatalogTab products={products} prices={prices} />}
          {tab === "balance"   && <BalanceTab balance={balance} syncLog={syncLog} />}
          {tab === "countries" && <CountriesTab countries={countries} />}
          {tab === "query"     && <QueryTab />}
        </div>
      )}
    </div>
  )
}
