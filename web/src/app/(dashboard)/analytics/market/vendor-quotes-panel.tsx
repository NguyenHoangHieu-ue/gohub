"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Upload, Sparkles, Loader2, Trash2, X, Plus, FileText, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Panel, EmptyState } from "@/components/dashboard-kit"
import { pctTxt } from "./market-help"
import type { CompareRow } from "@/lib/quote-compare"
import type { QuoteItem, MarketGroupLite } from "@/lib/vendor-quote-extract"

interface VendorQuote {
  id: string; vendor: string; status: "reviewing" | "accepted" | "rejected"; quote_date: string | null; currency: string
  moq: string | null; note: string | null; items: QuoteItem[]; files: { path: string; name: string }[]; created_at: string
}
interface Draft { vendor: string; currency: string; quote_date: string | null; moq: string; note: string; items: QuoteItem[]; warnings: string[] }

const STATUS: Record<VendorQuote["status"], { label: string; cls: string }> = {
  reviewing: { label: "Đang xem xét", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted:  { label: "Đã chọn",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:  { label: "Từ chối",      cls: "bg-slate-100 text-slate-500 border-slate-200" },
}

/** Giá 1 báo giá rẻ hơn mốc hiện tại ở SKU nào (không cần là rẻ nhất trong mọi nguồn). */
export function quoteWins(rows: CompareRow[], sourceId: string) {
  // Chỉ so giá vốn mỗi gói (không nhân số lượng bán): bao nhiêu gói rẻ hơn, rẻ hơn trung bình bao nhiêu %.
  const pcts = rows.map(r => {
    const o = r.offers.find(x => x.source === sourceId)
    return o && r.baseUsd && o.usd < r.baseUsd ? (r.baseUsd - o.usd) / r.baseUsd * 100 : null
  }).filter((x): x is number => x !== null)
  return { skus: pcts.length, avgPct: pcts.length ? pcts.reduce((a, x) => a + x, 0) / pcts.length : 0, covered: rows.filter(r => r.offers.some(x => x.source === sourceId)).length }
}

const inputCls = "w-full rounded-md border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:border-brand-400"

function AddQuoteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [vendor, setVendor] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [groups, setGroups] = useState<MarketGroupLite[]>([])
  const [busy, setBusy] = useState<"read" | "save" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addFiles = (list: FileList | File[] | null) => list && setFiles(f => [...f, ...Array.from(list)])
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"))
    if (imgs.length) { e.preventDefault(); addFiles(imgs.map((f, i) => new File([f], `anh-dan-${Date.now()}-${i}.png`, { type: f.type }))) }
  }

  const read = async () => {
    setBusy("read"); setError(null)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append("files", f)); fd.append("text", text); fd.append("vendor", vendor)
      const r = await fetch("/api/analytics/market/vendor-quotes/extract", { method: "POST", body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setGroups(d.groups ?? [])
      setDraft({ vendor: vendor || d.vendor, currency: d.currency, quote_date: d.quote_date, moq: d.moq, note: d.note, items: d.items, warnings: d.warnings })
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const save = async () => {
    if (!draft) return
    setBusy("save"); setError(null)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append("files", f))
      fd.append("payload", JSON.stringify(draft))
      const r = await fetch("/api/analytics/market/vendor-quotes", { method: "POST", body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const setItem = (i: number, patch: Partial<QuoteItem>) => setDraft(d => d && { ...d, items: d.items.map((it, k) => k === i ? { ...it, ...patch } : it) })
  const numIn = (v: string) => v === "" ? null : Number(v)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 overflow-y-auto" onPaste={onPaste}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Thêm báo giá vendor</h2>
          <button onClick={onClose} aria-label="Đóng"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        {!draft ? (
          <>
            <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Tên vendor (để trống thì AI tự đọc)" className={cn(inputCls, "text-sm py-1.5")} />
            <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
              className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 rounded-lg py-6 cursor-pointer hover:border-brand-300">
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-600">Kéo thả / bấm chọn file — ảnh, PDF, Word, Excel. Dán ảnh (Ctrl+V) ngay trong khung này.</span>
              <input type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={e => addFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs">
                    <FileText className="w-3 h-3" />{f.name}
                    <button onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Bỏ file"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="…hoặc dán nội dung email / tin nhắn báo giá" className={cn(inputCls, "text-sm")} />
            <div className="flex justify-end">
              <button onClick={read} disabled={busy !== null || (!files.length && !text.trim())}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                {busy === "read" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Đọc bằng AI
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <label>Vendor<input value={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.value })} className={inputCls} /></label>
              <label>Tiền tệ<input value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} className={inputCls} /></label>
              <label>Ngày báo giá<input type="date" value={draft.quote_date ?? ""} onChange={e => setDraft({ ...draft, quote_date: e.target.value || null })} className={inputCls} /></label>
              <label>MOQ<input value={draft.moq} onChange={e => setDraft({ ...draft, moq: e.target.value })} className={inputCls} /></label>
              <label>Ghi chú<input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className={inputCls} /></label>
            </div>
            {draft.warnings.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 space-y-0.5">
                {draft.warnings.map((w, i) => <p key={i} className="flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{w}</p>)}
              </div>
            )}
            <p className="text-xs text-slate-500">Máy đọc có thể nhầm số — so lại với file gốc trước khi lưu. Dòng tô vàng là chưa biết dùng ở nước nào: gõ mã nước (JP, KR…) hoặc chọn nhóm nước. Kiểu gói: theo ngày = mỗi ngày được bấy nhiêu GB; trọn gói = tổng GB cả kỳ.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 text-left">
                  <tr>{["Tên gói", "Vùng ghi trong báo giá", "Nước dùng được (mã: JP, KR…)", "Hoặc chọn nhóm nước", "Kiểu gói", "GB", "Số ngày", `Giá eSIM (${draft.currency})`, `Giá SIM (${draft.currency})`, "Có gọi", "Ghi chú", ""].map(h => <th key={h} className="px-1 py-1 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {draft.items.map((it, i) => (
                    <tr key={i} className={cn("border-t border-slate-100", !it.countries.length && !it.market_code && "bg-amber-50")}>
                      <td className="px-1 py-0.5 min-w-[120px]"><input value={it.name} onChange={e => setItem(i, { name: e.target.value })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 min-w-[110px] text-slate-500">{it.region_label}</td>
                      <td className="px-1 py-0.5 min-w-[120px]"><input value={it.countries.join(", ")} onChange={e => setItem(i, { countries: e.target.value.split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean) })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 min-w-[110px]">
                        <select value={it.market_code ?? ""} onChange={e => setItem(i, { market_code: e.target.value || null })} className={inputCls}>
                          <option value="">—</option>
                          {groups.map(g => <option key={g.code} value={g.code}>{g.code} · {g.en.slice(0, 40)}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-0.5">
                        <select value={it.plan} onChange={e => setItem(i, { plan: e.target.value as QuoteItem["plan"] })} className={inputCls}>
                          {[["Daily", "Theo ngày"], ["Fixed", "Trọn gói"], ["Unlimited", "Không giới hạn"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-0.5 w-16"><input type="number" value={it.data_gb} onChange={e => setItem(i, { data_gb: Number(e.target.value) })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 w-14"><input type="number" value={it.days} onChange={e => setItem(i, { days: Number(e.target.value) })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 w-20"><input type="number" value={it.price_esim ?? ""} onChange={e => setItem(i, { price_esim: numIn(e.target.value) })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 w-20"><input type="number" value={it.price_sim ?? ""} onChange={e => setItem(i, { price_sim: numIn(e.target.value) })} className={inputCls} /></td>
                      <td className="px-1 py-0.5 text-center"><input type="checkbox" checked={it.has_call} onChange={e => setItem(i, { has_call: e.target.checked })} /></td>
                      <td className="px-1 py-0.5 min-w-[120px]"><input value={it.note} onChange={e => setItem(i, { note: e.target.value })} className={inputCls} /></td>
                      <td className="px-1"><button onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })} aria-label="Xoá dòng"><Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setDraft({ ...draft, items: [...draft.items, { name: "", countries: [], market_code: null, region_label: "", plan: "Fixed", data_gb: 0, days: 0, price_esim: null, price_sim: null, has_call: false, note: "" }] })}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />Thêm dòng</button>
              <div className="flex gap-2">
                <button onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Đọc lại</button>
                <button onClick={save} disabled={busy !== null || !draft.vendor.trim() || !draft.items.length}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  {busy === "save" && <Loader2 className="w-4 h-4 animate-spin" />}Lưu {draft.items.length} gói
                </button>
              </div>
            </div>
          </>
        )}
        {error && <p className="text-xs text-rose-600">Hiếu đang fix, vui lòng đợi ({error})</p>}
      </div>
    </div>
  )
}

export default function VendorQuotesPanel({ rows, active, onSelect, onChanged }: {
  rows: CompareRow[]; active: string | null
  onSelect: (sourceId: string | null) => void; onChanged: () => void
}) {
  const [quotes, setQuotes] = useState<VendorQuote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch("/api/analytics/market/vendor-quotes")
    const d = await r.json()
    if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return }
    setQuotes(d.quotes); setError(null)
  }, [])
  useEffect(() => { load() }, [load])

  const changed = () => { load(); onChanged() }
  const patch = async (id: string, status: VendorQuote["status"]) => {
    await fetch(`/api/analytics/market/vendor-quotes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    changed()
  }
  const remove = async (q: VendorQuote) => {
    if (!window.confirm(`Xoá hẳn báo giá ${q.vendor} (kèm file gốc)?`)) return
    await fetch(`/api/analytics/market/vendor-quotes/${q.id}`, { method: "DELETE" })
    if (active === `Q:${q.id}`) onSelect(null)
    changed()
  }

  return (
    <Panel title="Báo giá nhà cung cấp gửi về" desc="Nhận được báo giá (ảnh, PDF, Word, Excel, email)? Bấm “Thêm báo giá” — máy tự đọc, bạn kiểm lại rồi lưu. Bấm tên 1 báo giá để xem nó rẻ hơn ở sản phẩm nào."
      action={<button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white"><Plus className="w-3.5 h-3.5" />Thêm báo giá</button>}>
      {error ? <EmptyState message={/vendor_quotes/.test(error) ? "Chưa có bảng vendor_quotes — chạy migration v69 rồi Reload schema." : `Hiếu đang fix, vui lòng đợi (${error})`} />
        : !quotes ? <p className="text-xs text-slate-400">Đang tải…</p>
        : !quotes.length ? <EmptyState message="Chưa có báo giá nào. Bấm “Thêm báo giá”." />
        : (
          <div className="divide-y divide-slate-100">
            {quotes.map(q => {
              const id = `Q:${q.id}`
              const w = quoteWins(rows, id)
              return (
                <div key={q.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 py-2 px-1 rounded-md", active === id && "bg-brand-50")}>
                  <button onClick={() => onSelect(active === id ? null : id)} className="min-w-[180px] text-left">
                    <p className="text-sm font-semibold text-slate-900">{q.vendor}</p>
                    <p className="text-[11px] text-slate-400">{q.quote_date ?? q.created_at.slice(0, 10)} · {q.items.length} gói · {q.currency}{q.moq ? ` · MOQ ${q.moq}` : ""}</p>
                  </button>
                  <select value={q.status} onChange={e => patch(q.id, e.target.value as VendorQuote["status"])}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS[q.status].cls)}>
                    {(Object.keys(STATUS) as VendorQuote["status"][]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
                  </select>
                  <span className="text-xs text-slate-600">
                    {q.status === "rejected" ? "Không đưa vào so giá"
                      : w.skus ? <>Giá vốn rẻ hơn ở <b>{w.skus}</b> gói (trên {w.covered} gói có giá) · rẻ hơn trung bình <b>{pctTxt(w.avgPct, 0)}</b></>
                      : w.covered ? "Không rẻ hơn giá đang nhập ở sản phẩm nào"
                      : "Không có gói nào khớp sản phẩm đang bán (xem phần nước chưa có gói riêng)"}
                  </span>
                  <span className="flex gap-2 ml-auto">
                    {q.files.map(f => <a key={f.path} href={`/api/analytics/market/vendor-quotes/${q.id}?file=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer"
                      className="text-[11px] text-brand-700 hover:underline flex items-center gap-0.5"><FileText className="w-3 h-3" />{f.name.slice(0, 24)}</a>)}
                    <button onClick={() => remove(q)} aria-label="Xoá báo giá"><Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-rose-600" /></button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      {adding && <AddQuoteModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed() }} />}
    </Panel>
  )
}
