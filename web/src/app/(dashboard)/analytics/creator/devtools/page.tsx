"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Terminal, Database, Send, RefreshCw, Search, ChevronLeft, ChevronRight, GitBranch } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataLineageMap } from "@/components/data-lineage-map"

// Creator-only: bộ công cụ kiểm thử API nội bộ + duyệt toàn bộ database Supabase.
export default function CreatorDevToolsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [freshRole, setFreshRole] = useState<string | null>(null)

  // Lấy role mới nhất từ DB + kiểm tra tab-visibility cho admin.
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setFreshRole(d?.role ?? session?.user?.role ?? "staff")
    }).catch(() => setFreshRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (!freshRole) return
    if (freshRole === "creator") return  // creator luôn được vào
    if (freshRole === "admin") {
      // Admin được vào nếu creator đã cấp quyền (api-database không ẩn trong config)
      fetch("/api/config/tab-visibility")
        .then(r => r.ok ? r.json() : {})
        .then(vis => {
          const adminHidden: string[] = (vis as Record<string, string[]>)["admin"] ?? ["api-database"]
          if (adminHidden.includes("api-database")) router.push("/chatbot")
        })
        .catch(() => router.push("/chatbot"))
      return
    }
    router.push("/chatbot")
  }, [freshRole, router])

  if (status !== "authenticated" || !freshRole) return null
  if (!["creator", "admin"].includes(freshRole)) return null
  return <DevTools />
}

function DevTools() {
  const [tab, setTab] = useState<"api" | "db" | "lineage">("api")

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
          <Crown className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Creator Dev Tools</h1>
          <p className="text-slate-500 text-sm">Kiểm thử API nội bộ và duyệt database Supabase. Chỉ Creator truy cập được.</p>
        </div>
      </div>

      <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm w-fit">
        <button onClick={() => setTab("api")} className={cn("flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md transition-all", tab === "api" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
          <Terminal className="w-4 h-4" />API Tester
        </button>
        <button onClick={() => setTab("db")} className={cn("flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md transition-all", tab === "db" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
          <Database className="w-4 h-4" />Database
        </button>
        <button onClick={() => setTab("lineage")} className={cn("flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md transition-all", tab === "lineage" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
          <GitBranch className="w-4 h-4" />Data Map
        </button>
      </div>

      {tab === "api" ? <ApiTester /> : tab === "db" ? <DbBrowser /> : <DataLineageMap />}
    </div>
  )
}

const QUICK_ENDPOINTS = [
  "/api/user/me",
  "/api/config/creator-status",
  "/api/config/tab-visibility",
  "/api/config/role-permissions",
  "/api/config/db/tables",
  "/api/analytics/kpis?startDate=2026-06-01&endDate=2026-06-30&dateColumn=fulfiled_date&companyCode=ALL",
  "/api/notifications",
]

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

function ApiTester() {
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET")
  const [path, setPath] = useState("/api/user/me")
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(false)
  const [resp, setResp] = useState<{ status: number; ok: boolean; ms: number; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [routes, setRoutes] = useState<string[]>([])
  const [routesLoading, setRoutesLoading] = useState(false)

  // Tự động lấy danh sách mọi API route (cập nhật khi thêm route mới) — bấm "Làm mới" để quét lại.
  const loadRoutes = useCallback(() => {
    setRoutesLoading(true)
    fetch("/api/config/api-routes").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.routes?.length) setRoutes(d.routes)
    }).catch(() => {}).finally(() => setRoutesLoading(false))
  }, [])
  useEffect(() => { loadRoutes() }, [loadRoutes])

  const send = async () => {
    setLoading(true); setErr(null); setResp(null)
    const t0 = performance.now()
    try {
      const hasBody = method !== "GET" && method !== "DELETE" && body.trim() !== ""
      if (hasBody) { try { JSON.parse(body) } catch { setErr("Body không phải JSON hợp lệ"); setLoading(false); return } }
      const res = await fetch(path, {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? body : undefined,
      })
      const ms = Math.round(performance.now() - t0)
      const raw = await res.text()
      let pretty = raw
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2) } catch { /* giữ raw nếu không phải JSON */ }
      setResp({ status: res.status, ok: res.ok, ms, text: pretty })
    } catch (e: any) {
      setErr(e.message || "Lỗi mạng")
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select value={method} onChange={e => setMethod(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none">
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") send() }}
            placeholder="/api/..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none"
          />
          <button onClick={send} disabled={loading} className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50 shrink-0">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Gửi
          </button>
        </div>

        {method !== "GET" && method !== "DELETE" && (
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder='Request body (JSON), ví dụ: {"key":"value"}'
            rows={5}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 outline-none"
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Endpoints ({routes.length || QUICK_ENDPOINTS.length})</p>
            <button onClick={loadRoutes} disabled={routesLoading} className="flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50">
              <RefreshCw className={cn("w-3 h-3", routesLoading && "animate-spin")} />Làm mới
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {(routes.length ? routes : QUICK_ENDPOINTS).map(ep => (
              <button key={ep} onClick={() => { setMethod("GET"); setPath(ep) }} className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700 transition-colors truncate max-w-full">
                {ep}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">{err}</div>}

      {resp && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4">
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold", resp.ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>{resp.status}</span>
            <span className="text-xs text-slate-400">{resp.ms} ms</span>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-700 overflow-x-auto max-h-[500px] whitespace-pre-wrap break-words">{resp.text}</pre>
        </div>
      )}
    </div>
  )
}

function DbBrowser() {
  const [source, setSource]           = useState<"supabase" | "turso">("supabase")
  const [tables, setTables]           = useState<string[]>([])
  const [filter, setFilter]           = useState("")
  const [selected, setSelected]       = useState<string | null>(null)
  const [tablesErr, setTablesErr]     = useState<string | null>(null)
  const [loadingTables, setLoadingTables] = useState(true)

  const loadTables = useCallback(() => {
    setLoadingTables(true); setTablesErr(null); setSelected(null)
    const url = source === "turso" ? "/api/config/db/turso-tables" : "/api/config/db/tables"
    fetch(url).then(async r => {
      const d = await r.json()
      if (!r.ok) { setTablesErr(d?.error || "Không tải được danh sách bảng"); return }
      setTables(d.tables || [])
    }).catch(e => setTablesErr(e.message)).finally(() => setLoadingTables(false))
  }, [source])
  useEffect(() => { loadTables() }, [loadTables])

  const filtered = tables.filter(t => t.toLowerCase().includes(filter.toLowerCase()))

  const sourceBtn = (s: "supabase" | "turso", label: string, color: string) => (
    <button onClick={() => setSource(s)}
      className={cn("px-3 py-1 text-[11px] font-bold rounded-md transition-all",
        source === s ? `${color} text-white shadow-sm` : "text-slate-500 hover:bg-slate-100")}>
      {label}
    </button>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[640px]">
        <div className="p-3 border-b border-slate-100 space-y-2">
          {/* Source selector */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {sourceBtn("supabase", "Supabase", "bg-emerald-500")}
            {sourceBtn("turso", "Turso", "bg-sky-500")}
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Tìm bảng..." className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] text-slate-400">{tables.length} bảng</p>
            <button onClick={loadTables} disabled={loadingTables} className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50">
              <RefreshCw className={cn("w-3 h-3", loadingTables && "animate-spin")} />Làm mới
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {loadingTables ? (
            <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 text-amber-500 animate-spin" /></div>
          ) : tablesErr ? (
            <p className="p-4 text-xs text-rose-600">{tablesErr}</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-xs text-slate-400 text-center italic">Không có bảng nào.</p>
          ) : (
            filtered.map(t => (
              <button key={t} onClick={() => setSelected(t)} className={cn("w-full text-left px-4 py-2 text-xs font-mono border-l-2 transition-colors truncate", selected === t ? "bg-amber-50 border-amber-500 text-amber-700 font-bold" : "border-transparent text-slate-600 hover:bg-slate-50")}>
                {t}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0">
        {selected
          ? <TableView name={selected} source={source} />
          : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center text-sm text-slate-400">
              Chọn 1 bảng bên trái để xem dữ liệu.
            </div>
          )}
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

function TableView({ name, source }: { name: string; source: "supabase" | "turso" }) {
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback((off: number) => {
    setLoading(true); setErr(null)
    const endpoint = source === "turso"
      ? `/api/config/db/turso-table?name=${encodeURIComponent(name)}&limit=${PAGE_SIZE}&offset=${off}`
      : `/api/config/db/table?name=${encodeURIComponent(name)}&limit=${PAGE_SIZE}&offset=${off}`
    fetch(endpoint).then(async r => {
      const d = await r.json()
      if (!r.ok) { setErr(d?.error || "Không tải được dữ liệu"); setRows([]); setColumns([]); return }
      setRows(d.rows || [])
      setColumns(d.columns || [])
      if (off === 0) setCount(d.count || 0)
    }).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [name, source])

  useEffect(() => { setOffset(0); load(0) }, [name, load])

  const goto = (off: number) => { setOffset(off); load(off) }
  const fmt = (v: any) => v === null ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className={cn("w-4 h-4", source === "turso" ? "text-sky-500" : "text-emerald-500")} />
          <span className="font-mono font-bold text-slate-800 text-sm">{name}</span>
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", source === "turso" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700")}>
            {source === "turso" ? "Turso" : "Supabase"}
          </span>
          <span className="text-xs text-slate-400">{count.toLocaleString()} dòng</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => goto(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs text-slate-500 tabular-nums">{count === 0 ? 0 : offset + 1} - {Math.min(offset + PAGE_SIZE, count)}</span>
          <button onClick={() => goto(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= count || loading} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 text-amber-500 animate-spin" /></div>
      ) : err ? (
        <p className="p-5 text-sm text-rose-600">{err}</p>
      ) : rows.length === 0 ? (
        <p className="p-16 text-center text-sm text-slate-400">Bảng rỗng.</p>
      ) : (
        <div className="overflow-x-auto max-h-[560px]">
          <table className="text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {columns.map(c => <th key={c} className="px-3 py-2 text-left font-bold text-slate-500 whitespace-nowrap border-b border-slate-100">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  {columns.map(c => (
                    <td key={c} className={cn("px-3 py-1.5 whitespace-nowrap max-w-[320px] truncate", row[c] === null ? "text-slate-300 italic" : "text-slate-700")} title={fmt(row[c])}>{fmt(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
