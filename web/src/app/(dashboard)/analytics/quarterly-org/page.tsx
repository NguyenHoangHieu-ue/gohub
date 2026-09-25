"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { RefreshCw, Building2, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRoleGuard } from "@/lib/use-role-guard"
import type { QReport, Channel } from "@/lib/quarterly-types"
import { fc, pct } from "@/lib/quarterly-format"
import { PivotTable } from "@/components/quarterly/pivot-table"
import { LogicNote, StatTile } from "@/components/dashboard-kit"

// Bản "duplicate" của Quarter Report (s200) — group B2B theo Organization thay vì customer_code.
// Tái dùng nguyên API `quarterly-report` cho 2 số tổng đầu trang (tiền không đổi theo cách gộp AI
// là chủ — chỉ ai được GHI NHẬN đổi). Phần khác biệt duy nhất là bảng breakdown B2B, lấy từ route
// riêng `quarterly-org-customers`. Xem docs/wiki/system/tabs/analytics-quarterly.md mục "s200".

interface OrgRow {
  orgKey: string; orgName: string; region: string; memberCodes: string[]; memberCount: number
  members: { code: string; name: string; revenue: number }[]
  revenue: number; gm: number; gmPct: number; hk3Rev: number; hk3Pct: number
  monthSummary: Record<string, { revenue: number; gm: number; hk3Pct: number; isProjected: boolean; actualRevenue?: number; actualGm?: number }>
}
interface OrgTier {
  tier: string; totalRevenue: number; totalGm: number; totalGmPct: number
  totalGroupCost: number; totalCm1: number; totalCm1Pct: number; totalHk3Rev: number; totalHk3Pct: number
  organizations: OrgRow[]; organizationCount: number
}
interface OrgData { quarter: string; year: number; months: string[]; tiers: OrgTier[] }

function orgsToChannels(orgs: OrgRow[], months: string[]): Channel[] {
  return orgs.map(o => {
    const monthsArr = months.map((m, i) => {
      const d = o.monthSummary[m]
      if (!d) return { month: m, revenue: 0, gp: 0, channelCost: 0, cm1: 0, cm1Pct: 0, momPct: null }
      const prevM = i > 0 ? months[i - 1] : null
      const prevD = prevM ? o.monthSummary[prevM] : undefined
      const momPct = prevD && prevD.revenue > 0 ? Math.round((d.revenue - prevD.revenue) / prevD.revenue * 1000) / 10 : null
      return {
        month: m, revenue: d.revenue, gp: d.gm, channelCost: 0,
        cm1: d.gm, cm1Pct: d.revenue > 0 ? Math.round(d.gm / d.revenue * 1000) / 10 : 0,
        momPct, three_hk_pct: d.hk3Pct,
        isProjected: d.isProjected,
        ...(d.isProjected && { actualRevenue: d.actualRevenue, actualGp: d.actualGm, actualCm1: d.actualGm }),
      }
    })
    const name = `${o.orgName}${o.memberCount > 1 ? ` · ${o.memberCount} mã KH` : ""} [${o.region}]`
    return { name, totalRevenue: o.revenue, months: monthsArr }
  }).filter(c => c.totalRevenue > 0)
}

export default function QuarterlyOrgPage() {
  const { ready } = useRoleGuard(["admin", "creator", "bod", "b2b"])
  if (!ready) return null
  return <QuarterlyOrgContent />
}

function QuarterlyOrgContent() {
  const today = new Date()
  const quarters = ["Q1", "Q2", "Q3", "Q4"]
  const years = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const [selQ, setSelQ] = useState(`Q${Math.ceil((today.getMonth() + 1) / 3)}`)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [companyCode, setCompanyCode] = useState<"ALL" | "VN" | "US">("ALL")
  const [includeShip, setIncludeShip] = useState(true)
  const [includeInternalOps, setIncludeInternalOps] = useState(true)
  const [report, setReport] = useState<QReport | null>(null)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set(["Strategic"]))

  const fetchAll = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        quarter: selQ, year: String(selYear), companyCode,
        includeShip: includeShip ? "1" : "0", includeInternalOps: includeInternalOps ? "1" : "0",
        ...(refresh && { nocache: "1" }),
      })
      const [rRes, oRes] = await Promise.all([
        fetch(`/api/analytics/quarterly-report?${params}`),
        fetch(`/api/analytics/quarterly-org-customers?${params}`),
      ])
      if (rRes.ok) setReport(await rRes.json())
      if (oRes.ok) setOrgData(await oRes.json())
    } finally { setLoading(false) }
  }, [selQ, selYear, companyCode, includeShip, includeInternalOps])

  useEffect(() => { fetchAll() }, [fetchAll])

  const b2b = report?.quarterTotal.b2b

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#0f4c81]" />Quarter Report (Organization)
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Doanh thu/GP/CM1 B2B gộp theo tổ chức — xem đầy đủ Target/CH.Cost per-KH ở{" "}
            <Link href="/analytics/quarterly" className="text-[#0f4c81] underline">Quarter Report gốc</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", selQ === q ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {q}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
              className="px-2 py-1.5 text-xs font-semibold bg-transparent text-slate-700 outline-none cursor-pointer">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(["ALL", "VN", "US"] as const).map(code => (
              <button key={code} onClick={() => setCompanyCode(code)}
                className={cn("px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                  companyCode === code ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {code === "VN" ? "🇻🇳 VN" : code === "US" ? "🇺🇸 US" : "ALL"}
              </button>
            ))}
          </div>
          {([["Phí ship", includeShip, setIncludeShip], ["Đơn nội bộ", includeInternalOps, setIncludeInternalOps]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
            <label key={label} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-3 h-3 accent-amber-500" />
              <span className={cn("text-[10px] font-semibold", val ? "text-amber-600" : "text-slate-500")}>{label}</span>
            </label>
          ))}
          <button onClick={() => fetchAll(true)} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Đang tải…" : "Tải lại mới"}
          </button>
        </div>
      </div>

      <LogicNote collapsible label="Về trang này">
        Trang này gộp số liệu B2B theo <strong>Organization</strong> (khi 1 công ty mẹ có nhiều mã KH chi
        nhánh, vd "VN_Org Vietravel" gồm hơn 20 mã KH chi nhánh khác nhau) thay vì theo từng mã KH lẻ như
        Quarter Report gốc. <strong>Hiện chỉ ~300 mã KH B2B đang phát sinh đơn được gắn tổ chức</strong> —
        KH nào chưa được gán sẽ tự hiển thị như 1 tổ chức riêng (giống hệt bản theo KH), không có rủi ro
        gộp sai. Một tổ chức có thể có nhiều chi nhánh ở tier khác nhau (vd vừa Gold vừa Silver) — trang
        xếp cả tổ chức vào tier của chi nhánh có doanh thu lớn nhất. Trang này KHÔNG hiện chi phí per-KH
        (CH.Cost Turso) — chi phí đó gắn với mã KH lẻ, không có ý nghĩa ở mức tổ chức gộp nhiều mã; CM1
        hiển thị chỉ trừ Group Cost B2B.
      </LogicNote>

      {report && b2b && (
        <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity", loading && "opacity-50 pointer-events-none")}>
          <StatTile label="Doanh thu B2B (Actual)" value={fc(b2b.revenue)} accent="revenue" />
          <StatTile label="CM1 B2B (Actual)" value={fc(b2b.cm1)} unit={pct(b2b.cm1Pct)} accent="margin" />
          <StatTile label="Số ngày đã qua trong quý" value={`${report.elapsed_days}/${report.quarter_days}`} unit="ngày"
            icon={<CalendarDays className="w-5 h-5" />} accent="neutral" />
        </div>
      )}

      {!loading && orgData && orgData.tiers.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có dữ liệu B2B cho {selQ}-{selYear}.</div>
      )}

      <div className={cn("space-y-4 transition-opacity", loading && "opacity-50 pointer-events-none")}>
        {orgData?.tiers.map(tier => {
          const multiCustOrgs = tier.organizations.filter(o => o.memberCount > 1)
          return (
            <React.Fragment key={tier.tier}>
              <PivotTable title={`${tier.tier} — ${tier.organizationCount} Organization × Tháng (CM1 quý ${fc(tier.totalCm1)}, ${pct(tier.totalCm1Pct)})`}
                icon={Building2}
                channels={orgsToChannels(tier.organizations, orgData.months)}
                months={orgData.months}
                expanded={expandedTiers.has(tier.tier)}
                onToggle={() => setExpandedTiers(prev => { const next = new Set(prev); next.has(tier.tier) ? next.delete(tier.tier) : next.add(tier.tier); return next })} />

              {/* Drill-down Organization → Khách hàng — chỉ hiện tổ chức gộp ≥2 mã KH */}
              {expandedTiers.has(tier.tier) && multiCustOrgs.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    {tier.tier} — Tổ chức gồm nhiều mã KH ({multiCustOrgs.length})
                  </p>
                  <div className="space-y-1.5">
                    {multiCustOrgs.map(o => (
                      <details key={o.orgKey} className="border border-slate-100 rounded-lg">
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                          <span>{o.orgName} <span className="text-slate-400 font-normal">[{o.region}]</span></span>
                          <span className="text-slate-400 font-normal">{o.memberCount} mã KH · {fc(o.revenue)}</span>
                        </summary>
                        <ul className="px-3 pb-2 space-y-0.5">
                          {o.members.map(m => (
                            <li key={m.code} className="flex items-center justify-between text-[11px] text-slate-600 py-0.5">
                              <span>{m.name} <span className="text-slate-400">({m.code})</span></span>
                              <span className="tabular-nums text-slate-500">{fc(m.revenue)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
