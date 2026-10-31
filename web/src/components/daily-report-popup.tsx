"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { X, Sparkles, Newspaper } from "lucide-react"

interface Triple { vn: number; us: number; total: number }
interface Topline {
  label: string; date: string; dayShort: string; prevDayShort: string; monthStr: string; daysElapsed: number; daysInMonth: number
  day: Triple; prevDay: Triple
  groups: Array<{ name: string; mtd: number; proRata: number; target: number }>
  mtdTotal: number; mtdGp: number
  cm1: Array<{ name: string; cm1Pct: number; target: number | null }>
  hk3Pct: number; hk3Target: number | null
  breakdown: Breakdown
}
interface Mv { name: string; cur: number; prev: number }
interface Breakdown { tiers: Mv[]; b2bTop: Array<Mv & { tier: string }>; b2bUp: Mv | null; b2bDown: Mv | null; b2cChannels: Mv[]; b2cUp: Mv | null; b2cDown: Mv | null }
interface Detail {
  days: string[]
  trend: Array<{ name: string; values: number[] }>
  topB2b: Array<{ name: string; values: number[] }>
  topB2c: Array<{ name: string; values: number[] }>
}
interface Payload { topline: Topline; detail: Detail; assessment: string | null }

// Tiền gọn: ≥ 1 tỷ → "x,xx tỷ", dưới → "xxx tr" (cùng quy ước card Lark).
const short = (n: number) => Math.abs(n) >= 1e9
  ? (Math.round(n / 1e7) / 100).toLocaleString("vi-VN") + " tỷ"
  : Math.round(n / 1e6).toLocaleString("vi-VN") + " tr"
const pct = (n: number) => (Math.round(n * 10) / 10).toLocaleString("vi-VN") + "%"
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const cmp = (c: number, p: number) => {
  if (!(p > 0)) return { text: "—", cls: "text-slate-400" }
  const d = ((c - p) / p) * 100
  return { text: `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))}`, cls: d >= 0 ? "text-emerald-600" : "text-rose-600" }
}
const progressCls = (v: number) => (v >= 100 ? "text-emerald-600" : v >= 85 ? "text-amber-600" : "text-rose-600")

const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

export function DailyReportPopup() {
  const { data: session } = useSession()
  const username = (session?.user as { username?: string } | undefined)?.username || ""
  const [data, setData] = useState<Payload | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (data || loading) return
    setLoading(true); setFailed(false)
    try {
      const res = await fetch("/api/analytics/daily-topline")
      if (!res.ok) throw new Error(String(res.status))
      setData((await res.json()) as Payload)
    } catch { setFailed(true) } finally { setLoading(false) }
  }, [data, loading])

  // Tự mở 1 lần/ngày/người (lần vào Dashboard đầu tiên trong ngày); đóng rồi thì chỉ mở lại bằng nút.
  useEffect(() => {
    if (!username) return
    const key = `daily_popup_seen:${username}:${todayVN()}`
    try { if (localStorage.getItem(key)) return } catch { /* localStorage chặn → vẫn hiện */ }
    setOpen(true); void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  const close = () => {
    setOpen(false)
    try { localStorage.setItem(`daily_popup_seen:${username}:${todayVN()}`, "1") } catch { /* bỏ qua */ }
  }
  const reopen = () => { setOpen(true); void load() }

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const t = data?.topline, d = data?.detail

  return (
    <>
      <button onClick={reopen} className="flex items-center gap-2 bg-white px-3 lg:px-4 py-2 rounded-lg border border-slate-200 shadow-sm h-[42px] text-xs lg:text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors">
        <Newspaper className="w-4 h-4" />Daily Report
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-3 sm:p-6" onClick={close}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Daily Report{t ? ` · ${t.label}` : ""}</h2>
                <p className="text-xs text-slate-500">Doanh thu đã giao · cùng số liệu với tin Daily trên Lark</p>
              </div>
              <button onClick={close} aria-label="Đóng" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-6 text-sm">
              {loading && <p className="text-slate-500">Đang tải báo cáo hôm nay…</p>}
              {failed && <p className="text-rose-600">Hiếu đang fix, vui lòng đợi. <button className="underline" onClick={() => void load()}>Thử lại</button></p>}

              {t && d && (
                <>
                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">I. Doanh thu hôm qua</h3>
                    <table className="w-full text-left">
                      <thead><tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="py-1.5 font-medium">Thị trường</th><th className="font-medium text-right">Hôm qua ({t.dayShort})</th>
                        <th className="font-medium text-right">Hôm trước ({t.prevDayShort})</th><th className="font-medium text-right">% so sánh</th>
                      </tr></thead>
                      <tbody>
                        {([["VN", t.day.vn, t.prevDay.vn], ["US", t.day.us, t.prevDay.us], ["Tổng", t.day.total, t.prevDay.total]] as const).map(([n, c, p]) => {
                          const x = cmp(c, p)
                          return (
                            <tr key={n} className={`border-b border-slate-50 ${n === "Tổng" ? "font-semibold" : ""}`}>
                              <td className="py-1.5">{n}</td><td className="text-right tabular-nums">{short(c)}</td>
                              <td className="text-right tabular-nums text-slate-500">{short(p)}</td><td className={`text-right tabular-nums ${x.cls}`}>{x.text}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>

                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">II. Tiến độ target tháng {t.monthStr.slice(5)} <span className="text-xs font-normal text-slate-500">(đã qua {t.daysElapsed}/{t.daysInMonth} ngày)</span></h3>
                    <table className="w-full text-left">
                      <thead><tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="py-1.5 font-medium">Nhóm</th><th className="font-medium text-right">Doanh thu tháng</th><th className="font-medium text-right">Pro-rata</th>
                        <th className="font-medium text-right">Target tháng</th><th className="font-medium text-right">% pro-rata/target</th>
                      </tr></thead>
                      <tbody>
                        {t.groups.map(g => {
                          const p = ratio(g.proRata, g.target)
                          return (
                            <tr key={g.name} className={`border-b border-slate-50 ${g.name === "Tổng" ? "font-semibold" : ""}`}>
                              <td className="py-1.5">{g.name}</td><td className="text-right tabular-nums">{short(g.mtd)}</td><td className="text-right tabular-nums text-slate-500">{short(g.proRata)}</td>
                              <td className="text-right tabular-nums">{g.target > 0 ? short(g.target) : <span className="text-slate-400">Chưa nhập target</span>}</td>
                              <td className={`text-right tabular-nums ${g.target > 0 ? progressCls(p) : "text-slate-400"}`}>{g.target > 0 ? pct(p) : "—"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>

                  {t.breakdown.tiers.length > 0 && (
                    <section>
                      <h3 className="font-bold text-slate-800 mb-2">III. B2B</h3>
                      <h4 className="font-semibold text-slate-700 mb-1 text-[13px]">Theo Tier</h4>
                      <MvTable first="Tier" t={t} rows={t.breakdown.tiers} />
                      {t.breakdown.b2bTop.length > 0 && (
                        <>
                          <h4 className="font-semibold text-slate-700 mt-4 mb-1 text-[13px]">Top 10 khách B2B</h4>
                          <MvTable first="Khách" t={t} rows={t.breakdown.b2bTop} tiers />
                        </>
                      )}
                      <Highlights top={[]} up={t.breakdown.b2bUp} down={t.breakdown.b2bDown} topLabel="" />
                    </section>
                  )}
                  {t.breakdown.b2cChannels.length > 0 && (
                    <section>
                      <h3 className="font-bold text-slate-800 mb-2">IV. B2C <span className="text-xs font-normal text-slate-500">(top 5 kênh)</span></h3>
                      <MvTable first="Kênh" t={t} rows={t.breakdown.b2cChannels} />
                      <Highlights top={[]} up={t.breakdown.b2cUp} down={t.breakdown.b2cDown} topLabel="" />
                    </section>
                  )}

                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">V. Hiệu quả <span className="text-xs font-normal text-slate-500">(lũy kế tháng)</span></h3>
                    <ul className="space-y-1 text-slate-700">
                      <li>GP tháng: <b>{short(t.mtdGp)}</b> ({pct(ratio(t.mtdGp, t.mtdTotal))} doanh thu)</li>
                      <li>CM1%: {t.cm1.map(c => <span key={c.name} className="mr-3">{c.name} <b>{pct(c.cm1Pct)}</b>{c.target != null ? <span className="text-slate-500"> (target {pct(c.target)})</span> : null}</span>)}</li>
                      <li>%3HK: <b>{pct(t.hk3Pct)}</b>{t.hk3Target != null ? <span className="text-slate-500"> (target {pct(t.hk3Target)})</span> : null}</li>
                    </ul>
                  </section>

                  {data?.assessment && (
                    <section className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                      <h3 className="font-bold text-blue-900 mb-1 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />VI. Đánh giá chung</h3>
                      <p className="text-slate-700 leading-relaxed">{data.assessment}</p>
                    </section>
                  )}

                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">VII. Xu hướng 3 ngày</h3>
                    <MiniTable days={d.days} rows={d.trend} />
                  </section>
                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">VIII. Top 10 khách B2B (3 ngày)</h3>
                    <MiniTable days={d.days} rows={d.topB2b} />
                  </section>
                  <section>
                    <h3 className="font-bold text-slate-800 mb-2">IX. Kênh B2C (3 ngày)</h3>
                    <MiniTable days={d.days} rows={d.topB2c} />
                  </section>
                </>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex justify-end rounded-b-2xl">
              <button onClick={close} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MvTable({ first, t, rows, tiers }: { first: string; t: Topline; rows: Array<Mv & { tier?: string }>; tiers?: boolean }) {
  return (
    <table className="w-full text-left">
      <thead><tr className="text-xs text-slate-500 border-b border-slate-100">
        <th className="py-1.5 font-medium">{first}</th>{tiers && <th className="font-medium">Tier</th>}<th className="font-medium text-right">Hôm qua ({t.dayShort})</th>
        <th className="font-medium text-right">Hôm trước ({t.prevDayShort})</th><th className="font-medium text-right">% so sánh</th>
      </tr></thead>
      <tbody>
        {rows.map(r => {
          const x = cmp(r.cur, r.prev)
          return (
            <tr key={r.name} className="border-b border-slate-50">
              <td className="py-1.5 pr-3 max-w-[14rem] truncate">{r.name}</td>{tiers && <td className="pr-3 text-slate-500">{r.tier}</td>}<td className="text-right tabular-nums">{short(r.cur)}</td>
              <td className="text-right tabular-nums text-slate-500">{short(r.prev)}</td><td className={`text-right tabular-nums ${x.cls}`}>{x.text}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Highlights({ top, up, down, topLabel }: { top: Mv[]; up: Mv | null; down: Mv | null; topLabel: string }) {
  if (!top.length && !up && !down) return null
  return (
    <ul className="mt-2 space-y-0.5 text-[13px] text-slate-700">
      {top.length > 0 && <li>{topLabel}: {top.map(x => `${x.name} ${short(x.cur)}`).join(" · ")}</li>}
      {up && <li><span className="text-emerald-600">▲ Tăng mạnh:</span> <b>{up.name}</b> {short(up.cur)} (+{short(up.cur - up.prev)} so với hôm trước)</li>}
      {down && <li><span className="text-rose-600">▼ Giảm mạnh:</span> <b>{down.name}</b> {short(down.cur)} (-{short(down.prev - down.cur)} so với hôm trước)</li>}
    </ul>
  )
}

function MiniTable({ days, rows }: { days: string[]; rows: Array<{ name: string; values: number[] }> }) {
  if (!rows.length) return <p className="text-slate-400 text-xs">Chưa có dữ liệu.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead><tr className="text-xs text-slate-500 border-b border-slate-100">
          <th className="py-1.5 font-medium">&nbsp;</th>{days.map(x => <th key={x} className="font-medium text-right">{x}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-slate-50">
              <td className="py-1.5 pr-3 max-w-[16rem] truncate">{r.name}</td>
              {r.values.map((v, i) => <td key={i} className="text-right tabular-nums">{short(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
