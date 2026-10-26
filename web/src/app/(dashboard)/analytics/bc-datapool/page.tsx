"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { DiffBox, catalogGroups, priceGroups } from "@/components/bc-datapool/diff-box"
import type { PlanCatalog } from "@/lib/bc-datapool/plan-lookup"
import type { Pool, PriceList } from "@/lib/bc-datapool/types"

type Msg = { type: "success" | "error"; text: string }
interface Sources { priceList: PriceList | null; catalog: PlanCatalog | null }

const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
const field = "px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
const ROW_CAP = 300
const fmtDays = (d: number[]) => (d.length ? d.join(", ") : "—")

// BC Datapool: nơi import và quản lý dữ liệu nền (bảng báo giá + file Portal). Tab "Tạo sản phẩm" / "Tính giá" đọc cùng dữ liệu này.
export default function BcDatapoolPage() {
  const [data, setData] = useState<Sources | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState<"" | "price" | "catalog">("")
  const [view, setView] = useState<"price" | "catalog">("price")
  const priceRef = useRef<HTMLInputElement>(null)
  const catRef = useRef<HTMLInputElement>(null)

  const notify = (type: Msg["type"], text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000) }

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/bc-datapool/sources", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(r.status === 403 ? "Bạn không có quyền xem tab này." : j.error || "Lỗi tải dữ liệu")
      setData(j)
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])

  const send = async (url: string, fd: FormData, which: "price" | "catalog", fail: string) => {
    setBusy(which)
    try {
      const r = await fetch(url, { method: "POST", body: fd })
      const j = await r.json()
      if (!r.ok) { notify("error", j.error || fail); return null }
      return j
    } catch { notify("error", "Lỗi mạng hoặc máy chủ trả về không đúng định dạng (có thể quá thời gian) — thử lại"); return null } finally { setBusy("") }
  }

  const uploadPrice = async (file: File) => {
    const fd = new FormData(); fd.append("file", file)
    const j = await send("/api/admin/bc-datapool/price-list", fd, "price", "Không đọc được file báo giá")
    if (!j) return
    await load()
    const c = j.priceList.lastDiff?.counts
    const changed = c ? c.changed + c.added + c.removed + c.fees : 0
    notify("success", `Đã lưu bảng báo giá: ${j.priceList.fileName}` + (j.priceList.lastDiff?.compared ? (changed ? ` — ${c.changed} nhà mạng đổi giá, ${c.added} mới, ${c.removed} bị bỏ, ${c.fees} phí đổi` : " — không có thay đổi so với bản trước") : ""))
  }

  const uploadCatalog = async (files: FileList) => {
    const fd = new FormData(); Array.from(files).forEach(f => fd.append("files", f))
    const j = await send("/api/admin/bc-datapool/plan-catalog", fd, "catalog", "Không đọc được file Portal")
    if (!j) return
    await load()
    const c = j.planCatalog.lastDiff?.counts
    notify("success", `Đã lưu danh mục gói Portal: ${j.planCatalog.esim} gói eSIM, ${j.planCatalog.sim} gói SIM` + (j.planCatalog.lastDiff?.compared ? (c && c.added + c.removed + c.changed ? ` — ${c.added} gói mới, ${c.removed} bị bỏ, ${c.changed} đổi ngày/tốc độ` : " — không có thay đổi so với bản trước") : ""))
  }

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>
  if (!data) return <div className="p-6 text-sm text-gray-400">Đang tải...</div>
  const { priceList, catalog } = data
  const esim = catalog?.plans.filter(p => p.sim === "eSIM").length ?? 0
  const sim = catalog?.plans.filter(p => p.sim === "SIM").length ?? 0

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">BC Datapool</h1>
        <p className="text-sm text-gray-500 mt-1">Import và quản lý dữ liệu nền của BC Datapool. Tab &quot;Tính giá &amp; Tạo sản phẩm&quot; dùng đúng dữ liệu này — upload ở đây là các tab kia cập nhật theo.</p>
      </div>

      {msg && <div className={`p-3 rounded-xl text-sm ${msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Bảng báo giá</div>
          {priceList ? (
            <div className="text-xs text-gray-600 dark:text-slate-300 space-y-0.5">
              <div>{priceList.fileName}</div>
              <div>Cập nhật {new Date(priceList.uploadedAt).toLocaleString("vi-VN")}</div>
              <div>CMHK {priceList.pools.CMHK.rows.length} dòng (HKD/GB) · Singtel {priceList.pools.SINGTEL.rows.length} dòng (USD/GB)</div>
            </div>
          ) : <div className="text-xs text-amber-700">Chưa có bảng báo giá — upload file có sheet &quot;cmhk&quot; và &quot;Singtel&quot;.</div>}
          <input ref={priceRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPrice(f); e.target.value = "" }} />
          <button onClick={() => priceRef.current?.click()} disabled={busy === "price"} className={btn}>
            <Upload size={14} /> {busy === "price" ? "Đang đọc file..." : priceList ? "Upload bảng giá mới" : "Upload bảng giá"}
          </button>
          <DiffBox diff={priceList?.lastDiff} groups={priceGroups(priceList?.lastDiff)} />
        </div>

        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Danh mục gói Portal (Plan ID = ProductID)</div>
          {catalog ? (
            <div className="text-xs text-gray-600 dark:text-slate-300 space-y-0.5">
              <div>{esim} gói eSIM · {sim} gói SIM</div>
              <div>File: {catalog.files.join(", ") || "—"}</div>
              <div>Cập nhật {new Date(catalog.uploadedAt).toLocaleString("vi-VN")}</div>
            </div>
          ) : <div className="text-xs text-amber-700">Chưa có — upload 2 file &quot;Purchase information&quot; (eSIM và SIM) từ Portal.</div>}
          <input ref={catRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.length) uploadCatalog(e.target.files); e.target.value = "" }} />
          <button onClick={() => catRef.current?.click()} disabled={busy === "catalog"} className={btn}>
            <Upload size={14} /> {busy === "catalog" ? "Đang đọc file..." : catalog ? "Upload file Portal mới" : "Upload file Portal"}
          </button>
          <div className="text-[12px] text-gray-400">Loại SIM nào có trong file upload thì thay hẳn loại đó, loại còn lại giữ nguyên.</div>
          <DiffBox diff={catalog?.lastDiff} groups={catalogGroups(catalog?.lastDiff)} />
        </div>
      </div>

      <div className="flex gap-2">
        {([["price", "Xem bảng báo giá"], ["catalog", "Xem gói Portal"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 text-sm rounded-lg border ${view === k ? "border-brand-600 bg-brand-50 dark:bg-brand-950/30 font-semibold" : "border-gray-200 dark:border-slate-700"}`}>{t}</button>
        ))}
      </div>

      {view === "price" ? <PriceView priceList={priceList} /> : <CatalogView catalog={catalog} />}
    </div>
  )
}

function PriceView({ priceList }: { priceList: PriceList | null }) {
  const [pool, setPool] = useState<Pool>("CMHK")
  const [q, setQ] = useState("")
  if (!priceList) return <div className="text-sm text-gray-400">Chưa có bảng báo giá.</div>
  const p = priceList.pools[pool]
  const rows = p.rows.filter(r => !q || `${r.coverage} ${r.operator} ${r.plmn}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={pool} onChange={e => setPool(e.target.value as Pool)}>
          <option value="CMHK">CMHK (HKD/GB)</option>
          <option value="SINGTEL">Singtel (USD/GB)</option>
        </select>
        <input className={`${field} w-64`} placeholder="Tìm khu vực / nhà mạng / PLMN" value={q} onChange={e => setQ(e.target.value)} />
        <span className="text-xs text-gray-500">Phí: IMSI {p.imsiFee} {p.currency} · eSIM {p.esimFeeCny} CNY · SIM {p.simFeeCny} CNY</span>
      </div>
      <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-auto max-h-[28rem]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800 text-left text-[12px] text-gray-500">
            <tr><th className="px-3 py-2">Khu vực</th><th className="px-3 py-2">Nhà mạng</th><th className="px-3 py-2">PLMN</th><th className="px-3 py-2 text-right">Giá/GB ({p.currency})</th><th className="px-3 py-2">KYC</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_CAP).map((r, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{r.coverage}</td><td className="px-3 py-1.5">{r.operator}</td><td className="px-3 py-1.5 text-gray-500">{r.plmn}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.pricePerGb}</td><td className="px-3 py-1.5">{r.kyc ? "Có" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400">{rows.length} dòng{rows.length > ROW_CAP ? ` — hiện ${ROW_CAP} dòng đầu, gõ tìm kiếm để thu hẹp` : ""}</div>
    </div>
  )
}

function CatalogView({ catalog }: { catalog: PlanCatalog | null }) {
  const [sim, setSim] = useState("")
  const [kind, setKind] = useState("")
  const [q, setQ] = useState("")
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (catalog?.plans ?? []).filter(p => (!sim || p.sim === sim) && (!kind || p.kind === kind)
      && (!s || `${p.id} ${p.name} ${p.countries.join(" ")} ${p.operators.join(" ")}`.toLowerCase().includes(s)))
  }, [catalog, sim, kind, q])
  if (!catalog) return <div className="text-sm text-gray-400">Chưa có danh mục gói Portal.</div>
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={sim} onChange={e => setSim(e.target.value)}><option value="">eSIM + SIM</option><option value="eSIM">eSIM</option><option value="SIM">SIM</option></select>
        <select className={field} value={kind} onChange={e => setKind(e.target.value)}><option value="">Daily + Fixed</option><option value="Daily">Daily</option><option value="Fixed">Fixed</option></select>
        <input className={`${field} w-64`} placeholder="Tìm Plan ID / tên / nước / nhà mạng" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-auto max-h-[28rem]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800 text-left text-[12px] text-gray-500">
            <tr><th className="px-3 py-2">Plan ID</th><th className="px-3 py-2">Loại</th><th className="px-3 py-2">Pool</th><th className="px-3 py-2">Nước</th><th className="px-3 py-2">Dung lượng</th><th className="px-3 py-2">Ngày bán</th><th className="px-3 py-2">Nhà mạng</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_CAP).map(p => (
              <tr key={`${p.sim}-${p.id}`} className="border-t border-gray-100 dark:border-slate-800 align-top">
                <td className="px-3 py-1.5 font-mono text-[12px]">{p.id}</td>
                <td className="px-3 py-1.5">{p.sim} · {p.kind}{p.throttleKbps === 1024 ? " (1Mbps)" : ""}</td>
                <td className="px-3 py-1.5">{p.pool}</td>
                <td className="px-3 py-1.5">{p.countries.join(", ")}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{p.amount} {p.unit}</td>
                <td className="px-3 py-1.5">{fmtDays(p.days)}</td>
                <td className="px-3 py-1.5 text-gray-500">{p.operators.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400">{rows.length} gói{rows.length > ROW_CAP ? ` — hiện ${ROW_CAP} gói đầu, dùng bộ lọc để thu hẹp` : ""}</div>
    </div>
  )
}
