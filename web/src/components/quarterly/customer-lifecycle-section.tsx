"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { UserPlus, Repeat, UserMinus, X, Search, Download, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile } from "@/components/dashboard-kit"
import { fc } from "@/lib/quarterly-format"
import type { LifecycleDetail, LifecycleRow, LifecycleStateKey } from "@/lib/analytics-engine/lifecycle-detail"

// Tổng quan Quarter Report — KH Mới / Quay lại / Rời bỏ, TÁCH B2B và B2C, bấm vào ô để xem DANH SÁCH từng KH (s203).
// Số B2B của ô lấy từ `quarterly-report` (đã có sẵn); danh sách + số B2C lấy lười (khi bấm) từ /api/analytics/quarterly-customer-lifecycle.

type Segment = "b2b" | "b2c"
type B2bSummary = {
  new: { count: number; revenue: number }
  recurring: { count: number; revenue: number }
  inactive: { count: number; lostRevenue: number }
}
type B2cSummary = { new: { count: number; revenue: number }; returning: { count: number; revenue: number }; total: number }
type Load<T> = { status: "idle" | "loading" | "ok" | "error"; data?: T; error?: string }

const STATE_LABEL: Record<LifecycleStateKey, string> = {
  new: "KH Mới trong quý", recurring: "KH Quay Lại", inactive: "KH Rời Bỏ (quý này chưa mua lại)",
}
const SEGMENT_LABEL: Record<Segment, string> = { b2b: "B2B", b2c: "B2C" }

function csvEscape(v: string | number | null) {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function CustomerLifecycleSection({
  quarter, year, companyCode, includeShip, includeInternalOps, b2b, loading, canViewB2c,
}: {
  quarter: string; year: number; companyCode: string
  includeShip: boolean; includeInternalOps: boolean
  b2b: B2bSummary
  loading?: boolean
  canViewB2c: boolean
}) {
  const [open, setOpen] = useState<{ segment: Segment; state: LifecycleStateKey } | null>(null)
  const [detail, setDetail] = useState<Record<Segment, Load<LifecycleDetail>>>({ b2b: { status: "idle" }, b2c: { status: "idle" } })
  const [b2cSummary, setB2cSummary] = useState<Load<B2cSummary>>({ status: "idle" })
  const [q, setQ] = useState("")
  const gen = useRef(0)   // đổi bộ lọc → bỏ kết quả của request cũ

  const params = useMemo(() => {
    const p = new URLSearchParams({ quarter, year: String(year), companyCode })
    if (includeShip) p.set("includeShip", "1")
    if (includeInternalOps) p.set("includeInternalOps", "1")
    return p
  }, [quarter, year, companyCode, includeShip, includeInternalOps])

  const call = useCallback(async (segment: Segment, mode: "summary" | "detail") => {
    const p = new URLSearchParams(params); p.set("segment", segment); p.set("mode", mode)
    const res = await fetch(`/api/analytics/quarterly-customer-lifecycle?${p}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || `${res.status}`)
    return body
  }, [params])

  // Đổi kỳ/bộ lọc → xoá dữ liệu cũ, đóng bảng, lấy lại số B2C (1 request nhẹ)
  useEffect(() => {
    const g = ++gen.current
    setDetail({ b2b: { status: "idle" }, b2c: { status: "idle" } })
    setOpen(null); setQ("")
    if (!canViewB2c) { setB2cSummary({ status: "idle" }); return }
    setB2cSummary({ status: "loading" })
    call("b2c", "summary")
      .then(b => { if (g === gen.current) setB2cSummary({ status: "ok", data: b.summary }) })
      .catch(e => { if (g === gen.current) setB2cSummary({ status: "error", error: e.message }) })
  }, [call, canViewB2c])

  const openTile = (segment: Segment, state: LifecycleStateKey) => {
    if (open?.segment === segment && open.state === state) { setOpen(null); return }
    setOpen({ segment, state }); setQ("")
    if (detail[segment].status === "idle" || detail[segment].status === "error") {
      const g = gen.current
      setDetail(d => ({ ...d, [segment]: { status: "loading" } }))
      call(segment, "detail")
        .then(b => { if (g === gen.current) setDetail(d => ({ ...d, [segment]: { status: "ok", data: b.detail } })) })
        .catch(e => { if (g === gen.current) setDetail(d => ({ ...d, [segment]: { status: "error", error: e.message } })) })
    }
  }

  const tile = (segment: Segment, state: LifecycleStateKey) => {
    const selected = open?.segment === segment && open.state === state
    const Icon = state === "new" ? UserPlus : state === "recurring" ? Repeat : UserMinus
    const accent = state === "new" ? "positive" : state === "recurring" ? "revenue" : "warn"
    const revLabel = state === "inactive" ? "Doanh thu quý trước" : "Doanh thu"
    let value: React.ReactNode = "—", revenue = 0
    let extra: { label: string; value: React.ReactNode; kind: "up" | "down" }[] = []
    const d = detail[segment].data

    if (segment === "b2b") {
      const s = b2b[state === "recurring" ? "recurring" : state]
      value = s.count
      revenue = state === "inactive" ? (s as B2bSummary["inactive"]).lostRevenue : (s as B2bSummary["new"]).revenue
      if (state === "inactive" && d?.inactive.recentCount != null) extra = [{ label: "Có mua quý trước", value: `${d.inactive.recentCount.toLocaleString("vi-VN")} KH`, kind: "down" }]
    } else if (state === "inactive") {
      if (d) { value = d.inactive.count; revenue = d.inactive.revenue } else value = detail.b2c.status === "loading" ? "…" : "—"
    } else {
      const s = b2cSummary.data
      const cur = s ? (state === "new" ? s.new : s.returning) : null
      value = cur ? cur.count : b2cSummary.status === "loading" ? "…" : "—"
      revenue = cur ? cur.revenue : 0
    }

    return (
      <button key={`${segment}-${state}`} type="button" onClick={() => openTile(segment, state)}
        className={cn("text-left rounded-2xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          selected ? "ring-2 ring-brand-500" : "hover:ring-1 hover:ring-slate-300")}
        title="Bấm để xem danh sách khách hàng">
        <StatTile icon={<Icon className="w-5 h-5" />} accent={accent} label={STATE_LABEL[state]} value={value} unit="KH"
          deltas={[
            ...(revenue > 0 || value !== "—" ? [{ label: revLabel, value: fc(revenue), kind: (state === "inactive" ? "down" : "up") as "up" | "down" }] : []),
            ...extra,
          ]} />
      </button>
    )
  }

  const segRow = (segment: Segment, subtitle: string) => (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold text-white", segment === "b2b" ? "bg-brand-600" : "bg-emerald-600")}>{SEGMENT_LABEL[segment]}</span>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["new", "recurring", "inactive"] as LifecycleStateKey[]).map(s => tile(segment, s))}
      </div>
    </div>
  )

  // ── Bảng danh sách ──
  const cur = open ? detail[open.segment] : null
  const stateDetail = open && cur?.data ? cur.data[open.state] : null
  const rows: LifecycleRow[] = useMemo(() => {
    if (!stateDetail) return []
    const kw = q.trim().toLowerCase()
    return kw ? stateDetail.rows.filter(r => `${r.name} ${r.id} ${r.tag} ${r.owner}`.toLowerCase().includes(kw)) : stateDetail.rows
  }, [stateDetail, q])

  const exportCsv = () => {
    if (!open || !stateDetail) return
    const head = ["Tên KH", "Mã/ID", open.segment === "b2b" ? "Tier" : "Thị trường", open.segment === "b2b" ? "PIC" : "Email (đã che)", "Doanh thu quý này", "Doanh thu quý trước", "Đơn đầu tiên", "Đơn gần nhất"]
    const lines = [head, ...stateDetail.rows.map(r => [r.name, r.id, r.tag, r.owner, r.revenue, r.prevRevenue, r.firstOrderAt, r.lastOrderAt])]
    const blob = new Blob(["﻿" + lines.map(l => l.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `kh_${open.segment}_${open.state}_${quarter}_${year}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className={cn("space-y-4", loading && "opacity-50 pointer-events-none")}>
      {segRow("b2b", "Khách doanh nghiệp — số liệu từ gohub_dw")}
      {canViewB2c
        ? segRow("b2c", "Khách cá nhân — số liệu từ Admin GoHub API (toàn bộ thị trường VN + US)")
        : <p className="text-xs text-slate-400">Số liệu KH B2C chỉ hiển thị cho vai trò được cấp quyền xem khách B2C.</p>}
      {b2cSummary.status === "error" && <p className="text-xs text-red-600">Không lấy được số liệu B2C: {b2cSummary.error}</p>}

      {open && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">
                {SEGMENT_LABEL[open.segment]} · {STATE_LABEL[open.state]}
                {stateDetail && <span className="ml-2 font-normal text-slate-500">({stateDetail.count.toLocaleString("vi-VN")} KH{open.state === "inactive" && stateDetail.recentCount != null && stateDetail.recentCount !== stateDetail.count ? `, liệt kê ${stateDetail.recentCount.toLocaleString("vi-VN")} KH có mua quý trước` : ""})</span>}
              </p>
              {open.state === "inactive" && open.segment === "b2b" && (
                <p className="text-[11px] text-slate-500">Số KH rời bỏ B2B tính trên toàn bộ lịch sử; bảng chỉ liệt kê KH có doanh thu ở quý liền trước (KH cần theo dõi).</p>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / mã / PIC…"
                className="w-48 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-brand-500 focus:outline-none" />
            </div>
            <button type="button" onClick={exportCsv} disabled={!stateDetail}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button type="button" onClick={() => setOpen(null)} aria-label="Đóng danh sách" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {cur?.status === "loading" && (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {open.segment === "b2c" ? "Đang tải danh sách KH B2C từ Admin GoHub API (lần đầu khoảng 1–2 phút, các lần sau tức thì)…" : "Đang tải danh sách KH…"}
            </div>
          )}
          {cur?.status === "error" && <div className="px-4 py-6 text-sm text-red-600">Không tải được danh sách: {cur.error}</div>}

          {stateDetail && (
            <div className="max-h-[480px] overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Khách hàng</th>
                    <th className="px-3 py-2">{open.segment === "b2b" ? "Tier" : "Thị trường"}</th>
                    <th className="px-3 py-2">{open.segment === "b2b" ? "PIC" : "Email"}</th>
                    <th className="px-3 py-2 text-right">DT quý này</th>
                    <th className="px-3 py-2 text-right">DT quý trước</th>
                    <th className="px-3 py-2">Đơn đầu</th>
                    {open.segment === "b2c" && <th className="px-3 py-2">Đơn gần nhất</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-slate-800">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{r.id}</div>
                      </td>
                      <td className="px-3 py-1.5">{r.tag || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600">{r.owner || "—"}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", open.state === "inactive" && "text-slate-300")}>{fc(r.revenue)}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", open.state !== "inactive" && "text-slate-500")}>{fc(r.prevRevenue)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{r.firstOrderAt || "—"}</td>
                      {open.segment === "b2c" && <td className="px-3 py-1.5 tabular-nums text-slate-600">{r.lastOrderAt || "—"}</td>}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">{q ? "Không có KH khớp từ khoá." : "Chưa có KH nào trong nhóm này."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {stateDetail?.truncated && (
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              Chỉ hiển thị {stateDetail.rows.length.toLocaleString("vi-VN")} KH đầu (sắp theo doanh thu giảm dần) trên tổng {stateDetail.count.toLocaleString("vi-VN")} KH.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
