"use client"

import { useEffect, useRef, useState } from "react"
import { Save, Upload } from "lucide-react"
import { convert, ENTITY_LABEL, monthLabel, momPct, rateAt, type Entity, type FxRowDef, type FxTable } from "@/lib/fx/table"

type Notify = (type: "success" | "error", text: string) => void
interface View { table: FxTable; source: "monthly" | "legacy"; updatedAt: string | null; month: string; rows: FxRowDef[]; months: string[] }
const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 4 })

/** Bảng tỷ giá nội bộ theo THÁNG × PHÁP NHÂN (Gohub JSC / Gohub Inc). Sửa từng ô hoặc nhập từ file Excel. */
export default function FxTable({ onNotify }: { onNotify: Notify }) {
  const [v, setV] = useState<View | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<{ count: number; items: { id: string; month: string; from: number | null; to: number }[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const curRef = useRef<HTMLTableCellElement>(null)

  const load = () => fetch("/api/admin/fx").then(async r => {
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || "Lỗi tải tỷ giá")
    setV(j)
  }).catch(e => onNotify("error", (e as Error).message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Cuộn tới cột tháng hiện tại
  useEffect(() => { curRef.current?.scrollIntoView({ inline: "center", block: "nearest" }) }, [v?.month])

  if (!v) return <div className="text-sm text-gray-400">Đang tải tỷ giá...</div>

  const cell = (id: string, m: string) => edits[`${id}|${m}`] ?? (v.table.values[id]?.[m] != null ? String(v.table.values[id][m]) : "")
  const dirty = Object.keys(edits).length
  const label = (id: string) => v.rows.find(r => r.id === id)!
  const groups: Entity[] = ["JSC", "INC"]

  const save = async () => {
    const changes = Object.entries(edits).map(([k, val]) => {
      const [id, month] = k.split("|")
      const n = parseFloat(val.replace(",", "."))
      return { id, month, rate: val.trim() === "" ? null : n }
    })
    if (changes.some(c => c.rate != null && !(c.rate > 0))) return onNotify("error", "Tỷ giá phải là số dương")
    setSaving(true)
    const r = await fetch("/api/admin/fx", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) })
    const j = await r.json(); setSaving(false)
    if (!r.ok) return onNotify("error", j.error || "Không lưu được")
    setV(j); setEdits({}); onNotify("success", `Đã lưu ${j.saved} ô tỷ giá`)
  }

  const importFile = async (f: File) => {
    setImporting(true)
    const fd = new FormData(); fd.append("file", f)
    const r = await fetch("/api/admin/fx", { method: "POST", body: fd })
    const j = await r.json(); setImporting(false)
    if (!r.ok) return onNotify("error", j.error || "Không đọc được file")
    setV(j); setEdits({}); setReport({ count: j.changedCount, items: j.changed })
    onNotify("success", `Đã nhập ${j.imported.cells} ô từ ${j.imported.rows} dòng — ${j.changedCount} ô thay đổi`)
  }

  const jsc = rateAt(v.table, "JSC:VND/USD", v.month), inc = rateAt(v.table, "INC:VND/USD", v.month)
  const hkd = convert(v.table, 1, "HKD", "USD", v.month), cny = convert(v.table, 1, "CNY", "USD", v.month)

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">Tỷ Giá Nội Bộ theo tháng</h3>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = "" }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50">
            <Upload size={13} /> {importing ? "Đang nhập..." : "Nhập từ Excel"}
          </button>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
            <Save size={13} /> {saving ? "Đang lưu..." : dirty ? `Lưu ${dirty} ô` : "Lưu"}
          </button>
        </div>
      </div>

      {v.source === "legacy" && <div className="text-xs text-amber-700">Chưa có bảng theo tháng — đang tạm dùng bộ tỷ giá cũ như giá tháng hiện tại. Hãy nhập file Excel hoặc điền bảng bên dưới.</div>}

      {/* Quy tắc chiều đổi với tháng hiện tại */}
      <div className="text-xs bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-1">
        <div className="font-semibold text-gray-700 dark:text-slate-200">Quy tắc chiều đổi ({monthLabel(v.month)}{jsc && jsc.month !== v.month ? `, dùng giá ${monthLabel(jsc.month)}` : ""})</div>
        <div><b>USD → VND</b> dùng tỷ giá <b>Gohub JSC</b>: 1 USD = <b>{jsc ? fmt(jsc.rate) : "—"}</b> VND</div>
        <div><b>VND → USD</b> dùng tỷ giá <b>Gohub Inc</b>: 1 USD = <b>{inc ? fmt(inc.rate) : "—"}</b> VND</div>
        <div><b>Ngoại tệ ↔ USD</b> (HKD, CNY, JPY, THB, EUR, GBP, SGD, TWD) dùng tỷ giá <b>Gohub Inc</b>: 1 USD = {hkd ? fmt(1 / hkd.value) : "—"} HKD · {cny ? fmt(1 / cny.value) : "—"} CNY</div>
        <div><b>VND ↔ CNY / HKD / GBP</b> dùng tỷ giá <b>Gohub JSC</b>. Cặp khác đổi qua USD. Tháng chưa nhập tự lấy tháng gần nhất trước đó.</div>
      </div>

      {report && (
        <details className="text-xs border border-emerald-300 bg-emerald-50 rounded-lg p-2" open>
          <summary className="cursor-pointer font-semibold text-emerald-800">Kết quả nhập: {report.count} ô thay đổi{report.count > report.items.length ? ` (hiện ${report.items.length})` : ""}</summary>
          <ul className="mt-1 ml-4 list-disc max-h-40 overflow-auto">
            {report.items.map((c, i) => <li key={i}>{ENTITY_LABEL[label(c.id).entity]} · {label(c.id).label} · {monthLabel(c.month)}: {c.from == null ? "mới" : fmt(c.from)} → <b>{fmt(c.to)}</b></li>)}
            {report.count === 0 && <li>File không có ô nào khác bảng hiện tại.</li>}
          </ul>
        </details>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-900/40">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-slate-900 px-3 py-2 text-left font-semibold min-w-[170px]">Pháp nhân · Chỉ tiêu</th>
              {v.months.map(m => (
                <th key={m} ref={m === v.month ? curRef : undefined} className={`px-2 py-2 font-semibold whitespace-nowrap ${m === v.month ? "bg-brand-50 text-brand-700" : ""}`}>{monthLabel(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <FragmentGroup key={g} title={`▸ ${ENTITY_LABEL[g]}`} colSpan={v.months.length + 1}>
                {v.rows.filter(r => r.entity === g).map(r => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-slate-700">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 px-3 py-1 font-medium whitespace-nowrap">{r.label}</td>
                    {v.months.map(m => {
                      const key = `${r.id}|${m}`, val = cell(r.id, m), mom = momPct(v.table, r.id, m)
                      return (
                        <td key={m} className={`px-1 py-0.5 ${m === v.month ? "bg-brand-50/50" : ""}`}>
                          <input
                            value={val} inputMode="decimal"
                            onChange={e => setEdits(p => ({ ...p, [key]: e.target.value }))}
                            title={mom != null ? `Biến động so với tháng trước: ${(mom * 100).toFixed(2)}%` : undefined}
                            className={`w-[86px] px-1.5 py-1 text-right border rounded focus:outline-none focus:ring-1 focus:ring-brand-500 ${edits[key] !== undefined ? "border-amber-400 bg-amber-50" : "border-transparent hover:border-gray-300"}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </FragmentGroup>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-gray-400">
        Tỷ giá = số đơn vị ngoại tệ cho 1 đơn vị gốc (VD 26.266 = 1 USD đổi 26.266 VND). Xoá trống ô để bỏ giá tháng đó. Rê chuột vào ô để xem % biến động so với tháng trước.
        Bảng này cũng tự cập nhật các tỷ giá cũ (chatbot, MCP) theo tháng hiện tại.
      </div>
    </div>
  )
}

function FragmentGroup({ title, colSpan, children }: { title: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        {/* Ô tiêu đề riêng (dính trái) + ô nền phủ phần còn lại — nếu gộp 1 ô colSpan thì chữ trôi mất khi cuộn ngang */}
        <td className="sticky left-0 z-10 bg-gray-100 dark:bg-slate-900 px-3 py-1 font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap">{title}</td>
        <td colSpan={colSpan - 1} className="bg-gray-100 dark:bg-slate-900" />
      </tr>
      {children}
    </>
  )
}
