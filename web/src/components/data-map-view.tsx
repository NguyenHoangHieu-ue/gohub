"use client"

import { useEffect, useMemo, useState } from "react"
import { GitBranch, Database, Layers, Server, Cloud, Globe, X, Timer } from "lucide-react"
import raw from "@/lib/data-map.generated.json"
import { DB_TABLES } from "@/lib/data-lineage"
import { cn } from "@/lib/utils"
import { normalizePerfRoute } from "@/lib/perf-route"

type Src = "gohub_dw" | "supabase" | "turso" | "external"
interface Tbl { name: string; source: Src }
interface Api { file: string; methods: string[]; cacheKey: string | null; deps: string[]; tables: Tbl[]; external: string[] }
interface Section { id: string; file: string; label: string; titles: string[]; apis: string[]; sqlViaQueryApi: Tbl[] }
interface Tab { id: string; label: string; route: string; group: string; sections: Section[] }
interface TableIdx { source: Src; apis: string[]; tabs: string[] }
interface PerfRow { route: string; calls: number; hitRate: number; serveP95: number | null; computeP50: number | null; computeP95: number | null; computes: number }

const MAP = raw as unknown as { tabs: Tab[]; apis: Record<string, Api>; tables: Record<string, TableIdx> }

const SRC_STYLE: Record<Src, { label: string; chip: string }> = {
  gohub_dw: { label: "gohub_dw", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  supabase: { label: "Supabase", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  turso:    { label: "Turso",    chip: "bg-purple-50 text-purple-700 border-purple-200" },
  external: { label: "API ngoài", chip: "bg-teal-50 text-teal-700 border-teal-200" },
}

const fmtMs = (ms: number | null | undefined) => ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
const speedTone = (ms: number | null | undefined) =>
  ms == null ? "text-slate-400" : ms >= 5000 ? "text-red-600" : ms >= 2000 ? "text-amber-600" : "text-emerald-600"

function Col({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex flex-col">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5 px-1">
        {title}{count != null && <span className="ml-1 text-slate-300">({count})</span>}
      </div>
      <div className="space-y-1 max-h-[560px] overflow-y-auto pr-1">{children}</div>
    </div>
  )
}

function Item({ active, dim, onClick, children }: { active?: boolean; dim?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("w-full text-left rounded-lg border px-2.5 py-1.5 text-xs transition",
        active ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
        dim && !active && "opacity-40")}>
      {children}
    </button>
  )
}

export function DataMapView() {
  const [view, setView] = useState<"tab" | "table">("tab")
  const [tabId, setTabId] = useState<string | null>(null)
  const [secId, setSecId] = useState<string | null>(null)
  const [apiPath, setApiPath] = useState<string | null>(null)
  const [tableName, setTableName] = useState<string | null>(null)
  const [perf, setPerf] = useState<Record<string, PerfRow>>({})
  const [perfNote, setPerfNote] = useState<string>("")

  useEffect(() => {
    fetch("/api/creator/perf-stats?days=3").then(r => r.json()).then(j => {
      const m: Record<string, PerfRow> = {}
      for (const r of (j.routes ?? []) as PerfRow[]) m[r.route] = r
      setPerf(m)
      setPerfNote(j.events ? `${j.events.toLocaleString("vi-VN")} lượt đo / ${j.days} ngày` : "Chưa có số đo (sẽ có sau vài lượt dùng sau khi deploy)")
    }).catch(() => setPerfNote("Không đọc được số đo"))
  }, [])

  const tab = MAP.tabs.find(t => t.id === tabId) ?? null
  const section = tab?.sections.find(s => s.id === secId) ?? null

  const apiList = useMemo(() => {
    if (!tab) return []
    const paths = section ? section.apis : [...new Set(tab.sections.flatMap(s => s.apis))]
    return paths.filter(p => MAP.apis[p])
  }, [tab, section])

  const tableList = useMemo<Tbl[]>(() => {
    if (!tab) return []
    const fromApis = (apiPath ? [apiPath] : apiList).flatMap(p => MAP.apis[p]?.tables ?? [])
    const direct = apiPath ? [] : (section ? section.sqlViaQueryApi : tab.sections.flatMap(s => s.sqlViaQueryApi))
    const seen = new Map<string, Tbl>()
    for (const t of [...fromApis, ...direct]) seen.set(t.name, t)
    return [...seen.values()].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))
  }, [tab, section, apiList, apiPath])

  const perfOf = (p: string): PerfRow | undefined => {
    const k = MAP.apis[p]?.cacheKey
    return k ? perf[normalizePerfRoute(k)] : undefined
  }

  const selTable = tableName ? MAP.tables[tableName] : null
  const desc = tableName ? DB_TABLES.find(t => t.id === tableName) : null
  const selApi = apiPath ? MAP.apis[apiPath] : null

  const reset = () => { setTabId(null); setSecId(null); setApiPath(null); setTableName(null) }
  const bySource = (["gohub_dw", "supabase", "turso"] as Src[]).map(s => ({ s, names: Object.entries(MAP.tables).filter(([, t]) => t.source === s).map(([n]) => n) }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <GitBranch className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-700">Data Map</span>
        <span className="text-xs text-slate-400">Hệ thống → Tab → Mục → API → Bảng · tự sinh từ mã nguồn</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {(["tab", "table"] as const).map(v => (
              <button key={v} onClick={() => { setView(v); reset() }}
                className={cn("px-2.5 py-1", view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600")}>
                {v === "tab" ? "Theo Tab" : "Theo Bảng"}
              </button>
            ))}
          </div>
          {(tabId || tableName) && (
            <button onClick={reset} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-md px-2 py-1">
              <X className="w-3 h-3" />Bỏ chọn
            </button>
          )}
        </div>
      </div>

      {/* Tầng hệ thống */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        {[
          { icon: Server, title: "GoHub API + ETL", sub: "nạp dữ liệu mỗi giờ (:50/:55)", tone: "border-slate-200" },
          { icon: Database, title: "gohub_dw", sub: `${bySource[0].names.length} bảng · chỉ đọc, pool 3`, tone: "border-orange-200 bg-orange-50/40" },
          { icon: Layers, title: "Supabase + Turso", sub: `${bySource[1].names.length} + ${bySource[2].names.length} bảng · cấu hình, target, chi phí`, tone: "border-blue-200 bg-blue-50/40" },
          { icon: Timer, title: "Cache L1 → L2 + epoch", sub: "TTL 60', hết hạn mềm sau ETL", tone: "border-emerald-200 bg-emerald-50/40" },
          { icon: Globe, title: "Web (Vercel)", sub: `${MAP.tabs.length} tab · ${Object.keys(MAP.apis).length} API`, tone: "border-slate-200" },
        ].map(b => (
          <div key={b.title} className={cn("rounded-xl border p-2.5 bg-white", b.tone)}>
            <div className="flex items-center gap-1.5 font-semibold text-slate-700"><b.icon className="w-3.5 h-3.5" />{b.title}</div>
            <div className="text-slate-400 mt-0.5">{b.sub}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-400 flex items-center gap-1"><Cloud className="w-3 h-3" />{perfNote || "Đang đọc số đo…"}</div>

      {view === "tab" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Col title="Tab" count={MAP.tabs.length}>
            {MAP.tabs.map(t => (
              <Item key={t.id} active={t.id === tabId} onClick={() => { setTabId(t.id === tabId ? null : t.id); setSecId(null); setApiPath(null); setTableName(null) }}>
                <div className="font-medium">{t.label}</div>
                <div className="text-[10.5px] text-slate-400">{t.group} · {new Set(t.sections.flatMap(s => s.apis)).size} API</div>
              </Item>
            ))}
          </Col>
          <Col title="Mục / chức năng" count={tab?.sections.length}>
            {!tab && <p className="text-xs text-slate-400 px-1">Chọn một tab</p>}
            {tab?.sections.map(s => (
              <Item key={s.id} active={s.id === secId} onClick={() => { setSecId(s.id === secId ? null : s.id); setApiPath(null); setTableName(null) }}>
                <div className="font-medium">{s.label}</div>
                <div className="text-[10.5px] text-slate-400 truncate">{s.file.replace("src/", "")}</div>
              </Item>
            ))}
          </Col>
          <Col title="API" count={tab ? apiList.length : undefined}>
            {!tab && <p className="text-xs text-slate-400 px-1">—</p>}
            {apiList.map(p => {
              const pr = perfOf(p)
              return (
                <Item key={p} active={p === apiPath} onClick={() => { setApiPath(p === apiPath ? null : p); setTableName(null) }}>
                  <div className="font-mono text-[11px] break-all">{p.replace("/api/", "")}</div>
                  <div className="text-[10.5px] flex gap-2">
                    {pr ? (<>
                      <span className={speedTone(pr.computeP95)}>nguội p95 {fmtMs(pr.computeP95)}</span>
                      <span className="text-slate-400">trúng {(pr.hitRate * 100).toFixed(0)}%</span>
                    </>) : <span className="text-slate-300">{MAP.apis[p].cacheKey ? "chưa có số đo" : "không qua cache"}</span>}
                  </div>
                </Item>
              )
            })}
          </Col>
          <Col title="Bảng dữ liệu" count={tab ? tableList.length : undefined}>
            {!tab && <p className="text-xs text-slate-400 px-1">—</p>}
            {tableList.map(t => (
              <Item key={t.name} active={t.name === tableName} onClick={() => setTableName(t.name === tableName ? null : t.name)}>
                <div className="flex items-center gap-1.5">
                  <span className={cn("rounded border px-1 text-[10px]", SRC_STYLE[t.source].chip)}>{SRC_STYLE[t.source].label}</span>
                  <span className="font-mono text-[11px] break-all">{t.name}</span>
                </div>
              </Item>
            ))}
          </Col>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Col title="Bảng" count={Object.keys(MAP.tables).length}>
            {bySource.map(g => (
              <div key={g.s} className="space-y-1">
                <div className={cn("inline-block rounded border px-1.5 text-[10.5px] mt-1", SRC_STYLE[g.s].chip)}>{SRC_STYLE[g.s].label}</div>
                {g.names.map(n => (
                  <Item key={n} active={n === tableName} onClick={() => setTableName(n === tableName ? null : n)}>
                    <span className="font-mono text-[11px] break-all">{n}</span>
                    <span className="ml-1 text-slate-400">· {MAP.tables[n].tabs.length} tab</span>
                  </Item>
                ))}
              </div>
            ))}
          </Col>
          <Col title="Tab dùng bảng này" count={selTable?.tabs.length}>
            {!selTable && <p className="text-xs text-slate-400 px-1">Chọn một bảng</p>}
            {selTable?.tabs.map(id => {
              const t = MAP.tabs.find(x => x.id === id)
              return t ? <Item key={id}><span className="font-medium">{t.label}</span><span className="ml-1 text-slate-400">{t.group}</span></Item> : null
            })}
          </Col>
          <Col title="API đọc/ghi bảng này" count={selTable?.apis.length}>
            {selTable?.apis.map(p => {
              const pr = perfOf(p)
              return (
                <Item key={p}>
                  <div className="font-mono text-[11px] break-all">{p.replace("/api/", "")}</div>
                  {pr && <div className={cn("text-[10.5px]", speedTone(pr.computeP95))}>nguội p95 {fmtMs(pr.computeP95)}</div>}
                </Item>
              )
            })}
          </Col>
        </div>
      )}

      {(selApi || selTable) && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-2">
          {selApi && apiPath && (
            <div>
              <div className="font-semibold text-slate-700 font-mono">{apiPath} <span className="text-slate-400 font-normal">{selApi.methods.join(", ")}</span></div>
              <div className="text-slate-500">File: <span className="font-mono">{selApi.file}</span></div>
              <div className="text-slate-500">Cache: {selApi.cacheKey ? <span className="font-mono">{selApi.cacheKey}</span> : "không qua cachedQuery"}
                {selApi.deps.length > 0 && <> · xoá theo chủ đề: {selApi.deps.map(d => <span key={d} className="font-mono mr-1">{d}</span>)}</>}</div>
              {selApi.external.length > 0 && <div className="text-slate-500">Nguồn ngoài: {selApi.external.join(", ")}</div>}
              {(() => { const pr = perfOf(apiPath); return pr ? (
                <div className="text-slate-600">Đo 3 ngày: phục vụ p95 <b>{fmtMs(pr.serveP95)}</b> · tính nguội p50 <b>{fmtMs(pr.computeP50)}</b> / p95 <b className={speedTone(pr.computeP95)}>{fmtMs(pr.computeP95)}</b> · {pr.computes} lần tính lại</div>
              ) : null })()}
            </div>
          )}
          {selTable && tableName && (
            <div>
              <div className="font-semibold text-slate-700 font-mono">{tableName}
                <span className={cn("ml-2 rounded border px-1 text-[10px] font-sans font-normal", SRC_STYLE[selTable.source].chip)}>{SRC_STYLE[selTable.source].label}</span>
              </div>
              <div className="text-slate-500">{desc ? desc.description : "Chưa có mô tả (thêm vào lib/data-lineage.ts)."}{desc?.updateFreq ? ` · cập nhật: ${desc.updateFreq}` : ""}</div>
              <div className="text-slate-500">Dùng bởi {selTable.tabs.length} tab, {selTable.apis.length} API.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
