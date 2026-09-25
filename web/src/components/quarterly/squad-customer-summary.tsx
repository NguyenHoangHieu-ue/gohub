"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { fc } from "@/lib/quarterly-format"

// Khối "KH đang mua" + 4 ô vòng đời của 1 squad. Bấm 1 ô / 1 tier → xổ danh sách khách hàng ngay bên dưới.
// Dữ liệu từ route squad-progress: `customers[]` (có `lifecycle_group`, `prev_revenue`), `tier_counts`, `lifecycle`.

type ViewKey = "all" | "Strategic" | "VIP" | "Gold" | "Silver" | "new" | "continuing" | "returning" | "inactive"
const TIERS = ["Strategic", "VIP", "Gold", "Silver"] as const
const MAX_ROWS = 300

interface Props {
  sq: any
  picName: (code: string) => string
}

export function SquadCustomerSummary({ sq, picName }: Props) {
  const [view, setView] = useState<ViewKey | null>(null)
  if (!sq.lifecycle) return null

  const toggle = (k: ViewKey) => setView(v => (v === k ? null : k))

  const boxes: { k: ViewKey; icon: string; label: string; tip: string; count: number; rev: number; revLabel: string; cls: string; ring: string }[] = [
    { k: "new", icon: "🆕", label: "KH mới trong quý", tip: "Đơn đầu tiên rơi trong quý này",
      count: sq.lifecycle.new.count, rev: sq.lifecycle.new.revenue, revLabel: "Doanh thu",
      cls: "bg-sky-50 border-sky-200 text-sky-700", ring: "ring-sky-400" },
    { k: "continuing", icon: "🔁", label: "KH cũ tiếp tục mua", tip: "Đã mua trước quý này và cũng có mua ở quý trước",
      count: sq.lifecycle.continuing.count, rev: sq.lifecycle.continuing.revenue, revLabel: "Doanh thu",
      cls: "bg-indigo-50 border-indigo-200 text-indigo-700", ring: "ring-indigo-400" },
    { k: "returning", icon: "↩️", label: "KH cũ quay lại sau gián đoạn", tip: "Đã mua trước quý này, quý trước KHÔNG mua, quý này mua lại",
      count: sq.lifecycle.returning.count, rev: sq.lifecycle.returning.revenue, revLabel: "Doanh thu",
      cls: "bg-emerald-50 border-emerald-200 text-emerald-700", ring: "ring-emerald-400" },
    { k: "inactive", icon: "😴", label: "KH cũ chưa quay lại", tip: "Có mua ở quý trước nhưng quý này chưa có đơn nào",
      count: sq.lifecycle.inactive.count, rev: sq.lifecycle.inactive.lostRevenue, revLabel: "Quý trước",
      cls: "bg-slate-50 border-slate-300 text-slate-600", ring: "ring-slate-400" },
  ]

  const customers: any[] = sq.customers ?? []
  const inactiveList: any[] = sq.lifecycle.inactive.list ?? []
  const title =
    view === "all" ? "Khách hàng đang mua" :
    view && (TIERS as readonly string[]).includes(view) ? `Khách hàng tier ${view}` :
    boxes.find(b => b.k === view)?.label ?? ""

  const rows: any[] =
    view === "all" ? customers :
    view && (TIERS as readonly string[]).includes(view) ? customers.filter(c => c.tier === view) :
    view === "inactive" ? inactiveList :
    view ? customers.filter(c => c.lifecycle_group === view) : []
  const sorted = [...rows].sort((a, b) =>
    view === "inactive" ? b.lastRevenue - a.lastRevenue : b.revenue_pr - a.revenue_pr)
  const shown = sorted.slice(0, MAX_ROWS)

  const chipCls = (k: ViewKey, disabled: boolean) => cn(
    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors",
    disabled ? "opacity-40 cursor-default" : "hover:bg-slate-100 cursor-pointer",
    view === k && "bg-slate-100 ring-1 ring-slate-300")

  return (
    <>
      <div className="ml-6 mt-2.5 rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[11px]">
          <button type="button" onClick={() => toggle("all")} className={chipCls("all", false)} title="Xem danh sách KH đang mua">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KH đang mua · {sq.customer_count}</span>
          </button>
          {TIERS.map(t => {
            const n = sq.tier_counts?.[t] ?? 0
            return (
              <button key={t} type="button" disabled={n === 0} onClick={() => toggle(t)} className={chipCls(t, n === 0)}
                title={`Xem ${n} KH tier ${t}`}>
                <span className="text-slate-500">{t}</span>
                <span className="font-bold text-slate-800 tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {boxes.map(x => (
            <button key={x.k} type="button" title={x.tip} onClick={() => toggle(x.k)}
              className={cn("text-left rounded-md border px-2.5 py-2 transition-shadow hover:shadow-sm", x.cls, view === x.k && `ring-2 ${x.ring}`)}>
              <div className="text-[10px] font-semibold leading-tight">{x.icon} {x.label}</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-base font-bold tabular-nums leading-none">{x.count}</span>
                <span className="text-[10px] opacity-70 tabular-nums">{x.revLabel} {formatCompactNumber(x.rev)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {view && (
        <div className="ml-6 mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-700">
              {title} · {rows.length}
              {view === "inactive" && sq.lifecycle.inactive.count > rows.length && ` / ${sq.lifecycle.inactive.count}`}
              {rows.length > MAX_ROWS && <span className="ml-1 font-normal text-slate-400">(hiện {MAX_ROWS} đầu theo doanh thu)</span>}
            </span>
            <button type="button" onClick={() => setView(null)} className="text-slate-400 hover:text-slate-700" aria-label="Đóng danh sách">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-slate-400">Không có khách hàng nào.</p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-slate-500 uppercase text-[9px]">
                    <th className="px-3 py-2 text-left font-semibold">Khách hàng</th>
                    <th className="px-3 py-2 text-left font-semibold">{view === "inactive" ? "PIC" : "Tier · PIC"}</th>
                    {view === "inactive" ? (
                      <>
                        <th className="px-3 py-2 text-right font-semibold">Quý trước</th>
                        <th className="px-3 py-2 text-right font-semibold">Đơn đầu tiên</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-right font-semibold">Rev PR</th>
                        <th className="px-3 py-2 text-right font-semibold">Quý trước</th>
                        <th className="px-3 py-2 text-right font-semibold">CM1 PR</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((c: any, i: number) => view === "inactive" ? (
                    <tr key={c.code} className={i % 2 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{c.name}<span className="ml-1.5 text-[9px] text-slate-400">{c.code}</span></td>
                      <td className="px-3 py-1.5 text-slate-500">{c.sales_pic ? picName(c.sales_pic) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fc(c.lastRevenue)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{c.first_order_date || "—"}</td>
                    </tr>
                  ) : (
                    <tr key={c.customer_code} className={i % 2 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="px-3 py-1.5 font-medium text-slate-700">
                        {c.customer_name}
                        <span className={cn("ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold", c.region === "US" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>{c.region}</span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{c.tier}<span className="text-slate-300 mx-1">·</span>{picName(c.sales_pic)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-blue-600 font-medium">{fc(c.revenue_pr)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{c.prev_revenue > 0 ? fc(c.prev_revenue) : "—"}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", c.cm1_pr < 0 ? "text-red-500" : "text-slate-600")}>{fc(c.cm1_pr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
