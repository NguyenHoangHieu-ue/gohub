"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell, Download, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { VENDOR_LABEL, type AuditRow, type AuditSummary, type AuditVendor } from "@/lib/datapool-audit/engine"
import { changePct } from "@/lib/datapool-audit/compare"
import type { CustomUnlimited } from "@/lib/datapool-formula"

type Notify = (type: "success" | "error", text: string) => void
type Row = Omit<AuditRow, "calc">
interface AuditResp {
  summary: AuditSummary; rows: Row[]; truncated: boolean; changed: string[]
  inputs: { fx: { hkdPerUsd: number; cnyPerUsd: number; vndPerUsd: number; vndPerUsdInc: number; month?: string }; fixedPct: number; dailyPct: number; levels: CustomUnlimited[]; frames: { esimUsUsd: number | null; simUsUsd: number | null; simVnVnd: number | null }; whiteSimVnd: number | null }
  last: { at: string; notifiedAt: string | null; counts: { diff: number; nocogs: number; skip: number; total: number } } | null
}
type Verdict = Row["verdict"]
const VERDICT_LABEL: Record<Verdict, string> = { diff: "Lệch", nocogs: "Chưa có giá", rounding: "Chênh làm tròn", skip: "Không tính lại được", match: "Khớp" }
const VERDICT_CLS: Record<Verdict, string> = { diff: "bg-red-100 text-red-700", nocogs: "bg-amber-100 text-amber-800", rounding: "bg-gray-100 text-gray-600", skip: "bg-slate-100 text-slate-500", match: "bg-emerald-100 text-emerald-700" }
const fmt = (n: number | null, cur: string) => (n == null ? "—" : cur === "VND" ? Math.round(n).toLocaleString("vi-VN") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }))
const lv = (l: CustomUnlimited) => `${l.dataMb % 1024 === 0 ? `${l.dataMb / 1024}GB` : `${l.dataMb}MB`} + ${l.speedMbps}Mbps`

/** Soát giá vốn Datapool: tính lại giá vốn mọi SKU 3HK / BC CMHK / BC Singtel đang có theo tỷ giá + công thức + bảng giá HIỆN TẠI, so với giá trong hệ thống. */
export default function CogsAuditTab({ onNotify }: { onNotify: Notify }) {
  const [vendor, setVendor] = useState<"ALL" | AuditVendor>("ALL")
  const [status, setStatus] = useState<"active" | "all">("active")
  const [data, setData] = useState<AuditResp | null>(null)
  const [busy, setBusy] = useState<"" | "load" | "xlsx" | "dm">("load")
  const [err, setErr] = useState<string | null>(null)
  const [show, setShow] = useState<Set<Verdict>>(new Set(["diff", "nocogs"]))
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setBusy("load"); setErr(null)
    try {
      const r = await fetch(`/api/admin/datapool-audit?vendor=${vendor}&status=${status}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Lỗi soát")
      setData(j)
    } catch (e) { setErr((e as Error).message) } finally { setBusy("") }
  }, [vendor, status])
  useEffect(() => { void load() }, [load])

  const post = async (body: Record<string, unknown>, url = "/api/admin/datapool-audit") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  const exportXlsx = async (verdicts: string[] | "all") => {
    setBusy("xlsx")
    try {
      const r = await post({ vendor, status, verdicts }, "/api/admin/datapool-audit?format=xlsx")
      if (!r.ok) { const j = await r.json().catch(() => ({})); return onNotify("error", j.error || "Không xuất được file") }
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement("a"); a.href = url; a.download = `soat_gia_von_datapool_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url)
      onNotify("success", "Đã xuất file (công thức tính lại + sheet Cập nhật latestCogs)")
    } catch { onNotify("error", "Lỗi mạng hoặc máy chủ quá thời gian — thử lại") } finally { setBusy("") }
  }

  const sendDm = async () => {
    setBusy("dm")
    try {
      const r = await post({ action: "notify" })
      const j = await r.json()
      if (!r.ok) return onNotify("error", j.error || "Không gửi được DM")
      onNotify(j.notified ? "success" : "error", j.notified ? `Đã gửi DM Lark (${j.counts.diff} SKU lệch)` : j.skipped || "Không gửi được DM")
      void load()
    } catch { onNotify("error", "Lỗi mạng hoặc máy chủ quá thời gian — thử lại") } finally { setBusy("") }
  }

  const rows = useMemo(() => (data?.rows ?? []).filter(r => show.has(r.verdict) && (!q.trim() || `${r.sku} ${r.label} ${r.countries} ${r.note ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, show, q])
  const toggle = (v: Verdict) => setShow(prev => { const s = new Set(prev); if (s.has(v)) s.delete(v); else s.add(v); return s })
  const s = data?.summary

  return (
    <div className="space-y-5">
      <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-600 dark:text-slate-300 space-y-1">
        <div className="font-semibold text-gray-900 dark:text-slate-100">Soát giá vốn các gói Datapool đang có</div>
        <div>Tính lại giá vốn từng SKU bằng đúng công thức của tab Tạo sản phẩm (tỷ giá nội bộ hiện tại + giả định Công Thức Datapool + bảng giá 3HK/BC hiện tại) rồi so với giá đang lưu trong hệ thống. Chênh ≤ 2 cent (hoặc ≤ 600 VND) coi là do làm tròn ROUNDUP.</div>
        <div>Hệ thống tự soát hằng ngày và <b>nhắn DM Lark cho anh</b> khi tỷ giá / giả định / bảng giá đổi làm giá lệch (không nhắn lặp nếu không có gì mới).</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={vendor} onChange={e => setVendor(e.target.value as "ALL" | AuditVendor)} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900">
          <option value="ALL">Tất cả vendor</option>{(Object.keys(VENDOR_LABEL) as AuditVendor[]).map(v => <option key={v} value={v}>{VENDOR_LABEL[v]}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value as "active" | "all")} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900">
          <option value="active">SKU Active + Temporary</option><option value="all">Mọi trạng thái (kể cả Inactive/Deleted)</option>
        </select>
        <button onClick={load} disabled={busy !== ""} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">{busy === "load" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Soát lại</button>
        <button onClick={() => exportXlsx(["diff", "nocogs"])} disabled={busy !== "" || !data} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"><Download size={14} />Xuất file SKU lệch (có công thức)</button>
        <button onClick={() => exportXlsx("all")} disabled={busy !== "" || !data} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50" title="Có thể rất lớn nếu chọn Tất cả vendor">Xuất toàn bộ</button>
        <button onClick={sendDm} disabled={busy !== ""} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-amber-400 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50" title="Soát + gửi ngay 1 DM Lark tóm tắt cho anh"><Bell size={14} />Gửi DM kiểm tra</button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {busy === "load" && !data && <div className="text-sm text-gray-400">Đang tính lại giá vốn toàn bộ SKU… (~10–30 giây)</div>}

      {data && s && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(VENDOR_LABEL) as AuditVendor[]).filter(v => vendor === "ALL" || vendor === v).map(v => {
              const x = s.byVendor[v]
              return (
                <div key={v} className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-xs space-y-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{VENDOR_LABEL[v]} <span className="text-gray-400 font-normal">· {x.total} SKU</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn("px-2 py-0.5 rounded-md", x.diff + x.nocogs ? VERDICT_CLS.diff : VERDICT_CLS.match)}>{x.diff + x.nocogs} lệch</span>
                    <span className={cn("px-2 py-0.5 rounded-md", VERDICT_CLS.match)}>{x.match} khớp</span>
                    <span className={cn("px-2 py-0.5 rounded-md", VERDICT_CLS.rounding)}>{x.rounding} làm tròn</span>
                    {x.skip > 0 && <span className={cn("px-2 py-0.5 rounded-md", VERDICT_CLS.skip)}>{x.skip} không tính lại được</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="p-3 border border-gray-200 dark:border-slate-700 rounded-xl text-xs space-y-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Đầu vào đang dùng để tính lại</div>
              <div>Tỷ giá{data.inputs.fx.month ? ` (${data.inputs.fx.month})` : ""}: HKD/USD <b>{data.inputs.fx.hkdPerUsd}</b> · CNY/USD <b>{data.inputs.fx.cnyPerUsd}</b> · VND/USD JSC <b>{data.inputs.fx.vndPerUsd.toLocaleString("vi-VN")}</b> · Inc <b>{data.inputs.fx.vndPerUsdInc.toLocaleString("vi-VN")}</b></div>
              <div>Giả định: Fixed <b>{(data.inputs.fixedPct * 100).toFixed(0)}%</b> · Daily <b>{(data.inputs.dailyPct * 100).toFixed(0)}%</b> · Unlimited: {data.inputs.levels.length ? data.inputs.levels.map(l => <span key={`${l.dataMb}:${l.speedMbps}`}>{lv(l)} <b>{l.gbPerDay}</b>; </span>) : "bảng mức trống"}</div>
              <div>Giá khung 3HK: eSIM {data.inputs.frames.esimUsUsd ?? "thiếu"} USD · SIM US {data.inputs.frames.simUsUsd ?? "thiếu"} USD · SIM VN {data.inputs.frames.simVnVnd?.toLocaleString("vi-VN") ?? "thiếu"} VND · SIM trắng BC {data.inputs.whiteSimVnd?.toLocaleString("vi-VN") ?? "thiếu"} VND</div>
            </div>
            <div className={cn("p-3 border rounded-xl text-xs space-y-1", data.changed.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 dark:border-slate-700")}>
              <div className="text-sm font-semibold">{data.changed.length ? `Đầu vào ĐÃ ĐỔI so với lần soát tự động trước (${data.changed.length})` : "Đầu vào không đổi so với lần soát tự động trước"}</div>
              {data.changed.length > 0 && <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-auto">{data.changed.map((c, i) => <li key={i}>{c}</li>)}</ul>}
              <div className="text-gray-500">{data.last ? `Lần soát tự động gần nhất: ${new Date(data.last.at).toLocaleString("vi-VN")} · ${data.last.counts.diff + data.last.counts.nocogs} SKU lệch${data.last.notifiedAt ? ` · DM gần nhất ${new Date(data.last.notifiedAt).toLocaleString("vi-VN")}` : " · chưa gửi DM"}` : "Chưa có lần soát tự động nào (cron-job.org chưa gọi /api/cron/datapool-audit)."}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["diff", "nocogs", "rounding", "skip"] as Verdict[]).map(v => (
              <button key={v} onClick={() => toggle(v)} className={cn("px-2.5 py-1 rounded-md border", show.has(v) ? `${VERDICT_CLS[v]} border-transparent font-semibold` : "border-gray-300 text-gray-500")}>{VERDICT_LABEL[v]}</button>
            ))}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã SKU / nước / ghi chú…" className="ml-2 px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 w-64" />
            <span className="text-gray-400">{rows.length} dòng{data.truncated ? " (đã cắt bớt 4.000 dòng — lọc theo vendor hoặc xuất file)" : ""}</span>
          </div>

          <div className="overflow-auto max-h-[560px] border border-gray-200 dark:border-slate-700 rounded-xl">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800"><tr>{["SKU", "Đầu", "Vendor", "Gói", "Trạng thái", "Giá cũ (hệ thống)", "Giá mới (tính lại)", "Tăng/giảm %", "Kết luận", "Ghi chú"].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 500).map(r => (
                  <tr key={`${r.sku}${r.tenant}`} className="border-t border-gray-100 dark:border-slate-800">
                    <td className="px-2 py-1 font-mono">{r.sku}</td><td className="px-2 py-1">{r.tenant}</td><td className="px-2 py-1 whitespace-nowrap">{VENDOR_LABEL[r.vendor]}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{r.label}</td><td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1 tabular-nums">{fmt(r.current, r.currency)} {r.currency}</td>
                    <td className="px-2 py-1 tabular-nums font-semibold cursor-help underline decoration-dotted" title={r.explain ?? ""}>{fmt(r.expected, r.currency)}</td>
                    <td className={cn("px-2 py-1 tabular-nums", r.verdict === "diff" && "text-red-600 font-semibold")}>{changePct(r.current, r.expected) == null ? "" : `${changePct(r.current, r.expected)! > 0 ? "+" : ""}${changePct(r.current, r.expected)}%`}</td>
                    <td className="px-2 py-1"><span className={cn("px-1.5 py-0.5 rounded", VERDICT_CLS[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span></td>
                    <td className="px-2 py-1 text-gray-500 max-w-[420px] truncate" title={r.note}>{r.note}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">Không có dòng nào theo bộ lọc này.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > 500 && <div className="text-[11px] text-amber-700">Bảng chỉ hiện 500 dòng đầu — lọc thêm hoặc xuất file để xem đủ.</div>}
          <div className="text-[11px] text-gray-400">Rê chuột vào giá mới để xem công thức đã thế số. File xuất: sheet &quot;Soát giá vốn&quot; (công thức ROUNDUP dùng chung sheet &quot;Tham số&quot;) + sheet &quot;Cập nhật latestCogs&quot; (SKU lệch kèm giá tính lại, công thức trỏ sheet soát).</div>
        </>
      )}
    </div>
  )
}
