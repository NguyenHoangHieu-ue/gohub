"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Save, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { fc } from "@/lib/quarterly-format"
import type { QReport } from "@/lib/quarterly-types"
import {
  SEGMENTS, ROW_DEFS, METRICS, extractQuarter, isQuarterReliable, effectiveTargets, sumVals, addVals, cellOf, relChange, quartersBefore,
  type Segment, type Vals, type CompanyTargets,
} from "@/lib/quarterly-company-view"

// View "Performance": bảng Q trước | tháng + quý đang xem (Pro-rata) | target tháng quý sau | cả năm — cho ALL / B2B / B2C.
// Số thực tế lấy từ /api/analytics/quarterly-report (cùng route + bộ lọc với tab Tổng quan); target nhập tay lưu ở
// /api/analytics/company-monthly-targets. %QoQ tính TƯƠNG ĐỐI (kể cả dòng %), đúng quy ước file Excel của Hiếu.

interface Props {
  selQ: string
  selYear: number
  companyCode: string
  includeShip: boolean
  includeInternalOps: boolean
  report: QReport | null
  /** Page đang tải lại báo cáo (đổi quý/bộ lọc) — ẩn số cũ để không hiện nhầm quý khác. */
  reportLoading?: boolean
  canEdit: boolean
}

interface Col {
  id: string
  kind: "q" | "cur" | "month" | "tgt" | "next" | "year" | "qoq" | "gap"
  header: string
  tag?: string
  vals?: Vals
  /** kind = qoq: a = kỳ mới, b = kỳ cũ. */
  a?: Vals
  b?: Vals
}

const NEXT_FIELDS = ["rev", "gp", "cm1", "hk3rev"] as const
type Field = typeof NEXT_FIELDS[number]
const FIELD_LABEL: Record<Field, string> = { rev: "Revenue", gp: "GP", cm1: "CM1", hk3rev: "3HK Rev" }
type Draft = Record<Segment, Record<Field, string[]>>
const emptyDraft = (): Draft => Object.fromEntries(SEGMENTS.map(s =>
  [s, Object.fromEntries(NEXT_FIELDS.map(f => [f, ["", "", ""]]))])) as Draft

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "")
const showDigits = (v: string) => (v ? Number(v).toLocaleString("vi-VN") : "")
const pad = (n: number) => String(n).padStart(2, "0")

// Độ rộng cột CỐ ĐỊNH (table-fixed) — 3 khối ALL/B2B/B2C dùng chung bộ cột nên luôn thẳng hàng nhau.
const COL_W: Record<Col["kind"], number> = { q: 108, month: 100, tgt: 100, cur: 118, next: 118, year: 118, qoq: 60, gap: 10 }
const LABEL_W = 120
const widthOf = (c: Col) => (c.kind === "qoq" && c.header.length > 6 ? 92 : COL_W[c.kind])

export function CompanyPerformanceView({ selQ, selYear, companyCode, includeShip, includeInternalOps, report, reportLoading, canEdit }: Props) {
  const q = parseInt(selQ.replace("Q", ""), 10)
  const prevQs = quartersBefore(q)
  const nextQ = q === 4 ? 1 : q + 1
  const nextYear = q === 4 ? selYear + 1 : selYear
  const nextLabel = `Q${nextQ}-${nextYear}`
  const curLabel = `${selQ}-${selYear}`

  // Kết quả các quý trước kèm khoá bộ lọc đã dùng — chỉ dùng khi khoá còn khớp (tránh hiện số của bộ lọc cũ).
  const prevKey = `${selQ}|${selYear}|${companyCode}|${includeShip ? 1 : 0}|${includeInternalOps ? 1 : 0}`
  const [prevState, setPrevState] = useState<{ key: string; data: Record<number, QReport> }>({ key: "", data: {} })
  const prevReports = prevState.data
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [targets, setTargets] = useState<CompanyTargets>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Các quý trước trong năm — mỗi quý 1 request (route đã cache); đổi filter → huỷ kết quả cũ.
  useEffect(() => {
    if (prevQs.length === 0) { setPrevState({ key: prevKey, data: {} }); return }
    let cancelled = false
    setLoading(true); setErr(null)
    Promise.all(prevQs.map(async n => {
      const p = new URLSearchParams({ quarter: `Q${n}`, year: String(selYear), companyCode })
      if (includeShip) p.set("includeShip", "1")
      if (includeInternalOps) p.set("includeInternalOps", "1")
      const res = await fetch(`/api/analytics/quarterly-report?${p}`)
      if (!res.ok) throw new Error(`Q${n}: ${res.status}`)
      return [n, (await res.json()) as QReport] as const
    }))
      .then(list => { if (!cancelled) setPrevState({ key: prevKey, data: Object.fromEntries(list) }) })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // prevQs suy ra từ selQ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selQ, selYear, companyCode, includeShip, includeInternalOps])

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/company-monthly-targets?quarter=Q${nextQ}&year=${nextYear}`)
      if (res.ok) setTargets((await res.json()).targets ?? {})
    } catch { /* để trống */ }
  }, [nextQ, nextYear])
  useEffect(() => { loadTargets() }, [loadTargets])

  const eff = useMemo(() => effectiveTargets(targets), [targets])
  const ready = !!report && report.quarter === selQ && report.year === selYear && !reportLoading && (prevQs.length === 0 || prevState.key === prevKey)

  const colsBySeg = useMemo(() => {
    const out = {} as Record<Segment, Col[]>
    for (const seg of SEGMENTS) {
      const cols: Col[] = []
      const prevData = prevQs.map(n => ({ n, d: extractQuarter(prevReports[n], seg) }))
      prevData.forEach(({ n, d }, i) => {
        if (i > 0) cols.push({ id: `qoq-p${n}`, kind: "qoq", header: "%QoQ", a: d.total, b: prevData[i - 1].d.total })
        cols.push({ id: `q${n}`, kind: "q", header: `Q${n}-${selYear}`, vals: d.total })
      })
      cols.push({ id: "gap1", kind: "gap", header: "" })
      const cur = extractQuarter(report, seg)
      const months = [0, 1, 2].map(i => `${selYear}-${pad((q - 1) * 3 + i + 1)}`)
      // Quý đang xem chưa đủ tin cậy (thiếu tháng / tháng đang chạy chưa chiếu) → không so QoQ, không cộng cả năm (tránh số sai).
      const reliable = isQuarterReliable(report, months)
      const curForCmp: Vals = reliable ? cur.total : {}
      const anyProjected = (report?.summary ?? []).some(m => m.isProjected)
      months.forEach(m => {
        const sm = report?.summary?.find(x => x.month === m)
        cols.push({ id: `m${m}`, kind: "month", header: String(parseInt(m.split("-")[1], 10)),
          tag: sm?.isProjected ? "pro-rata" : undefined, vals: cur.months[m] })
      })
      cols.push({ id: "cur", kind: "cur", header: curLabel, tag: !reliable ? "chưa đủ dữ liệu" : anyProjected ? "PR" : undefined, vals: cur.total })
      if (prevData.length > 0) cols.push({ id: "qoq-cur", kind: "qoq", header: "%QoQ", a: curForCmp, b: prevData[prevData.length - 1].d.total })
      cols.push({ id: "gap2", kind: "gap", header: "" })
      const tm = eff[seg]
      const nextMonths = [0, 1, 2].map(i => (nextQ - 1) * 3 + i + 1)
      nextMonths.forEach((mn, i) => cols.push({ id: `t${mn}`, kind: "tgt", header: String(mn), tag: "target", vals: tm[i] }))
      const nextTotal = sumVals(tm)
      cols.push({ id: "next", kind: "next", header: nextLabel, vals: nextTotal })
      cols.push({ id: "qoq-next", kind: "qoq", header: "Target +%QoQ", a: nextTotal, b: curForCmp })
      // Cả năm: chỉ khi đã có đủ quý (≥ Q3) — Q4 đang xem = đủ 4 quý; Q3 = Q1+Q2+Q3+target Q4.
      if (q >= 3) {
        let year: Vals = cur.total
        for (const { d } of prevData) year = addVals(year, d.total)
        if (q < 4) year = addVals(year, nextTotal)
        const complete = reliable && (q === 4 || METRICS.every(k => nextTotal[k] != null))
        cols.push({ id: "year", kind: "year", header: String(selYear), tag: complete ? undefined : reliable ? "chưa đủ target" : "chưa đủ dữ liệu", vals: complete ? year : {} })
      }
      out[seg] = cols
    }
    return out
  }, [prevReports, report, eff, q, selYear, curLabel, nextLabel, nextQ, prevQs])

  const openEdit = () => {
    const d = emptyDraft()
    for (const seg of SEGMENTS) for (const f of NEXT_FIELDS)
      d[seg][f] = [0, 1, 2].map(i => { const v = targets[seg]?.[f]?.[i] ?? 0; return v > 0 ? String(v) : "" })
    setDraft(d); setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = Object.fromEntries(SEGMENTS.map(s => [s, Object.fromEntries(NEXT_FIELDS.map(f =>
        [f, draft[s][f].map(v => Math.round(Number(v) || 0))]))]))
      const r = await fetch("/api/analytics/company-monthly-targets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter: `Q${nextQ}`, year: nextYear, targets: body }),
      })
      let d: any = {}
      try { d = await r.json() } catch { /* non-JSON */ }
      if (r.ok) { setEditing(false); setMsg({ ok: true, text: `Đã lưu target ${nextLabel}` }); await loadTargets() }
      else setMsg({ ok: false, text: d.error || `Lỗi ${r.status}` })
    } catch (e: any) { setMsg({ ok: false, text: `Lỗi kết nối: ${e.message}` }) }
    finally { setSaving(false); setTimeout(() => setMsg(null), 3000) }
  }

  const setCell = (seg: Segment, f: Field, i: number, v: string) =>
    setDraft(prev => ({ ...prev, [seg]: { ...prev[seg], [f]: prev[seg][f].map((x, j) => (j === i ? digitsOnly(v) : x)) } }))

  const fmtVal = (isPct: boolean, x: number | undefined) => (x == null ? "—" : isPct ? `${x.toFixed(1)}%` : fc(x))

  const th = "px-2 py-2 text-center text-[11px] font-bold whitespace-nowrap"
  const headTone = (k: Col["kind"]) =>
    k === "month" || k === "tgt" ? "bg-amber-50 text-slate-700"
      : k === "qoq" ? "bg-slate-50 text-slate-500"
      : "bg-[#0f4c81]/10 text-[#0f4c81]"

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900">Performance — {curLabel} <span className="text-slate-400 font-semibold">· {companyCode === "ALL" ? "Toàn công ty" : companyCode}</span></h2>
            <p className="text-xs text-slate-400 mt-0.5">Quý trước · từng tháng (tháng đang chạy hiện Pro-rata) · target {nextLabel} · cả năm</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-[#0f4c81]" />}
            {canEdit && (
              <button onClick={() => (editing ? setEditing(false) : openEdit())}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                  editing ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-600")}>
                <Pencil className="w-3.5 h-3.5" />Target {nextLabel}
              </button>
            )}
          </div>
        </div>
        {msg && <div className={cn("px-5 py-2 text-xs", msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.text}</div>}
        {err && <div className="px-5 py-2 text-xs bg-red-50 text-red-700">Không tải được số liệu quý trước ({err}). Hiếu đang fix, vui lòng đợi.</div>}

        {editing && (
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            <p className="text-xs text-slate-500">
              Nhập target từng tháng của {nextLabel} (VND). Để trống ALL = tự cộng B2B + B2C.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 uppercase text-[10px]">
                    <th className="px-3 py-2 text-left font-semibold">Nhóm</th>
                    <th className="px-3 py-2 text-left font-semibold">Chỉ số</th>
                    {[0, 1, 2].map(i => <th key={i} className="px-3 py-2 text-right font-semibold">T{(nextQ - 1) * 3 + i + 1} (VND)</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {SEGMENTS.flatMap(seg => NEXT_FIELDS.map((f, fi) => (
                    <tr key={`${seg}-${f}`} className={fi === 0 ? "border-t-2 border-slate-100" : ""}>
                      <td className="px-3 py-1.5 font-semibold text-slate-700">{fi === 0 ? seg : ""}</td>
                      <td className="px-3 py-1.5 text-slate-500">{FIELD_LABEL[f]}</td>
                      {[0, 1, 2].map(i => (
                        <td key={i} className="px-3 py-1.5 text-right">
                          <input value={showDigits(draft[seg][f][i])} onChange={e => setCell(seg, f, i, e.target.value)} placeholder="0"
                            className="w-36 px-2 py-1 text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81]" />
                        </td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 text-sm bg-[#0f4c81] text-white rounded-lg hover:bg-[#0a3560] disabled:opacity-50 transition-colors">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Đang lưu…" : "Lưu target"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Huỷ</button>
            </div>
          </div>
        )}

        {!ready ? (
          <div className="py-12 text-center text-slate-400 text-sm">Đang tải dữ liệu…</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {SEGMENTS.map(seg => {
              const cols = colsBySeg[seg]
              return (
                <div key={seg} className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs table-fixed" style={{ minWidth: LABEL_W + cols.reduce((s, c) => s + widthOf(c), 0) }}>
                    <colgroup>
                      <col style={{ width: LABEL_W }} />
                      {cols.map(c => <col key={c.id} style={{ width: widthOf(c) }} />)}
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="sticky left-0 z-10 bg-amber-50 px-4 py-2 text-left text-[12px] font-bold text-slate-900 truncate">{seg}</th>
                        {cols.map(c => c.kind === "gap"
                          ? <th key={c.id} className="w-3 bg-slate-100" aria-hidden />
                          : (
                            <th key={c.id} className={cn(th, headTone(c.kind))}>
                              {c.header}
                              {c.tag && <span className={cn("ml-1 text-[9px] font-semibold", c.kind === "tgt" || c.tag.startsWith("chưa") ? "text-amber-600" : "text-blue-600")}>({c.tag})</span>}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ROW_DEFS.map(row => {
                        const isPct = !row.metric
                        const isCm1 = row.metric === "cm1" || row.num === "cm1"
                        return (
                          <tr key={row.key} className={cn("border-b border-slate-100", isPct ? "h-8 bg-slate-50/60" : "h-11")}>
                            <td className={cn("sticky left-0 z-10 px-4 py-2 whitespace-nowrap bg-blue-50",
                              isPct ? "pl-7 font-medium text-slate-500" : "font-semibold text-slate-800")}>{row.label}</td>
                            {cols.map(c => {
                              if (c.kind === "gap") return <td key={c.id} className="w-3 bg-slate-100" aria-hidden />
                              if (c.kind === "qoq") {
                                const v = relChange(cellOf(row, c.a ?? {}), cellOf(row, c.b ?? {}))
                                return (
                                  <td key={c.id} className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap font-semibold",
                                    v == null ? "text-slate-300" : v >= 0 ? "text-emerald-700 bg-emerald-50/60" : "text-orange-700 bg-orange-50/70")}>
                                    {v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                                  </td>
                                )
                              }
                              const v = c.vals ? cellOf(row, c.vals) : undefined
                              const strong = c.kind === "cur" || c.kind === "next" || c.kind === "year"
                              return (
                                <td key={c.id} className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap",
                                  strong && "font-bold bg-[#0f4c81]/5",
                                  v == null ? "text-slate-300" : isCm1 && v < 0 ? "text-red-600" : isPct ? "text-slate-600 text-[11px]" : "text-slate-800")}>
                                  {fmtVal(isPct, v)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        <p className="px-5 py-2 text-[10px] text-slate-400 border-t border-slate-100">
          Số thực tế = báo cáo Quarter Report (cùng bộ lọc VN/US, Phí ship, Đơn nội bộ). Tháng đang chạy hiện Pro-rata; cột quý = tổng các tháng.
          CM1 gồm chi phí KH B2B + group cost + chi phí kênh B2C. %QoQ = thay đổi tương đối (mới − cũ)/|cũ|, cả dòng %.
          Cột {selYear} = các quý trước + quý đang xem + target {nextLabel}{q === 4 ? "" : " (cần nhập đủ target mới hiện)"}; chỉ hiện từ Q3.
        </p>
      </div>
    </div>
  )
}
