"use client"

// Tính giá vốn gói data — dành cho sale (low-tech): chọn loại SIM → nước → gói + số ngày, hệ thống tự tính.
// Chỉ hiện tên gói và các cột giá; không có mã SKU/Product, ProductID hay file import (đó là chức năng "Tạo sản phẩm").
import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Copy, Plus, Search, Trash2 } from "lucide-react"
import type { Destination, QuoteResult, QuoteRow } from "@/lib/product-tools/quote"

type Sim = "eSIM" | "SIM"
type Kind = "Daily" | "Fixed" | "Unlimited"
interface UnlOpt { amount: number; unit: "GB" | "MB"; speedMbps: number; label: string }
interface Options { destinations: Destination[]; unlimited: UnlOpt[]; fx: { month?: string; hkdPerUsd: number; vndPerUsd: number }; missing: string[] }
interface PlanRow { id: number; kind: Kind; amount: string; unit: "GB" | "MB"; unlIdx: number; days: number[] }

const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7, 10, 14, 15, 20, 25, 30]
const DEFAULT_DAYS = [3, 5, 7, 10, 15, 30]
const KIND_META: Record<Kind, { label: string; hint: string }> = {
  Daily: { label: "Theo ngày", hint: "Mỗi ngày được dùng tối đa số GB đã chọn (sang ngày mới được cấp lại)." },
  Fixed: { label: "Cố định", hint: "Một lượng data cố định dùng trong suốt thời gian đã chọn." },
  Unlimited: { label: "Không giới hạn", hint: "Mỗi ngày dùng tốc độ cao đến mức đã chọn, sau đó giảm tốc nhưng vẫn dùng tiếp." },
}
const DATA_CHOICES: Record<Exclude<Kind, "Unlimited">, string[]> = {
  Daily: ["500|MB", "1|GB", "1.5|GB", "2|GB", "3|GB", "5|GB", "10|GB"],
  Fixed: ["1|GB", "2|GB", "3|GB", "5|GB", "10|GB", "15|GB", "20|GB", "30|GB", "50|GB", "100|GB"],
}
const CUSTOM = "custom"

let rowSeq = 1
const newRow = (kind: Kind = "Daily"): PlanRow => ({ id: rowSeq++, kind, amount: kind === "Fixed" ? "5" : "1", unit: "GB", unlIdx: 0, days: kind === "Unlimited" ? [3, 5, 7, 10] : DEFAULT_DAYS.slice(0, 3) })

const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const vnd = (n: number) => n.toLocaleString("vi-VN")
const dataLabel = (amount: number | string, unit: string) => `${amount} ${unit}`

const card = "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5"
const stepTitle = "flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-slate-100 mb-3"
const stepNo = "inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold"
const field = "px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"

/** Nhà mạng: nhóm nhiều nước thì gập gọn thành 1 dòng, bấm để xem đủ từng nước. */
function OperatorCell({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const lines = text.split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean)
  if (lines.length <= 1) return <span>{lines[0] ?? ""}</span>
  return (
    <div className="max-w-[200px]">
      <button onClick={() => setOpen(o => !o)} className="text-left text-brand-700 hover:underline">
        {open ? "Thu gọn ▲" : `${lines.length} nước · xem nhà mạng ▼`}
      </button>
      {open && <ul className="mt-1 space-y-0.5 max-h-48 overflow-auto pr-1">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  )
}

export default function PriceCalc() {
  const [opts, setOpts] = useState<Options | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [sim, setSim] = useState<Sim>("eSIM")
  const [destKey, setDestKey] = useState("")
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<"single" | "group">("single")
  const [rows, setRows] = useState<PlanRow[]>([newRow()])
  const [includeData, setIncludeData] = useState(false)
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [calcErr, setCalcErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    fetch("/api/product-tools/options", { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Không tải được dữ liệu"); setOpts(j) })
      .catch(e => setLoadErr((e as Error).message))
  }, [])

  const dest = useMemo(() => opts?.destinations.find(d => d.key === destKey) ?? null, [opts, destKey])
  const shown = useMemo(() => {
    if (!opts) return []
    const q = search.trim().toLowerCase()
    return opts.destinations.filter(d => d.vendors[sim].length > 0 && d.region === (scope === "group") && (!q || d.label.toLowerCase().includes(q))).slice(0, 80)
  }, [opts, sim, search, scope])
  const counts = useMemo(() => {
    const c = { single: 0, group: 0 }
    for (const d of opts?.destinations ?? []) if (d.vendors[sim].length > 0) c[d.region ? "group" : "single"]++
    return c
  }, [opts, sim])

  // Đổi loại SIM: giữ nước nếu vẫn có bán, không thì bỏ chọn
  useEffect(() => { if (dest && dest.vendors[sim].length === 0) setDestKey("") }, [sim, dest])

  const patchRow = (id: number, p: Partial<PlanRow>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))

  const request = useMemo(() => {
    if (!opts || !destKey) return null
    const plans = rows.map(r => {
      if (r.kind === "Unlimited") {
        const u = opts.unlimited[r.unlIdx]
        return u ? { kind: r.kind, amount: u.amount, unit: u.unit, speedMbps: u.speedMbps, days: r.days } : null
      }
      const amount = parseFloat(r.amount.replace(",", "."))
      return amount > 0 ? { kind: r.kind, amount, unit: r.unit, days: r.days } : null
    })
    if (!plans.some(p => p && p.days.length)) return null
    return { destKey, sim, includeDataOnly: includeData, plans: plans.map(p => p ?? { kind: "Daily", amount: 0, unit: "GB", days: [] }) }
  }, [opts, destKey, rows, sim, includeData])

  // Tự tính khi đủ thông tin (chờ 0,4 giây sau lần chỉnh cuối)
  useEffect(() => {
    if (!request) { setResult(null); setCalcErr(null); return }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/product-tools/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) })
        const j = await r.json()
        if (mine !== seq.current) return
        if (!r.ok) { setCalcErr(j.error || "Không tính được giá"); setResult(null) } else { setResult(j); setCalcErr(null) }
      } catch {
        if (mine === seq.current) { setCalcErr("Lỗi mạng hoặc máy chủ phản hồi chậm — bấm \"Tính lại\" để thử lại"); setResult(null) }
      } finally { if (mine === seq.current) setLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [request])

  const recalc = () => setRows(rs => [...rs])   // đổi tham chiếu → chạy lại hiệu ứng tính

  const planName = (r: QuoteRow) => {
    const simLabel = sim === "eSIM" ? "eSIM" : "SIM"
    const kind = r.kind === "Unlimited"
      ? `Không giới hạn ${dataLabel(r.dataAmount, r.unit)} tốc độ cao + ${r.speedMbps ?? 10}Mbps`
      : `${r.kind === "Daily" ? "Theo ngày" : "Cố định"} ${dataLabel(r.dataAmount, r.unit)}`
    const form = r.form === "data" ? " (chỉ gói data rời)" : ""
    return `${simLabel} ${result?.short ?? ""} · ${kind} · ${r.days} ngày${form}`
  }

  // Nhóm theo (dòng gói, số ngày, loại) → đánh dấu nhà cung cấp rẻ nhất (theo giá vốn VN)
  const groups = useMemo(() => {
    const m = new Map<string, QuoteRow[]>()
    for (const r of result?.rows ?? []) {
      const k = `${r.planIdx}|${r.days}|${r.form}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => { const [ap, ad] = a.split("|").map(Number), [bp, bd] = b.split("|").map(Number); return ap - bp || ad - bd || a.localeCompare(b) })
      .map(([k, rs]) => ({ key: k, rows: [...rs].sort((x, y) => x.cogsVnd - y.cogsVnd), cheapest: Math.min(...rs.filter(x => !x.note).map(x => x.cogsVnd), Infinity) }))
  }, [result])

  const copyTable = async () => {
    const head = ["Gói", "Nhà cung cấp", "Nhà mạng", "Giá/GB", "Data (USD)", "Phí khung", "Giá vốn US (USD)", "Giá vốn VN (VND)"]
    const lines = groups.flatMap(g => g.rows.map(r => [planName(r), r.vendorLabel, r.operator.replace(/\n/g, "; "), `${r.pricePerGb} ${r.currency}`, usd(r.dataUsd), r.feeVnd ? `${vnd(r.feeVnd)} đ` : usd(r.feeUsd), r.usApplicable ? usd(r.cogsUsd) : "—", vnd(r.cogsVnd)].join("\t")))
    try { await navigator.clipboard.writeText([head.join("\t"), ...lines].join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCalcErr("Không sao chép được — hãy bôi đen bảng và Ctrl+C") }
  }

  if (loadErr) return <div className="text-sm text-red-600">Hiếu đang fix, vui lòng đợi ({loadErr})</div>
  if (!opts) return <div className="text-sm text-gray-400 py-6">Đang tải...</div>

  return (
    <div className="space-y-4">
      {opts.missing.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900 flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />Thiếu dữ liệu: {opts.missing.join(", ")} — một số nước hoặc nhà cung cấp chưa tính được. Báo Hiếu cập nhật.</div>
      )}

      <div className={card}>
        <div className={stepTitle}><span className={stepNo}>1</span>Chọn loại SIM</div>
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          {([["eSIM", "eSIM", "Cài bằng mã QR, không cần thẻ"], ["SIM", "SIM thẻ", "Thẻ SIM vật lý giao tận tay"]] as const).map(([v, t, d]) => (
            <button key={v} onClick={() => setSim(v)} className={`text-left p-3 rounded-xl border-2 transition ${sim === v ? "border-brand-600 bg-brand-50 dark:bg-brand-950/30" : "border-gray-200 dark:border-slate-700 hover:border-gray-300"}`}>
              <div className="font-semibold text-gray-900 dark:text-slate-100">{t}</div><div className="text-xs text-gray-500 mt-0.5">{d}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className={stepTitle}><span className={stepNo}>2</span>Chọn nước / khu vực</div>
        <div className="grid grid-cols-2 gap-3 max-w-xl mb-3">
          {([["single", "Một nước", `${counts.single} nước`, "VD: Nhật Bản, Thái Lan"], ["group", "Nhóm nước", `${counts.group} nhóm`, "Một gói dùng được ở nhiều nước"]] as const).map(([v, t, n, d]) => (
            <button key={v} onClick={() => { setScope(v); setSearch(""); if (dest && dest.region !== (v === "group")) setDestKey("") }} className={`text-left p-3 rounded-xl border-2 transition ${scope === v ? "border-brand-600 bg-brand-50 dark:bg-brand-950/30" : "border-gray-200 dark:border-slate-700 hover:border-gray-300"}`}>
              <div className="font-semibold text-gray-900 dark:text-slate-100">{t} <span className="text-xs font-normal text-gray-400">· {n}</span></div><div className="text-xs text-gray-500 mt-0.5">{d}</div>
            </button>
          ))}
        </div>
        <div className="relative max-w-xl">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={scope === "group" ? "Gõ tên nhóm hoặc tên một nước trong nhóm (VD: Asia, Japan, EU...)" : "Gõ tên nước để tìm (VD: Japan, Thailand...)"} className={`${field} w-full pl-9`} />
        </div>
        <div className="mt-2 max-h-56 overflow-auto border border-gray-200 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-800">
          {shown.length === 0 && <div className="p-3 text-sm text-gray-400">{scope === "group" ? "Không có nhóm nước nào khớp." : "Không có nước nào khớp. Thử gõ tên tiếng Anh."}</div>}
          {shown.map(d => (
            <button key={d.key} onClick={() => setDestKey(d.key)} className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-slate-800 ${destKey === d.key ? "bg-brand-50 dark:bg-brand-950/30 font-semibold" : ""}`}>
              <span className="flex items-center gap-1.5 min-w-0">{destKey === d.key && <Check size={14} className="text-brand-600 shrink-0" />}<span className="truncate">{d.label}</span></span>
              <span className="text-[12px] text-gray-400 shrink-0">{d.vendors[sim].map(v => (v === "THK" ? "3HK" : v === "CMHK" ? "BC-CMHK" : "BC-Singtel")).join(" · ")}</span>
            </button>
          ))}
        </div>
        {dest && <div className="mt-2 text-sm text-gray-700 dark:text-slate-300">Đã chọn: <b>{dest.short}</b>{dest.region && <span className="text-gray-500"> ({(/\((.+)\)\s*$/.exec(dest.label)?.[1] ?? dest.label.replace(/^.*? — /, "")).slice(0, 110)}…)</span>}{dest.kyc && <span className="ml-2 text-red-600 font-semibold">⚠ Có nhà mạng cần KYC (xác minh danh tính khách)</span>}</div>}
      </div>

      <div className={card}>
        <div className={stepTitle}><span className={stepNo}>3</span>Chọn gói và số ngày</div>
        {!dest && <div className="text-sm text-gray-400 mb-2">Chọn nước ở bước 2 trước.</div>}
        <div className="space-y-3">
          {rows.map(r => {
            const dataVal = r.kind === "Unlimited" ? "" : `${r.amount}|${r.unit}`
            const inChoices = r.kind !== "Unlimited" && DATA_CHOICES[r.kind].includes(dataVal)
            return (
              <div key={r.id} className="border border-gray-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600">
                    {(Object.keys(KIND_META) as Kind[]).map(k => (
                      <button key={k} onClick={() => patchRow(r.id, k === r.kind ? {} : { kind: k, amount: k === "Fixed" ? "5" : "1", unit: "GB", unlIdx: 0, days: k === "Unlimited" ? [3, 5, 7, 10] : r.days })}
                        className={`px-3 py-1.5 text-sm ${r.kind === k ? "bg-brand-600 text-white font-semibold" : "bg-white dark:bg-slate-800 text-gray-700 hover:bg-gray-50"}`}>{KIND_META[k].label}</button>
                    ))}
                  </div>
                  {rows.length > 1 && <button onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} className="ml-auto text-gray-400 hover:text-red-600" title="Xoá gói này"><Trash2 size={16} /></button>}
                </div>
                <div className="text-xs text-gray-500">{KIND_META[r.kind].hint}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.kind === "Unlimited" ? (
                    <select className={field} value={r.unlIdx} onChange={e => patchRow(r.id, { unlIdx: Number(e.target.value) })}>
                      {opts.unlimited.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
                    </select>
                  ) : (
                    <>
                      <select className={field} value={inChoices ? dataVal : CUSTOM} onChange={e => { if (e.target.value === CUSTOM) patchRow(r.id, { amount: "", unit: "GB" }); else { const [a, u] = e.target.value.split("|"); patchRow(r.id, { amount: a, unit: u as "GB" | "MB" }) } }}>
                        {DATA_CHOICES[r.kind].map(v => { const [a, u] = v.split("|"); return <option key={v} value={v}>{a} {u}{r.kind === "Daily" ? " / ngày" : ""}</option> })}
                        <option value={CUSTOM}>Nhập số khác…</option>
                      </select>
                      {!inChoices && (
                        <span className="inline-flex gap-1">
                          <input className={`${field} w-24`} inputMode="decimal" placeholder="VD 2.5" value={r.amount} onChange={e => patchRow(r.id, { amount: e.target.value })} />
                          <select className={field} value={r.unit} onChange={e => patchRow(r.id, { unit: e.target.value as "GB" | "MB" })}><option>GB</option><option>MB</option></select>
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1.5">Số ngày (bấm để chọn nhiều)</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DAY_CHOICES.map(d => {
                      const on = r.days.includes(d)
                      return <button key={d} onClick={() => patchRow(r.id, { days: on ? r.days.filter(x => x !== d) : [...r.days, d].sort((a, b) => a - b) })}
                        className={`min-w-[38px] px-2 py-1 text-sm border rounded-lg ${on ? "bg-brand-600 border-brand-600 text-white font-semibold" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>{d}</button>
                    })}
                    <button onClick={() => patchRow(r.id, { days: [...DEFAULT_DAYS] })} className="ml-1 px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Ngày hay dùng</button>
                    <button onClick={() => patchRow(r.id, { days: [] })} className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Bỏ hết</button>
                  </div>
                  {r.days.length === 0 && <div className="mt-1 text-xs text-amber-700">Chọn ít nhất 1 số ngày.</div>}
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={() => setRows(rs => [...rs, newRow()])} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50"><Plus size={14} /> Thêm gói khác</button>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className={`${stepTitle} mb-0`}><span className={stepNo}>4</span>Giá vốn</div>
          {loading && <span className="text-xs text-gray-400">Đang tính…</span>}
          <button onClick={recalc} disabled={!request || loading} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Tính lại</button>
          <button onClick={copyTable} disabled={!result?.rows.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">{copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}{copied ? "Đã sao chép" : "Sao chép bảng (dán vào Excel)"}</button>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 ml-auto cursor-pointer"><input type="checkbox" checked={includeData} onChange={e => setIncludeData(e.target.checked)} /> Hiện cả gói data rời (không kèm {sim === "eSIM" ? "eSIM" : "thẻ SIM"})</label>
        </div>

        {!request && <div className="text-sm text-gray-400">Chọn đủ loại SIM, nước, gói và số ngày — giá sẽ hiện ở đây.</div>}
        {calcErr && <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-sm text-red-700 mb-3">{calcErr}</div>}
        {result && result.notes.length > 0 && (
          <ul className="mb-3 p-3 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900 list-disc pl-6 space-y-0.5">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        )}
        {result && result.rows.length > 0 && (
          <>
            <div className="overflow-auto border border-gray-200 dark:border-slate-700 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800 text-xs text-gray-600">
                  <tr>{["Gói", "Nhà cung cấp", "Nhà mạng", "Giá/GB", "Data (USD)", "Phí khung", "Giá vốn US (USD)", "Giá vốn VN (VND)"].map((h, i) => <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {groups.flatMap(g => g.rows.map((r, i) => {
                    const best = !r.note && r.cogsVnd === g.cheapest && g.rows.filter(x => !x.note).length > 1
                    const ex = typeof r.explain === "string" ? r.explain : Object.values(r.explain).join("\n")
                    return (
                      <tr key={`${g.key}-${r.vendor}-${i}`} className={`border-t border-gray-100 dark:border-slate-800 ${i === 0 ? "border-t-2 border-t-gray-200" : ""} ${best ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                        <td className="px-3 py-2 min-w-[240px]">{i === 0 ? <span className="font-medium">{planName(r)}</span> : <span className="text-gray-300">↳ cùng gói</span>}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.vendorLabel}{best && <span className="ml-1.5 text-[11.5px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold">Rẻ nhất</span>}{r.note && <div className="text-[12px] text-amber-700">{r.note}</div>}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs align-top"><OperatorCell text={r.operator} /></td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{r.pricePerGb} {r.currency}</td>
                        <td className="px-3 py-2 text-right">{usd(r.dataUsd)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{r.feeVnd ? `${vnd(r.feeVnd)} đ` : usd(r.feeUsd)}</td>
                        <td className="px-3 py-2 text-right font-semibold" title={ex}>{r.usApplicable ? usd(r.cogsUsd) : <span className="text-gray-300 font-normal">—</span>}</td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" title={ex}>{vnd(r.cogsVnd)}</td>
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[12px] text-gray-400">Giá vốn đã làm tròn lên theo công thức nội bộ, tính bằng tỷ giá tháng {opts.fx.month ? `${opts.fx.month.slice(5)}/${opts.fx.month.slice(0, 4)}` : "hiện tại"} (1 USD = {vnd(opts.fx.vndPerUsd)} VND). Rê chuột vào giá vốn để xem cách tính. "Rẻ nhất" so theo giá vốn VN giữa các nhà cung cấp bán được gói đó.</div>
          </>
        )}
        {result && result.rows.length === 0 && !calcErr && !loading && <div className="text-sm text-gray-500">Chưa tính được dòng giá nào cho lựa chọn này — xem ghi chú phía trên.</div>}
      </div>
    </div>
  )
}
