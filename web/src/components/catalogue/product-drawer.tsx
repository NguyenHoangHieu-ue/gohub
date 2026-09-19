"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogueIndex, CatalogueProductLite, CatalogueSkuRow } from "@/lib/catalogue/types"
import { carrierForCountry, parseCarrierMap } from "@/lib/catalogue/carriers"
import {
  dataAmountLabel, daysLabel, dataKindLabel, simExplain, simLabel, statusLabel, summarySentences, tenantLabel,
  throttleSentence, toGb, yesNo, dailyResetSentence, SELLABLE_STATUSES,
} from "@/lib/catalogue/plain-language"
import { countryAliases, countryNameVn } from "@/lib/catalogue/country-index"
import { makeVendorNamer } from "@/lib/catalogue/auto-names"
import { useProductDetail } from "./use-catalogue"
import { Badge, CopyButton, Flag, InfoRow, Section } from "./catalogue-ui"
import { Skeleton } from "@/components/dashboard-kit"

const str = (v: unknown): string => (v == null ? "" : String(v).trim())

/** Tách đoạn ghi chú thành các gạch đầu dòng dễ đọc ("- a - b" hoặc xuống dòng). */
export function toBullets(text: string): string[] {
  const t = text.replace(/\r/g, "").trim()
  if (!t) return []
  const lines = t.includes("\n") ? t.split("\n") : t.startsWith("-") ? t.split(/\s+-\s+/) : [t]
  return lines.map(l => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean)
}

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <>
      {parts.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all font-medium text-brand-600 underline">{p}</a>
        : <React.Fragment key={i}>{p}</React.Fragment>)}
    </>
  )
}

function jsonValue(v: unknown): string {
  const s = str(v)
  if (!s.startsWith("{")) return s
  try { const o = JSON.parse(s); return o?.value ? `${o.value}${o.key ? ` (${o.key})` : ""}` : s } catch { return s }
}

export function ProductDrawer({ code, index, contextCountry, onClose }: {
  code: string
  index: CatalogueIndex
  contextCountry: string | null
  onClose: () => void
}) {
  const { detail, error, loading } = useProductDetail(code)
  const [showSkuTable, setShowSkuTable] = useState(false)
  const [showTech, setShowTech] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev }
  }, [onClose])

  const lite: CatalogueProductLite | undefined = useMemo(() => index.products.find(p => p.code === code), [index.products, code])
  const namer = useMemo(() => makeVendorNamer(index), [index])
  const refMap = useMemo(() => new Map(index.countries.map(c => [c.code.toUpperCase(), c])), [index.countries])
  const knownLabels = useMemo(() => index.countries.map(c => c.name), [index.countries])
  const vendorName = lite ? namer.name(lite.vendorCode) : ""
  const prod = detail?.product ?? {}

  const countryNames = useMemo(() => (lite?.countries ?? []).map(c => countryNameVn(c, refMap.get(c))), [lite, refMap])
  const ctx = contextCountry ? contextCountry.toUpperCase() : null
  const carrierHere = lite && ctx
    ? carrierForCountry(lite.carrierRaw, countryAliases(ctx, refMap.get(ctx)), knownLabels) : null
  const carrierText = carrierHere && (carrierHere.mode === "single" || carrierHere.mode === "country") ? carrierHere.text : null

  const liveSkus: CatalogueSkuRow[] = useMemo(() => {
    return (detail?.skus ?? []).filter(s => SELLABLE_STATUSES.has(s.status))
  }, [detail])

  // "Xem nhanh": mỗi dung lượng → các số ngày có sẵn
  const quick = useMemo(() => {
    const m = new Map<string, { gb: number; days: Set<number> }>()
    for (const s of liveSkus) {
      const label = dataAmountLabel(s.dataAmount, s.dataUnit)
      const gb = toGb(s.dataAmount, s.dataUnit) ?? 0
      const e = m.get(label) ?? { gb, days: new Set<number>() }
      if (s.days != null) e.days.add(Number(s.days))
      m.set(label, e)
    }
    return Array.from(m, ([label, e]) => ({ label, gb: e.gb, days: Array.from(e.days).sort((a, b) => a - b) })).sort((a, b) => a.gb - b.gb)
  }, [liveSkus])

  const perCountry = useMemo(() => (lite ? parseCarrierMap(lite.carrierRaw, knownLabels) : null), [lite, knownLabels])
  const [allCountries, setAllCountries] = useState(false)
  const shownCountries = allCountries ? lite?.countries ?? [] : (lite?.countries ?? []).slice(0, 24)

  const apn = str(prod.apn)
  const dailyReset = str(prod.daily_reset_time)
  const activationTime = str(prod.activation_time)
  const activation = str(prod.activation)
  const unsupported = str(prod.unsupported_apps)
  const perks = str(prod.telco_perks)
  const note = str(prod.note)
  const kycLinks = str(prod.kyc_links)
  const topUp = yesNo(str(prod.top_up_options) || null)
  const cautions = [unsupported, perks, note, kycLinks, lite?.kycNeeded === true ? "kyc" : ""].some(Boolean)

  const panel = (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/40 backdrop-blur-[1px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" aria-label="Chi tiết gói" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            {lite ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={lite.sim === "eSIM" ? "brand" : "amber"}>{simLabel(lite.sim)}</Badge>
                  <Badge tone={SELLABLE_STATUSES.has(lite.status) ? "green" : "red"}>{statusLabel(lite.status)}</Badge>
                  {lite.network && <Badge tone="violet">{lite.network}</Badge>}
                </div>
                <h2 className="mt-1.5 text-xl font-bold text-slate-900">{vendorName} · {dataKindLabel(lite.dataKind)}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  {lite.countries.slice(0, 3).map(c => (
                    <span key={c} className="inline-flex items-center gap-1.5"><Flag code={c} width={18} />{countryNameVn(c, refMap.get(c))}</span>
                  ))}
                  {lite.countries.length > 3 && <span>+{lite.countries.length - 3} nước</span>}
                </p>
              </>
            ) : (
              <h2 className="text-xl font-bold text-slate-900">Gói {code}</h2>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-3 p-6">
              <Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" />
              <Skeleton className="mt-6 h-5 w-1/4" /><Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && (error.includes("404")
            ? <p className="m-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Gói này không còn trong danh mục (có thể đã ngưng bán).</p>
            : <p className="m-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">Hiếu đang fix, vui lòng đợi. ({error})</p>)}

          {lite && detail && (
            <>
              <Section title="Tóm tắt">
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {summarySentences(lite, { vendorName, countryNames, carrierText }).map((s, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" /><span>{s}</span></li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">{simExplain(lite.sim)}</p>
              </Section>

              <Section title="Các gói có sẵn" hint="Mỗi dòng là một mức dung lượng, kèm các số ngày sử dụng có thể chọn.">
                {quick.length === 0 ? (
                  <p className="text-sm text-slate-400">Chưa có gói nào đang bán.</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {quick.map(q => (
                      <div key={q.label} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <span className="w-32 shrink-0 text-sm font-bold text-slate-800">{q.label}{lite.dataKind === "daily" && q.gb < 9999 ? "/ngày" : ""}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {q.days.map(d => <span key={d} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{d} ngày</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" onClick={() => setShowSkuTable(v => !v)} className="font-semibold text-brand-600 hover:underline">
                    {showSkuTable ? "Ẩn" : "Xem"} chi tiết từng gói ({liveSkus.length})
                  </button>
                </div>
                {showSkuTable && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Dung lượng</th><th className="px-3 py-2 font-semibold">Số ngày</th>
                          <th className="px-3 py-2 font-semibold">Hết dung lượng thì sao?</th><th className="px-3 py-2 font-semibold">Nghe gọi</th>
                          <th className="px-3 py-2 font-semibold">Mã gói (SKU)</th>
                          {detail.canSeeCogs && <th className="px-3 py-2 font-semibold">Giá vốn</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {liveSkus.map(s => (
                          <tr key={s.code} className={cn(!SELLABLE_STATUSES.has(s.status) && "opacity-50")}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{dataAmountLabel(s.dataAmount, s.dataUnit)}</td>
                            <td className="px-3 py-2">{daysLabel(s.days)}</td>
                            <td className="px-3 py-2 text-slate-600">{throttleSentence(s.throttle) ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{s.callDetails || (yesNo(s.call) ? "Có" : "Không")}</td>
                            <td className="px-3 py-2"><span className="font-mono text-slate-500">{s.code}</span> <CopyButton text={s.code} /></td>
                            {detail.canSeeCogs && <td className="px-3 py-2 tabular-nums">{s.cogs != null ? `${Number(s.cogs).toLocaleString("vi-VN")} ${s.cogsCurrency ?? ""}` : "—"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {detail.canSeeCogs && <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">Cột giá vốn chỉ hiện với vai trò được cấp quyền.</p>}
                  </div>
                )}
              </Section>

              <Section title="Cài đặt & cách dùng">
                <dl>
                  <InfoRow label="Kích hoạt">{activationTime || <span className="text-slate-400">Chưa có thông tin</span>}</InfoRow>
                  {activation && <InfoRow label="Cách kích hoạt riêng"><Linkify text={activation} /></InfoRow>}
                  {lite.dataKind === "daily" && <InfoRow label="Cấp lại data mỗi ngày">{dailyResetSentence(dailyReset) ?? <span className="text-slate-400">Chưa có thông tin</span>}</InfoRow>}
                  <InfoRow label="APN (cài đặt mạng)">
                    {apn ? <span className="inline-flex flex-wrap items-center gap-2"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{apn}</code><CopyButton text={apn} /></span> : <span className="text-slate-400">Không cần / chưa có</span>}
                  </InfoRow>
                  <InfoRow label="Phát WiFi">{lite.hotspot === true ? "Được" : lite.hotspot === false ? "Không được" : <span className="text-slate-400">Chưa rõ</span>}</InfoRow>
                  <InfoRow label="Nạp thêm data">{topUp === true ? "Được" : topUp === false ? "Không nạp thêm được" : <span className="text-slate-400">Chưa rõ</span>}</InfoRow>
                  {lite.localNumber && <InfoRow label="Số điện thoại">Có số tại chỗ{lite.localNumberCountry ? ` (${lite.localNumberCountry})` : ""}</InfoRow>}
                </dl>
              </Section>

              {cautions && (
                <Section title="Lưu ý cần biết" hint="Những điểm khách hay hỏi hoặc dễ gặp lỗi.">
                  <div className="space-y-3 text-sm">
                    {lite.kycNeeded === true && (
                      <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                        <p className="font-semibold">Cần xác minh danh tính (KYC)</p>
                        <p className="mt-0.5 text-amber-800">Khách phải làm thủ tục này trước khi dùng được.{kycLinks && <> Xem: <Linkify text={kycLinks} /></>}</p>
                      </div>
                    )}
                    {unsupported && (
                      <div className="rounded-xl bg-red-50 p-3 text-red-800">
                        <p className="font-semibold">Ứng dụng KHÔNG dùng được</p>
                        <p className="mt-0.5">{unsupported}</p>
                      </div>
                    )}
                    {perks && (
                      <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
                        <p className="font-semibold">Ưu đãi của nhà mạng</p>
                        <p className="mt-0.5">{perks}</p>
                      </div>
                    )}
                    {note && (
                      <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
                        <p className="font-semibold">Ghi chú</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">{toBullets(note).map((n, i) => <li key={i}>{n}</li>)}</ul>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <Section title="Nước dùng được & nhà mạng">
                <div className="flex flex-wrap gap-1.5">
                  {shownCountries.map(c => (
                    <span key={c} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", c.toUpperCase() === ctx ? "border-brand-400 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 text-slate-600")}>
                      <Flag code={c} width={16} />{countryNameVn(c, refMap.get(c))}
                    </span>
                  ))}
                  {!allCountries && (lite.countries.length > 24) && (
                    <button type="button" onClick={() => setAllCountries(true)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-600 hover:underline">Xem đủ {lite.countries.length} nước</button>
                  )}
                </div>
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Nhà mạng</p>
                  {!lite.carrierRaw ? (
                    <p className="text-sm text-slate-400">Chưa có thông tin nhà mạng.</p>
                  ) : perCountry ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-left text-sm"><tbody className="divide-y divide-slate-100">
                        {perCountry.map((e, i) => (
                          <tr key={i}><td className="w-40 px-3 py-2 font-medium text-slate-700">{e.label}</td><td className="px-3 py-2 text-slate-600">{e.carriers}</td></tr>
                        ))}
                      </tbody></table>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{lite.carrierRaw}</p>
                  )}
                </div>
              </Section>

              <Section title="Thông tin kỹ thuật" hint="Dành cho nhân viên cần đối chiếu mã.">
                <button type="button" onClick={() => setShowTech(v => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                  {showTech ? "Thu gọn" : "Mở ra"} <ChevronDown className={cn("h-4 w-4 transition-transform", showTech && "rotate-180")} />
                </button>
                {showTech && (
                  <dl className="mt-3">
                    <InfoRow label="Mã gói (product)"><span className="inline-flex items-center gap-2"><code className="text-xs">{code}</code><CopyButton text={code} /></span></InfoRow>
                    <InfoRow label="Nhà cung cấp">{vendorName} <span className="text-slate-400">({lite.vendorCode})</span></InfoRow>
                    <InfoRow label="Nhà mạng (mã)">{str(prod.operator_code) || "—"}</InfoRow>
                    <InfoRow label="Pháp nhân">{tenantLabel(lite.tenant)}</InfoRow>
                    <InfoRow label="Loại sản phẩm">{jsonValue(prod.product_type) || "—"}</InfoRow>
                    <InfoRow label="Nguồn mua">{jsonValue(prod.source_type) || "—"} · {str(prod.purchase_type) || "—"}</InfoRow>
                    <InfoRow label="Kiểu gói">{str(prod.sku_type) || "—"} · {str(prod.import_type) || "—"}</InfoRow>
                    {str(prod.base_sim_esim_sku_code) && <InfoRow label="SKU nền (SIM/eSIM)">{str(prod.base_sim_esim_sku_code)}</InfoRow>}
                    <InfoRow label="Tạo lúc">{str(prod.date_created).slice(0, 10) || "—"}</InfoRow>
                    <InfoRow label="Sửa lần cuối">{str(prod.last_modified_date).slice(0, 10) || "—"}</InfoRow>
                    <InfoRow label="Tên hiển thị trên các kênh">
                      {detail.listings.length === 0 ? <span className="text-slate-400">Chưa có</span> : (
                        <ul className="space-y-1">
                          {detail.listings.slice(0, 40).map(l => (
                            <li key={l.code} className="text-xs"><code className="text-slate-500">{l.code}</code> — {l.nameVn || l.nameEn || "—"} <span className="text-slate-400">({l.type ?? "—"})</span></li>
                          ))}
                          {detail.listings.length > 40 && <li className="text-xs text-slate-400">… và {detail.listings.length - 40} listing khác</li>}
                        </ul>
                      )}
                    </InfoRow>
                  </dl>
                )}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  )

  return typeof document === "undefined" ? null : createPortal(panel, document.body)
}
