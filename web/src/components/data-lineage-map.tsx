"use client"

import { useState, useMemo } from "react"
import { GitBranch, Database, ArrowRight, Info, X } from "lucide-react"
import {
  TABS, DB_TABLES, CONNECTIONS, TAB_COLORS, SOURCE_COLORS, GROUP_LABELS, GROUP_ORDER,
  type TabNode, type DbTable, type Connection, type TabGroup,
} from "@/lib/data-lineage"
import { cn } from "@/lib/utils"

// SVG layout constants
const SVG_W = 840
const TAB_X = 8
const TAB_W = 188
const TABLE_X = 644
const TABLE_W = 188
const NODE_H = 22
const NODE_R = 4
const LINE_X1 = TAB_X + TAB_W        // 196
const LINE_X2 = TABLE_X               // 644
const MID_X = (LINE_X1 + LINE_X2) / 2 // 420

function usePositions() {
  return useMemo(() => {
    const tabY: Record<string, number> = {}
    let y = 28
    let lastGroup = ""
    const ordered = GROUP_ORDER.flatMap(g => TABS.filter(t => t.group === g))
    ordered.forEach((tab, i) => {
      if (i > 0 && tab.group !== lastGroup) y += 14
      tabY[tab.id] = y + NODE_H / 2
      y += NODE_H + 8
      lastGroup = tab.group
    })
    const svgH = y + 20
    const tableY: Record<string, number> = {}
    const spacing = (svgH - 48) / (DB_TABLES.length - 1)
    DB_TABLES.forEach((tbl, i) => { tableY[tbl.id] = 24 + i * spacing })
    return { tabY, tableY, svgH, ordered }
  }, [])
}

export function DataLineageMap() {
  const [selId, setSelId] = useState<string | null>(null)
  const [selType, setSelType] = useState<"tab" | "table" | null>(null)
  const { tabY, tableY, svgH, ordered } = usePositions()

  const selectedTab = selType === "tab" ? TABS.find(t => t.id === selId) ?? null : null
  const selectedTable = selType === "table" ? DB_TABLES.find(t => t.id === selId) ?? null : null

  const activeConns = useMemo(() => {
    if (!selId) return [] as Connection[]
    return CONNECTIONS.filter(c => selType === "tab" ? c.tabId === selId : c.tableId === selId)
  }, [selId, selType])

  const relTableIds = useMemo(() => new Set(activeConns.map(c => c.tableId)), [activeConns])
  const relTabIds   = useMemo(() => new Set(activeConns.map(c => c.tabId)),   [activeConns])

  const siblingTabIds = useMemo(() => {
    if (selType !== "tab" || !selId) return new Set<string>()
    const myTables = new Set(CONNECTIONS.filter(c => c.tabId === selId).map(c => c.tableId))
    const sibs = new Set<string>()
    CONNECTIONS.forEach(c => { if (c.tabId !== selId && myTables.has(c.tableId)) sibs.add(c.tabId) })
    return sibs
  }, [selId, selType])

  const select = (id: string, type: "tab" | "table") => {
    if (selId === id) { setSelId(null); setSelType(null) }
    else { setSelId(id); setSelType(type) }
  }
  const clear = () => { setSelId(null); setSelType(null) }

  // Group label Y: y of first tab in group minus a bit
  const groupLabelY = useMemo(() => {
    const r: Partial<Record<TabGroup, number>> = {}
    GROUP_ORDER.forEach(g => {
      const first = ordered.find(t => t.group === g)
      if (first) r[g] = (tabY[first.id] ?? 0) - NODE_H / 2 - 3
    })
    return r
  }, [ordered, tabY])

  const connStyle = (conn: Connection) => {
    if (!selId) return "ambient"
    const hit = selType === "tab" ? conn.tabId === selId : conn.tableId === selId
    return hit ? "active" : "faded"
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-700">Data Lineage Map</span>
        </div>
        <p className="text-xs text-slate-400">Click vào tab (trái) hoặc bảng DB (phải) để xem chi tiết và ảnh hưởng</p>
        {selId && (
          <button onClick={clear}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md px-2 py-1">
            <X className="w-3 h-3" />Bỏ chọn
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px]">
        {GROUP_ORDER.map(g => {
          const c = TAB_COLORS[g]
          return (
            <div key={g} className="flex items-center gap-1">
              <span className="w-3 h-2.5 rounded-sm border inline-block" style={{ background: c.fill, borderColor: c.stroke }} />
              <span className="text-slate-500">{GROUP_LABELS[g]}</span>
            </div>
          )
        })}
        <span className="text-slate-200">|</span>
        {(["gohub_dw", "supabase", "turso", "external"] as const).map(s => {
          const c = SOURCE_COLORS[s]
          return (
            <div key={s} className="flex items-center gap-1">
              <span className="w-3 h-2.5 rounded-sm border inline-block" style={{ background: c.fill, borderColor: c.stroke }} />
              <span className="text-slate-500">{c.label}</span>
            </div>
          )
        })}
      </div>

      {/* Main: graph + panel */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">

        {/* SVG graph */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-auto">
          <svg
            viewBox={`0 0 ${SVG_W} ${svgH}`}
            width={SVG_W}
            height={svgH}
            style={{ display: "block", minWidth: SVG_W }}
            onClick={e => { if (e.currentTarget === e.target) clear() }}
          >
            {/* Column headers */}
            <text x={TAB_X} y={14} fontSize={8} fontFamily="Inter,sans-serif" fontWeight="700" fill="#94a3b8" letterSpacing={1}>
              ANALYTICS TABS
            </text>
            <text x={TABLE_X} y={14} fontSize={8} fontFamily="Inter,sans-serif" fontWeight="700" fill="#94a3b8" letterSpacing={1}>
              DATABASE TABLES
            </text>

            {/* Connection lines (behind nodes) */}
            {CONNECTIONS.map((conn, i) => {
              const ty  = tabY[conn.tabId]
              const tby = tableY[conn.tableId]
              if (!ty || !tby) return null
              const state = connStyle(conn)
              const tab = TABS.find(t => t.id === conn.tabId)!
              const color = TAB_COLORS[tab.group].stroke
              return (
                <path
                  key={i}
                  d={`M ${LINE_X1},${ty} C ${MID_X},${ty} ${MID_X},${tby} ${LINE_X2},${tby}`}
                  fill="none"
                  stroke={state === "active" ? color : "#94a3b8"}
                  strokeWidth={state === "active" ? 1.8 : 0.8}
                  opacity={state === "active" ? 0.85 : state === "ambient" ? 0.16 : 0.03}
                />
              )
            })}

            {/* Group labels */}
            {GROUP_ORDER.map(g => {
              const ly = groupLabelY[g]
              if (ly === undefined) return null
              return (
                <text key={g} x={TAB_X + 2} y={ly - 1}
                  fontSize={7.5} fontFamily="Inter,sans-serif" fontWeight="700"
                  fill={TAB_COLORS[g].stroke} opacity={0.65}
                >
                  {GROUP_LABELS[g].toUpperCase()}
                </text>
              )
            })}

            {/* Tab nodes */}
            {ordered.map(tab => {
              const y = tabY[tab.id]
              if (!y) return null
              const c = TAB_COLORS[tab.group]
              const isSel  = selId === tab.id && selType === "tab"
              const isRel  = selType === "table" && relTabIds.has(tab.id)
              const isDim  = !!selId && !isSel && !isRel
              return (
                <g key={tab.id} style={{ cursor: "pointer" }} onClick={() => select(tab.id, "tab")}>
                  <rect x={TAB_X} y={y - NODE_H / 2} width={TAB_W} height={NODE_H} rx={NODE_R}
                    fill={isSel ? c.stroke : isDim ? "#f8fafc" : c.fill}
                    stroke={isSel || isRel ? c.stroke : "#e2e8f0"}
                    strokeWidth={isSel ? 2 : 1}
                    opacity={isDim ? 0.4 : 1}
                  />
                  <text x={TAB_X + 8} y={y + 4}
                    fontSize={9.5} fontFamily="Inter,sans-serif" fontWeight={isSel ? "700" : "500"}
                    fill={isSel ? "#fff" : isDim ? "#94a3b8" : c.text}
                    opacity={isDim ? 0.6 : 1}
                  >
                    {tab.label}
                  </text>
                </g>
              )
            })}

            {/* Source group separators on right side */}
            {(["gohub_dw", "supabase", "turso", "external"] as const).map(src => {
              const firstTbl = DB_TABLES.find(t => t.source === src)
              if (!firstTbl) return null
              const ly = (tableY[firstTbl.id] ?? 0) - NODE_H / 2 - 3
              const c = SOURCE_COLORS[src]
              return (
                <text key={src} x={TABLE_X + 2} y={ly - 1}
                  fontSize={7.5} fontFamily="Inter,sans-serif" fontWeight="700"
                  fill={c.stroke} opacity={0.65}
                >
                  {c.label.toUpperCase()}
                </text>
              )
            })}

            {/* Table nodes */}
            {DB_TABLES.map(tbl => {
              const y = tableY[tbl.id]
              if (!y) return null
              const c = SOURCE_COLORS[tbl.source]
              const isSel = selId === tbl.id && selType === "table"
              const isRel = selType === "tab" && relTableIds.has(tbl.id)
              const isDim = !!selId && !isSel && !isRel
              const label = tbl.label.length > 24 ? tbl.label.slice(0, 23) + "…" : tbl.label
              return (
                <g key={tbl.id} style={{ cursor: "pointer" }} onClick={() => select(tbl.id, "table")}>
                  <rect x={TABLE_X} y={y - NODE_H / 2} width={TABLE_W} height={NODE_H} rx={NODE_R}
                    fill={isSel ? c.stroke : isDim ? "#f8fafc" : c.fill}
                    stroke={isSel || isRel ? c.stroke : "#e2e8f0"}
                    strokeWidth={isSel ? 2 : 1}
                    opacity={isDim ? 0.4 : 1}
                  />
                  <text x={TABLE_X + 8} y={y + 4}
                    fontSize={9} fontFamily="'JetBrains Mono',monospace" fontWeight={isSel ? "700" : "500"}
                    fill={isSel ? "#fff" : isDim ? "#94a3b8" : c.text}
                    opacity={isDim ? 0.6 : 1}
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Detail panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
          {!selId ? (
            <EmptyPanel />
          ) : selectedTab ? (
            <TabDetail tab={selectedTab} conns={activeConns} siblingTabIds={siblingTabIds} />
          ) : selectedTable ? (
            <TableImpact table={selectedTable} conns={activeConns} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EmptyPanel() {
  return (
    <div className="p-10 text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
        <GitBranch className="w-6 h-6 text-slate-300" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">Chọn một node để xem chi tiết</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Click tab analytics (bên trái) → xem nguồn dữ liệu & mối quan hệ<br />
          Click bảng DB (bên phải) → xem ảnh hưởng đến các tab
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 w-full text-[10px]">
        <div className="bg-slate-50 rounded-lg p-2 text-left">
          <p className="font-bold text-slate-500 mb-1">{TABS.length} Analytics Tabs</p>
          {GROUP_ORDER.map(g => (
            <div key={g} className="flex justify-between text-slate-400">
              <span>{GROUP_LABELS[g]}</span>
              <span>{TABS.filter(t => t.group === g).length} tab</span>
            </div>
          ))}
        </div>
        <div className="bg-slate-50 rounded-lg p-2 text-left">
          <p className="font-bold text-slate-500 mb-1">{DB_TABLES.length} DB Tables</p>
          {(["gohub_dw", "supabase", "turso", "external"] as const).map(s => (
            <div key={s} className="flex justify-between text-slate-400">
              <span>{SOURCE_COLORS[s].label.split(" ")[0]}</span>
              <span>{DB_TABLES.filter(t => t.source === s).length} bảng</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TabDetail({ tab, conns, siblingTabIds }: { tab: TabNode; conns: Connection[]; siblingTabIds: Set<string> }) {
  const c = TAB_COLORS[tab.group]
  const siblings = TABS.filter(t => siblingTabIds.has(t.id))

  return (
    <div className="overflow-y-auto max-h-[700px]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100" style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: c.stroke }}>
        <p className="font-bold text-slate-800 text-sm">{tab.label}</p>
        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{tab.route}</p>
        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{tab.description}</p>
        <span className="mt-2 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: c.fill, color: c.text }}>
          {GROUP_LABELS[tab.group]}
        </span>
      </div>

      {/* Tables used */}
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Nguồn dữ liệu ({conns.length} bảng)
        </p>
        {conns.map(conn => {
          const tbl = DB_TABLES.find(t => t.id === conn.tableId)!
          const sc = SOURCE_COLORS[tbl.source]
          return (
            <div key={conn.tableId} className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: sc.fill }}>
                <Database className="w-3 h-3 shrink-0" style={{ color: sc.stroke }} />
                <span className="text-[10px] font-bold font-mono flex-1" style={{ color: sc.text }}>{tbl.label}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: sc.stroke + "22", color: sc.text }}>
                  {sc.label}
                </span>
              </div>
              <div className="px-3 py-2 space-y-2">
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fields dùng</p>
                  <div className="flex flex-wrap gap-1">
                    {conn.fields.map(f => (
                      <code key={f} className="text-[8.5px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{f}</code>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Metrics ảnh hưởng</p>
                  <ul className="space-y-0.5">
                    {conn.metrics.map(m => (
                      <li key={m} className="text-[10px] text-slate-600 flex items-start gap-1">
                        <span className="text-amber-400 mt-0.5 shrink-0">•</span>{m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sibling tabs */}
      {siblings.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Tab dùng chung bảng ({siblings.length}) — cùng thay đổi khi data thay đổi
          </p>
          {siblings.map(sib => {
            const sc = TAB_COLORS[sib.group]
            const shared = CONNECTIONS
              .filter(c2 => c2.tabId === sib.id && conns.some(mc => mc.tableId === c2.tableId))
              .length
            return (
              <div key={sib.id} className="flex items-center gap-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.stroke }} />
                <span className="text-[11px] text-slate-700 font-medium">{sib.label}</span>
                <span className="text-[9px] text-slate-400 ml-auto">{shared} bảng chung</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TableImpact({ table, conns }: { table: DbTable; conns: Connection[] }) {
  const c = SOURCE_COLORS[table.source]

  return (
    <div className="overflow-y-auto max-h-[700px]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100" style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: c.stroke }}>
        <div className="flex items-start gap-2">
          <Database className="w-4 h-4 mt-0.5 shrink-0" style={{ color: c.stroke }} />
          <div>
            <p className="font-bold text-slate-800 text-sm font-mono">{table.label}</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{table.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.fill, color: c.text }}>
            {c.label}
          </span>
          <span className="text-[10px] text-slate-400">Cập nhật: {table.updateFreq}</span>
        </div>
      </div>

      {/* Key fields */}
      <div className="px-4 py-3 border-b border-slate-100 space-y-1.5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Các trường chính</p>
        {table.keyFields.map(f => (
          <div key={f.name} className="flex items-start gap-2">
            <code className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono shrink-0">{f.name}</code>
            <span className="text-[8.5px] font-bold text-slate-300 mt-0.5 shrink-0">{f.type}</span>
            {f.note && <span className="text-[9.5px] text-slate-400 leading-snug">{f.note}</span>}
          </div>
        ))}
      </div>

      {/* Impact */}
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Ảnh hưởng đến ({conns.length} tab)
        </p>
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 text-[10px] text-amber-700">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Khi dữ liệu bảng này sai hoặc trễ, các metrics dưới đây sẽ bị ảnh hưởng
        </div>
        {conns.map(conn => {
          const tab = TABS.find(t => t.id === conn.tabId)!
          const tc = TAB_COLORS[tab.group]
          return (
            <div key={conn.tabId} className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2" style={{ background: tc.fill }}>
                <span className="text-[11px] font-bold flex-1" style={{ color: tc.text }}>{tab.label}</span>
                <span className="text-[9px] font-mono text-slate-400">{tab.route}</span>
              </div>
              <div className="px-3 py-2">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Metrics bị ảnh hưởng</p>
                <ul className="space-y-0.5">
                  {conn.metrics.map(m => (
                    <li key={m} className="text-[10px] text-slate-600 flex items-start gap-1">
                      <ArrowRight className="w-2.5 h-2.5 text-amber-400 mt-0.5 shrink-0" />{m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
