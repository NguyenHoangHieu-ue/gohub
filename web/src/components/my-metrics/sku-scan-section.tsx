"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import { Zap, ShieldCheck, Search, Check, X, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProgressBar, SourceBox, DataTable } from "@/components/my-metrics/shared-ui"
import { fck, pct } from "@/lib/my-metrics-format"
import { OKR_GM_BASELINE_DISPLAY } from "@/lib/my-metrics-types"
import type { SkuScanData, SkuScanItem, SkuNote } from "@/lib/my-metrics-types"

const chartLoading = () => <div className="w-full h-full animate-pulse bg-white/10 rounded-xl" />
const SkuMoversChart = dynamic(
  () => import("@/app/(dashboard)/analytics/my-metrics/my-metrics-charts").then(m => m.SkuMoversChart),
  { ssr: false, loading: chartLoading },
)

// ─── SKU Gross Margin — quét toàn hệ thống (thay tag tay) ─────────────────────
export function SkuScanSection({ quarter, targetDelta, onSummary }: { quarter: string; targetDelta: number; onSummary?: (delta: number | null) => void }) {
  const [data, setData] = useState<SkuScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, SkuNote>>({})
  const [locked, setLocked] = useState(false)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [vendorFilter, setVendorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "key" | "new">("all")
  const [editingSku, setEditingSku] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const fetchScan = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/sku-scan?quarter=${quarter}`)
    if (r.ok) { const d = await r.json(); setData(d); onSummary?.(d.weighted_delta) }
    setLoading(false)
  }, [quarter]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotes = useCallback(async () => {
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?quarter=${quarter}`)
    if (r.ok) {
      const d = await r.json()
      setLocked(d.locked)
      const map: Record<string, SkuNote> = {}
      for (const it of (d.items ?? [])) map[it.sku_code] = it
      setNotes(map)
    }
  }, [quarter])

  useEffect(() => { fetchScan(); fetchNotes() }, [fetchScan, fetchNotes])

  const items = data?.items ?? []
  const categories = Array.from(new Set(items.map(it => it.category).filter(Boolean))) as string[]
  const vendors    = Array.from(new Set(items.map(it => it.vendor).filter(Boolean))) as string[]
  const filtered = items.filter(it => {
    if (categoryFilter !== "all" && it.category !== categoryFilter) return false
    if (vendorFilter !== "all" && it.vendor !== vendorFilter) return false
    if (typeFilter === "key" && !it.is_key) return false
    if (typeFilter === "new" && !it.is_new) return false
    if (search.trim() && ![it.sku, it.category, it.vendor].some(v => (v ?? "").toLowerCase().includes(search.trim().toLowerCase()))) return false
    return true
  })

  const saveNote = async (sku: string) => {
    setSavingNote(true)
    const r = await fetch("/api/analytics/my-metrics/sku-tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter, sku_code: sku, note: noteDraft }),
    })
    setSavingNote(false)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi lưu ghi chú"); return }
    setEditingSku(null); setNoteDraft("")
    fetchNotes()
  }

  const removeNote = async (id: string) => {
    if (!confirm("Xoá ghi chú này?")) return
    const r = await fetch(`/api/analytics/my-metrics/sku-tags?id=${id}`, { method: "DELETE" })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi xoá"); return }
    fetchNotes()
  }

  const wd = data?.weighted_delta ?? null

  // Top 5 tăng + top 5 giảm delta GM% trong nhóm tính KPI (key/new) — cho biểu đồ movers.
  const movers = useMemo(() => {
    const scored = items.filter(it => (it.is_key || it.is_new) && it.delta !== null)
    const gainers = [...scored].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5)
    const losers  = [...scored].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5).reverse()
    const merged = [...gainers, ...losers.filter(l => !gainers.some(g => g.sku === l.sku))]
    return merged.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).map(it => ({ sku: it.sku, delta: it.delta ?? 0 }))
  }, [items])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">SKU Gross Margin — quét toàn hệ thống</span>
            <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide"><ShieldCheck className="w-2.5 h-2.5" />Auto · mọi SKU</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="all">Mọi loại</option>
              <option value="key">Chỉ Trọng điểm</option>
              <option value="new">Chỉ Mới</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[140px]">
              <option value="all">Mọi category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[140px]">
              <option value="all">Mọi vendor</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm SKU…"
                className="pl-7 pr-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-36" />
            </div>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-black tabular-nums", loading ? "text-slate-300" : wd === null ? "text-slate-300" : wd >= targetDelta ? "text-emerald-600" : wd >= 0 ? "text-brand-600" : "text-amber-600")}>
            {loading ? "…" : wd !== null ? `${wd >= 0 ? "+" : ""}${wd.toFixed(2)}%` : "—"}
          </span>
          <span className="text-slate-400 text-sm font-bold">weighted, {data ? `${data.scored_count} SKU trọng điểm/mới tính KPI` : "…"}</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Target: +{targetDelta}% · {data ? `${data.key_count} SKU top ${data.key_threshold_pct}% doanh thu · ${data.new_count} SKU mới quý này · ${items.length} SKU có phát sinh` : "…"}
          {filtered.length !== items.length && ` — đang lọc còn ${filtered.length} SKU`}
        </div>
      </div>

      <div className="px-5 py-3 space-y-3">
        {targetDelta > 0 && <ProgressBar actual={Math.max(0, wd ?? 0)} target={targetDelta} />}

        {movers.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Biến động GM% lớn nhất (SKU trọng điểm/mới)</p>
            <div style={{ height: Math.max(160, movers.length * 34) }}>
              <SkuMoversChart data={movers} />
            </div>
          </div>
        )}

        <DataTable<SkuScanItem>
          rows={filtered}
          rowKey={it => it.sku}
          emptyLabel={loading ? "Đang tải…" : "Không có SKU nào khớp."}
          columns={[
            { key: "sku", label: "SKU", render: it => (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-black text-slate-800">{it.sku}</span>
                {it.is_key && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-brand-50 text-brand-600 uppercase">Key</span>}
                {it.is_new && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">Mới</span>}
              </div>
            ) },
            { key: "vendor", label: "Vendor", render: it => <span className="text-slate-500">{it.vendor ?? "—"}</span> },
            { key: "rev_cur", label: "Rev quý này", align: "right", render: it => fck(it.rev_cur) },
            { key: "gm_cur", label: "GM% quý này", align: "right", render: it => it.rev_cur > 0 ? pct(it.gm_pct_cur) : "—" },
            { key: "rev_prev", label: "Rev quý trước", align: "right", render: it => fck(it.rev_prev) },
            { key: "gm_prev", label: "GM% quý trước", align: "right", render: it => it.rev_prev > 0 ? pct(it.gm_pct_prev) : "—" },
            { key: "delta", label: "Δ GM%", align: "right", render: it => it.delta !== null
                ? <span className={cn("font-black", it.delta >= 0 ? "text-emerald-600" : "text-amber-600")}>{it.delta >= 0 ? "+" : ""}{it.delta.toFixed(2)}%</span>
                : <span className="text-slate-300">—</span> },
            { key: "note", label: "Ghi chú", render: it => {
              const n = notes[it.sku]
              if (editingSku === it.sku) return (
                <div className="flex items-center gap-1">
                  <input autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveNote(it.sku)}
                    className="border border-slate-200 rounded px-1.5 py-0.5 text-[10px] w-32" />
                  <button disabled={savingNote} onClick={() => saveNote(it.sku)} className="text-emerald-600"><Check className="w-3 h-3" /></button>
                  <button onClick={() => setEditingSku(null)} className="text-slate-400"><X className="w-3 h-3" /></button>
                </div>
              )
              return (
                <div className="flex items-center gap-1">
                  <button disabled={locked} onClick={() => { setEditingSku(it.sku); setNoteDraft(n?.note ?? "") }}
                    className={cn("text-left hover:text-brand-600 disabled:hover:text-slate-400 truncate max-w-[140px]", n?.note ? "text-slate-600" : "text-slate-300 italic")}>
                    {n?.note || (locked ? "—" : "+ thêm ghi chú")}
                  </button>
                  {n?.note && !locked && (
                    <button onClick={() => removeNote(n.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-2.5 h-2.5" /></button>
                  )}
                </div>
              )
            } },
          ]}
        />
        <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue (toàn bộ SKU, quý này vs quý trước)"
          filter={`GM% = SUM(gross_profit_vnd)/SUM(fulfilled_revenue_amount_vnd) · trọng điểm = top ${data?.key_threshold_pct ?? 80}% doanh thu tích luỹ · mới = so baseline ${OKR_GM_BASELINE_DISPLAY}%`} />
      </div>
    </div>
  )
}
