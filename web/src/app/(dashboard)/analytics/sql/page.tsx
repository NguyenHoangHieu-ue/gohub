"use client"

import { useState, useEffect } from "react"
import {
  Database, Play, Download, Search, ChevronRight, ChevronDown,
  Copy, Check, AlertCircle, Loader2, Table as TableIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportRawRows } from "@/lib/export-excel"
import { useRoleGuard } from "@/lib/use-role-guard"

interface TableInfo { tableName: string; columns: { columnName: string; dataType: string }[] }

export default function SqlExplorerPage() {
  // Role TƯƠI từ DB (JWT có thể stale) — khớp cách sidebar hiển thị tab.
  const { ready } = useRoleGuard(["admin", "creator", "bod"])
  if (!ready) return null

  return <SqlExplorer />
}

function SqlExplorer() {
  const [query, setQuery]   = useState("SELECT * FROM fact_fulfillment_revenue LIMIT 10;")
  const [results, setResults] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading]  = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [schema, setSchema]    = useState<TableInfo[]>([])
  const [expanded, setExpanded] = useState(new Set<string>())
  const [copied, setCopied]    = useState(false)
  const [schemaSearch, setSchemaSearch] = useState("")

  useEffect(() => {
    fetch("/api/admin/sql-schema")
      .then(r => r.ok ? r.json() : [])
      .then(setSchema)
      .catch(() => {})
  }, [])

  const run = async () => {
    if (!query.trim()) return
    setLoading(true); setFeedback(null)
    try {
      const res = await fetch("/api/admin/sql-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      const d = await res.json()
      if (!res.ok) { setFeedback({ ok: false, msg: d.error }); setResults([]); setColumns([]) }
      else if (d.rows?.length > 0) { setResults(d.rows); setColumns(Object.keys(d.rows[0])) }
      else { setResults([]); setColumns([]); setFeedback({ ok: true, msg: `${d.rowCount ?? 0} rows returned` }) }
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    // Xuất TẤT CẢ dòng kết quả query ra Excel (theo đúng thứ tự cột).
    const rows = results.map(r => {
      const obj: Record<string, unknown> = {}
      for (const c of columns) obj[c] = r[c] ?? ""
      return obj
    })
    exportRawRows(rows, `sql_export_${new Date().toISOString().split("T")[0]}`, "Query")
  }

  const copy = () => { navigator.clipboard.writeText(query); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const toggleTable = (t: string) => setExpanded(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })

  const filteredSchema = schema.filter(t =>
    t.tableName.toLowerCase().includes(schemaSearch.toLowerCase()) ||
    t.columns.some(c => c.columnName.toLowerCase().includes(schemaSearch.toLowerCase()))
  )

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">
      {/* Schema Sidebar */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-slate-800 mb-3 text-sm">
            <Database className="w-4 h-4 text-blue-600" />
            Schema Browser
            <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">PostgreSQL</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="Search tables / columns..."
              value={schemaSearch} onChange={e => setSchemaSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredSchema.map(t => (
            <div key={t.tableName} className="rounded-lg overflow-hidden">
              <button onClick={() => toggleTable(t.tableName)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left">
                {expanded.has(t.tableName)
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                <TableIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-700 truncate">{t.tableName}</span>
              </button>
              {expanded.has(t.tableName) && (
                <div className="ml-8 border-l border-slate-100 mb-1">
                  {t.columns.map(c => (
                    <div key={c.columnName}
                      className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50 cursor-default group"
                      onDoubleClick={() => setQuery(q => q + (q.endsWith("\n") || q === "" ? "" : "\n") + c.columnName)}>
                      <span className="truncate">{c.columnName}</span>
                      <span className="text-[9px] text-slate-300 font-mono italic ml-2 shrink-0">{c.dataType}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredSchema.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">Không tìm thấy bảng</div>
          )}
        </div>
      </div>

      {/* Editor + Results */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Editor */}
        <div className="h-1/2 flex flex-col bg-white border-b border-slate-200">
          <div className="h-11 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <span className="text-sm font-bold text-slate-600">SQL Query Editor</span>
            <div className="flex items-center gap-2">
              <button onClick={copy} title="Copy query"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button onClick={run} disabled={loading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <textarea value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); run() } }}
              spellCheck={false}
              className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none bg-slate-900 text-slate-200 selection:bg-blue-500/30"
              placeholder="-- Ctrl+Enter để chạy query..." />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col bg-white min-h-0">
          <div className="h-11 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-600">Query Results</span>
              {results.length > 0 && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{results.length} rows</span>
              )}
            </div>
            {results.length > 0 && (
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto relative">
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin mb-2" />
                <p className="text-sm text-slate-500">Executing query...</p>
              </div>
            )}
            {feedback && !loading && (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center mb-3",
                  feedback.ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}>
                  <AlertCircle className="w-5 h-5" />
                </div>
                <pre className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-2xl overflow-auto whitespace-pre-wrap text-left">
                  {feedback.msg}
                </pre>
              </div>
            )}
            {!loading && !feedback && results.length > 0 && (
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    {columns.map(col => (
                      <th key={col} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      {columns.map(col => (
                        <td key={col} className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap font-mono">
                          {row[col] === null
                            ? <span className="text-slate-300 italic">null</span>
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && !feedback && results.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <Database className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">Chưa có kết quả</p>
                <p className="text-xs mt-1 text-slate-300">Ctrl+Enter để chạy query</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
