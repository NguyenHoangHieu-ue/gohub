"use client"

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import {
  Play, Download, Database, Search, ChevronDown, ChevronRight, Table2, BarChart3, BarChartHorizontal, LineChart,
  AreaChart, PieChart, Hash, Maximize2, Minimize2, History, Sigma, Calendar, Type, Loader2, AlertCircle, X,
  ChevronUp, PanelTop,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportRawRows } from "@/lib/export-excel"
import { formatNumber } from "@/lib/analytics-formatters"
import {
  inferColumns, suggestConfig, aggregateForChart, computeCards, sortRows, columnTotals, filterRows,
  AGG_LABEL, type ColInfo, type ColKind, type Row, type VisualConfig, type VisualType, type Agg,
} from "@/lib/query-studio"

// Query Studio — SQL Query kiểu Power BI: Data (schema) | SQL + canvas | Visualizations (loại biểu đồ + Axis/Legend/Values).
// Chạy SQL trên gohub_dw (SELECT-only) → kết quả thành "dataset" → dựng bảng/biểu đồ phía client, không cần app khác.

const StudioChart = dynamic(() => import("./query-studio-charts").then(m => m.StudioChart), {
  ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-100 rounded-xl" />,
})

interface SqlTableInfo { tableName: string; columns: { columnName: string; dataType: string }[] }

const HISTORY_KEY = "qs_history_v1"
const DEFAULT_SQL = "SELECT * FROM fact_fulfillment_revenue LIMIT 100;"
const AGGS = Object.keys(AGG_LABEL) as Agg[]

const VISUALS: { type: VisualType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "table", label: "Table", Icon: Table2 },
  { type: "column", label: "Column", Icon: BarChart3 },
  { type: "bar", label: "Bar", Icon: BarChartHorizontal },
  { type: "line", label: "Line", Icon: LineChart },
  { type: "area", label: "Area", Icon: AreaChart },
  { type: "donut", label: "Donut", Icon: PieChart },
  { type: "card", label: "Card", Icon: Hash },
]

const KIND_ICON: Record<ColKind, React.ComponentType<{ className?: string }>> = { number: Sigma, date: Calendar, text: Type }
const KIND_COLOR: Record<ColKind, string> = { number: "text-brand-600", date: "text-amber-600", text: "text-slate-400" }

const isIdLike = (name: string) => /(^|_)(id|code|no|number|sku|phone)$/i.test(name)

function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") } catch { return [] }
}
function pushHistory(sql: string) {
  try {
    const next = [sql, ...readHistory().filter(h => h !== sql)].slice(0, 15)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch { /* localStorage có thể bị chặn — bỏ qua */ }
}

const cellText = (v: unknown, c: ColInfo): string => {
  if (v === null || v === undefined) return ""
  if (c.kind === "number" && !isIdLike(c.name)) {
    const n = Number(v)
    return Number.isFinite(n) ? formatNumber(n) : String(v)
  }
  return String(v).replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/, "$1 $2")
}

export function QueryStudio() {
  const [query, setQuery] = useState(DEFAULT_SQL)
  const [rows, setRows] = useState<Row[]>([])
  const [cols, setCols] = useState<ColInfo[]>([])
  const [meta, setMeta] = useState<{ ms: number; total: number; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cfg, setCfg] = useState<VisualConfig>({ type: "table", axis: null, legend: null, values: [], topN: 20, stacked: false })

  const [schema, setSchema] = useState<SqlTableInfo[]>([])
  const [expanded, setExpanded] = useState(new Set<string>())
  const [schemaSearch, setSchemaSearch] = useState("")

  const [editorOpen, setEditorOpen] = useState(true)
  const [focus, setFocus] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const colSig = useRef("")

  useEffect(() => {
    fetch("/api/admin/sql-schema").then(r => (r.ok ? r.json() : [])).then(setSchema).catch(() => {})
    setHistory(readHistory())
  }, [])

  const runQuery = useCallback(async (sql: string) => {
    if (!sql.trim()) return
    setLoading(true); setError(null)
    const t0 = performance.now()
    try {
      const res = await fetch("/api/admin/sql-query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || "Lỗi không rõ"); return }
      const data: Row[] = d.rows ?? []
      const inferred = inferColumns(data)
      const sig = inferred.map(c => `${c.name}:${c.kind}`).join("|")
      setRows(data); setCols(inferred)
      setMeta({ ms: Math.round(performance.now() - t0), total: d.rowCount ?? data.length, truncated: !!d.truncated })
      // Cùng bộ cột với lần chạy trước → giữ nguyên cấu hình visual; khác → gợi ý lại như "Recommended" của Power BI.
      if (sig !== colSig.current) setCfg(suggestConfig(inferred, data))
      colSig.current = sig
      pushHistory(sql); setHistory(readHistory())
    } catch (e: any) {
      setError(e?.message || "Không gọi được server")
    } finally { setLoading(false) }
  }, [])

  const run = () => {
    const el = editorRef.current
    const sel = el && el.selectionStart !== el.selectionEnd ? query.slice(el.selectionStart, el.selectionEnd) : query
    runQuery(sel)
  }

  const exportExcel = () => {
    const out = rows.map(r => { const o: Record<string, unknown> = {}; for (const c of cols) o[c.name] = r[c.name] ?? ""; return o })
    exportRawRows(out, `sql_export_${new Date().toISOString().split("T")[0]}`, "Query")
  }

  const filteredSchema = schema.filter(t =>
    t.tableName.toLowerCase().includes(schemaSearch.toLowerCase()) ||
    t.columns.some(c => c.columnName.toLowerCase().includes(schemaSearch.toLowerCase())))

  const toggleTable = (t: string) => setExpanded(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })
  const patch = (p: Partial<VisualConfig>) => setCfg(c => ({ ...c, ...p }))
  const setType = (type: VisualType) => setCfg(c => {
    const next = { ...c, type }
    // Chuyển từ Table sang biểu đồ mà chưa chọn trường → tự điền gợi ý để có hình ngay.
    if (type !== "table" && !c.values.length) return { ...suggestConfig(cols, rows), type }
    if (type === "donut" || type === "card") next.legend = null
    return next
  })

  const chart = useMemo(
    () => (cfg.type === "table" || cfg.type === "card" ? null : aggregateForChart(rows, cfg, cols)),
    [rows, cfg, cols])
  const cards = useMemo(() => (cfg.type === "card" ? computeCards(rows, cfg) : []), [rows, cfg])

  return (
    <div className={cn(
      "flex flex-col lg:flex-row bg-slate-50 overflow-hidden border border-slate-200 shadow-sm",
      focus ? "fixed inset-0 z-40 rounded-none" : "h-[78vh] min-h-[560px] rounded-2xl",
    )}>
      {/* ── Data pane (schema) ─────────────────────────────────────────── */}
      <aside className="lg:w-64 w-full max-h-56 lg:max-h-none border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-slate-800 mb-2 text-sm">
            <Database className="w-4 h-4 text-brand-600" /> Data
            <span className="ml-auto text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">gohub_dw</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={schemaSearch} onChange={e => setSchemaSearch(e.target.value)} placeholder="Search tables / columns…"
              className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredSchema.map(t => (
            <div key={t.tableName}>
              <div className="flex items-center hover:bg-slate-50 rounded-lg">
                <button onClick={() => toggleTable(t.tableName)} aria-label="Mở cột" className="p-1.5 text-slate-400 hover:text-slate-600">
                  {expanded.has(t.tableName) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => { const q = `SELECT * FROM ${t.tableName} LIMIT 100;`; setQuery(q); runQuery(q) }}
                  title={`Preview: SELECT * FROM ${t.tableName} LIMIT 100`}
                  className="flex items-center gap-1.5 flex-1 py-1.5 pr-2 text-left min-w-0">
                  <Table2 className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate">{t.tableName}</span>
                </button>
              </div>
              {expanded.has(t.tableName) && (
                <div className="ml-7 border-l border-slate-100 mb-1">
                  {t.columns.map(c => (
                    <div key={c.columnName} title="Bấm đúp để chèn vào editor"
                      onDoubleClick={() => setQuery(q => q + (q.endsWith("\n") || q === "" ? "" : "\n") + c.columnName)}
                      className="flex items-center justify-between px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 cursor-default">
                      <span className="truncate">{c.columnName}</span>
                      <span className="text-[9px] text-slate-300 font-mono italic ml-2 shrink-0">{c.dataType}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filteredSchema.length === 0 && <p className="p-4 text-center text-xs text-slate-400">Không tìm thấy bảng</p>}
        </div>
      </aside>

      {/* ── Editor + canvas ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-[420px]">
        <div className="bg-white border-b border-slate-200 shrink-0">
          <div className="h-11 flex items-center justify-between px-3 gap-2">
            <button onClick={() => setEditorOpen(o => !o)} className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-800">
              {editorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} SQL
            </button>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button onClick={() => setHistoryOpen(o => !o)} title="Lịch sử query"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><History className="w-4 h-4" /></button>
                {historyOpen && (
                  <div className="absolute right-0 top-9 z-20 w-96 max-h-72 overflow-auto bg-white border border-slate-200 rounded-xl shadow-xl p-1">
                    {history.length === 0 && <p className="p-3 text-xs text-slate-400">Chưa có lịch sử.</p>}
                    {history.map(h => (
                      <button key={h} onClick={() => { setQuery(h); setHistoryOpen(false); setEditorOpen(true) }}
                        className="block w-full text-left px-3 py-2 text-[11px] font-mono text-slate-600 hover:bg-slate-50 rounded-lg truncate">{h.replace(/\s+/g, " ")}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setFocus(f => !f)} title={focus ? "Thu nhỏ" : "Toàn màn hình"}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                {focus ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              {rows.length > 0 && (
                <button onClick={exportExcel}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              )}
              <button onClick={run} disabled={loading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
              </button>
            </div>
          </div>
          {editorOpen && (
            <textarea ref={editorRef} value={query} onChange={e => setQuery(e.target.value)} spellCheck={false}
              onKeyDown={e => {
                if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); run() }
                if (e.key === "Tab") {
                  e.preventDefault()
                  const el = e.currentTarget, s = el.selectionStart
                  setQuery(q => q.slice(0, s) + "  " + q.slice(el.selectionEnd))
                  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
                }
              }}
              placeholder="-- Ctrl+Enter chạy (chạy riêng phần đang bôi đen nếu có)"
              className="w-full h-32 p-3 font-mono text-sm resize-y focus:outline-none bg-slate-900 text-slate-200 selection:bg-brand-500/30" />
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-white">
          <div className="h-9 flex items-center gap-3 px-4 border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 shrink-0">
            <span className="font-bold text-slate-600">{VISUALS.find(v => v.type === cfg.type)?.label}</span>
            {meta && <span>{formatNumber(meta.total)} dòng · {meta.ms} ms</span>}
            {meta?.truncated && <span className="text-amber-600 font-semibold">Chỉ nhận 10.000 dòng đầu — thêm LIMIT/WHERE/GROUP BY để đủ</span>}
          </div>
          <div className="flex-1 min-h-0 overflow-auto relative p-3">
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                <Loader2 className="w-7 h-7 text-brand-600 animate-spin mb-2" />
                <p className="text-sm text-slate-500">Executing query…</p>
              </div>
            )}
            {error && !loading && (
              <div className="p-6 flex flex-col items-center text-center">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3 bg-rose-100 text-rose-600"><AlertCircle className="w-5 h-5" /></div>
                <pre className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-2xl overflow-auto whitespace-pre-wrap text-left">{error}</pre>
              </div>
            )}
            {!error && !meta && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                <PanelTop className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">Chạy 1 query để bắt đầu</p>
                <p className="text-xs mt-1 text-slate-300">Sau đó chọn loại biểu đồ + kéo trường vào Axis / Values ở panel Visualizations</p>
              </div>
            )}
            {!error && meta && rows.length === 0 && !loading && <p className="p-8 text-center text-sm text-slate-400">Query không trả dòng nào.</p>}
            {!error && rows.length > 0 && cfg.type === "table" && <ResultTable rows={rows} cols={cols} />}
            {!error && rows.length > 0 && cfg.type === "card" && (
              cards.length === 0
                ? <Hint>Thêm trường vào <b>Values</b> để hiện thẻ số.</Hint>
                : <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {cards.map(c => (
                      <div key={c.label} className="rounded-2xl border border-slate-200 p-5">
                        <p className="text-[11px] font-semibold text-slate-400 truncate">{c.label}</p>
                        <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{formatNumber(c.value)}</p>
                      </div>
                    ))}
                  </div>
            )}
            {!error && rows.length > 0 && chart && (
              !cfg.axis || !cfg.values.length
                ? <Hint>Chọn trường cho <b>Axis</b> và <b>Values</b> ở panel bên phải (hoặc kéo trường vào).</Hint>
                : <div className="h-full min-h-[260px] flex flex-col">
                    {chart.truncated && <p className="text-[11px] text-amber-600 mb-1">Hiển thị {cfg.topN} nhóm đầu — chỉnh Top N để xem thêm.</p>}
                    <div className="flex-1 min-h-0"><StudioChart type={cfg.type as Exclude<VisualType, "table" | "card">} chart={chart} stacked={cfg.stacked} /></div>
                  </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Visualizations pane ─────────────────────────────────────────── */}
      <aside className="lg:w-72 w-full border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto max-h-72 lg:max-h-none">
        <div className="p-3 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800 mb-2">Visualizations</p>
          <div className="grid grid-cols-4 gap-1.5">
            {VISUALS.map(({ type, label, Icon }) => (
              <button key={type} onClick={() => setType(type)} title={label} disabled={!rows.length}
                className={cn("flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-semibold disabled:opacity-40",
                  cfg.type === type ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 border-b border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Fields <span className="normal-case font-normal">(kết quả query)</span></p>
          {cols.length === 0 && <p className="text-xs text-slate-400">Chạy query để có trường.</p>}
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {cols.map(c => {
              const Icon = KIND_ICON[c.kind]
              return (
                <div key={c.name} draggable onDragStart={e => e.dataTransfer.setData("text/plain", c.name)}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-slate-700 hover:bg-slate-50 cursor-grab active:cursor-grabbing">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", KIND_COLOR[c.kind])} /><span className="truncate">{c.name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {cfg.type !== "table" && cols.length > 0 && (
          <div className="p-3 space-y-3">
            {cfg.type !== "card" && (
              <Well label="Axis" hint="Kéo 1 trường vào đây" cols={cols} onPick={f => patch({ axis: f })}>
                {cfg.axis && <FieldPill name={cfg.axis} onRemove={() => patch({ axis: null })} />}
              </Well>
            )}
            {cfg.type !== "card" && cfg.type !== "donut" && (
              <Well label="Legend" hint="Tách thành nhiều màu (dùng Value đầu tiên)" cols={cols} onPick={f => patch({ legend: f })}>
                {cfg.legend && <FieldPill name={cfg.legend} onRemove={() => patch({ legend: null })} />}
              </Well>
            )}
            <Well label="Values" hint="Kéo trường số vào đây" cols={cols} onPick={f => patch({ values: [...cfg.values, { field: f, agg: cols.find(c => c.name === f)?.kind === "number" ? "sum" : "count" }] })}>
              {cfg.values.map((v, i) => (
                <FieldPill key={`${v.field}-${i}`} name={v.field}
                  onRemove={() => patch({ values: cfg.values.filter((_, j) => j !== i) })}
                  agg={v.agg} onAgg={agg => patch({ values: cfg.values.map((x, j) => (j === i ? { ...x, agg } : x)) })} />
              ))}
            </Well>
            {cfg.type !== "card" && (
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <label className="flex items-center gap-1.5">Top N
                  <input type="number" min={0} value={cfg.topN} onChange={e => patch({ topN: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-xs" title="0 = tối đa 500" />
                </label>
                {(cfg.type === "column" || cfg.type === "bar" || cfg.type === "area") && (
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.stacked} onChange={e => patch({ stacked: e.target.checked })} /> Stacked</label>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-slate-400">{children}</p>
}

// Ô thả trường kiểu Power BI: kéo-thả HOẶC chọn từ danh sách "+ Add field".
function Well({ label, hint, cols, onPick, children }: {
  label: string; hint: string; cols: ColInfo[]; onPick: (field: string) => void; children: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.getData("text/plain"); if (cols.some(c => c.name === f)) onPick(f) }}
        className={cn("rounded-lg border border-dashed p-1.5 space-y-1 min-h-[34px]", over ? "border-brand-500 bg-brand-50/50" : "border-slate-200")}>
        {children}
        <select value="" onChange={e => { if (e.target.value) onPick(e.target.value) }} aria-label={`Thêm trường vào ${label}`}
          className="w-full text-[11px] text-slate-400 bg-transparent focus:outline-none cursor-pointer">
          <option value="">+ {hint}</option>
          {cols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
    </div>
  )
}

function FieldPill({ name, onRemove, agg, onAgg }: { name: string; onRemove: () => void; agg?: Agg; onAgg?: (a: Agg) => void }) {
  return (
    <div className="flex items-center gap-1 bg-brand-50 text-brand-800 rounded-md pl-2 pr-1 py-1 text-xs">
      <span className="truncate flex-1" title={name}>{name}</span>
      {agg && onAgg && (
        <select value={agg} onChange={e => onAgg(e.target.value as Agg)} className="text-[10px] bg-white border border-brand-100 rounded px-1 py-0.5 text-slate-600">
          {AGGS.map(a => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
        </select>
      )}
      <button onClick={onRemove} aria-label={`Bỏ ${name}`} className="p-0.5 hover:bg-brand-100 rounded"><X className="w-3 h-3" /></button>
    </div>
  )
}

// ── Table visual: sort, lọc nhanh, tổng cột số, phân trang ───────────────────────────────────────

const PAGE_SIZE = 100

function ResultTable({ rows, cols }: { rows: Row[]; cols: ColInfo[] }) {
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null)
  const [term, setTerm] = useState("")
  const [totals, setTotals] = useState(false)
  const [page, setPage] = useState(0)

  const colSig = cols.map(c => c.name).join("|")
  useEffect(() => { setSort(null); setTerm(""); setPage(0) }, [colSig])

  const filtered = useMemo(() => filterRows(rows, term), [rows, term])
  const sorted = useMemo(() => {
    if (!sort) return filtered
    const kind = cols.find(c => c.name === sort.col)?.kind ?? "text"
    return sortRows(filtered, sort.col, sort.dir, kind)
  }, [filtered, sort, cols])
  const sums = useMemo(() => (totals ? columnTotals(sorted, cols) : {}), [totals, sorted, cols])
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const view = sorted.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE)

  const toggleSort = (col: string) =>
    setSort(s => (s?.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : null))

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 mb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={term} onChange={e => { setTerm(e.target.value); setPage(0) }} placeholder="Lọc nhanh…"
            className="pl-8 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={totals} onChange={e => setTotals(e.target.checked)} /> Tổng cột số</label>
        {term && <span className="text-[11px] text-slate-400">{formatNumber(filtered.length)}/{formatNumber(rows.length)} dòng</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto border border-slate-100 rounded-xl">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {cols.map(c => {
                const Icon = KIND_ICON[c.kind]
                return (
                  <th key={c.name} onClick={() => toggleSort(c.name)}
                    className={cn("px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100",
                      c.kind === "number" ? "text-right" : "text-left")}>
                    <span className="inline-flex items-center gap-1"><Icon className={cn("w-3 h-3", KIND_COLOR[c.kind])} />{c.name}
                      {sort?.col === c.name && <span className="text-brand-600">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {cols.map(c => (
                  <td key={c.name} className={cn("px-3 py-1.5 text-xs whitespace-nowrap", c.kind === "number" ? "text-right tabular-nums text-slate-700" : "text-slate-600")}>
                    {r[c.name] === null || r[c.name] === undefined ? <span className="text-slate-300 italic">null</span> : cellText(r[c.name], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot className="sticky bottom-0 bg-slate-50">
              <tr>
                {cols.map((c, i) => (
                  <td key={c.name} className={cn("px-3 py-2 text-xs font-bold border-t border-slate-200", c.kind === "number" ? "text-right tabular-nums text-slate-800" : "text-slate-500")}>
                    {c.kind === "number" && !isIdLike(c.name) ? formatNumber(sums[c.name] ?? 0) : i === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 pt-2 text-xs text-slate-500 shrink-0">
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)} className="px-2 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Trước</button>
          <span>{cur + 1} / {pages}</span>
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="px-2 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Sau</button>
        </div>
      )}
    </div>
  )
}
