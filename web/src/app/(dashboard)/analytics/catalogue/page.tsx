"use client"

import React, { Suspense, useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { AlertTriangle, Layers, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/dashboard-kit"
import { buildCountryStats, isSellable } from "@/lib/catalogue/country-index"
import { findUnrecognized } from "@/lib/catalogue/auto-names"
import { useCatalogueIndex } from "@/components/catalogue/use-catalogue"
import { CountryHome } from "@/components/catalogue/country-home"
import { CountryPage } from "@/components/catalogue/country-page"
import { VendorView } from "@/components/catalogue/vendor-view"
import { ProductDrawer } from "@/components/catalogue/product-drawer"
import { UnrecognizedNotice } from "@/components/catalogue/unrecognized-notice"

// Product Catalogue — dựng lại hoàn toàn (s201, 2026-09-19). Mục tiêu: người không rành kỹ thuật vẫn biết
// NƯỚC nào có những sản phẩm nào, của NHÀ CUNG CẤP nào, dùng NHÀ MẠNG nào, chi tiết ra sao.
// Đi theo cách người dùng nghĩ: chọn nước → gói xếp theo nhà cung cấp → bấm gói xem chi tiết.
// Nước lấy từ products.supported_countries (ISO), không suy từ mã SKU; không doanh thu, không AI.
// Trạng thái nằm trong URL (?country=JP&vendor=WM&p=<mã gói>) để gửi link cho đồng nghiệp.

type Tab = "country" | "vendor"

function fmtDateTime(iso: string | null): string {
  if (!iso) return "chưa rõ"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "chưa rõ"
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function CatalogueInner() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const { data, error, loading, reload } = useCatalogueIndex()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role

  const country = sp.get("country")?.toUpperCase() ?? null
  const vendor = sp.get("vendor")
  const product = sp.get("p")
  const tab: Tab = sp.get("tab") === "vendor" ? "vendor" : "country"
  const [refreshing, setRefreshing] = useState(false)

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [sp, router, pathname])

  const stats = useMemo(() => (data ? buildCountryStats(data.products, data.countries) : []), [data])
  const sellingCount = useMemo(() => data?.products.filter(isSellable).length ?? 0, [data])
  const vendorCount = useMemo(() => new Set((data?.products ?? []).filter(isSellable).map(p => p.vendorCode)).size, [data])

  const unrecognized = useMemo(() => (data && (role === "admin" || role === "creator") ? findUnrecognized(data) : null), [data, role])

  const ageDays = data?.lastSync ? Math.floor((Date.now() - new Date(data.lastSync).getTime()) / 86_400_000) : null
  const stale = ageDays != null && ageDays >= 3

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm"><Layers className="h-5 w-5" /></span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Danh mục sản phẩm</h1>
            <p className="text-sm text-slate-500">Nước nào có gói gì, của nhà cung cấp nào, dùng nhà mạng nào.</p>
          </div>
        </div>
        <button
          type="button" disabled={loading || refreshing}
          onClick={async () => { setRefreshing(true); await reload(true); setRefreshing(false) }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", (loading || refreshing) && "animate-spin")} /> Tải lại
        </button>
      </header>

      {data && (
        <div className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-sm",
          stale ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600",
        )}>
          {stale && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            Dữ liệu sản phẩm cập nhật lần cuối: <b>{fmtDateTime(data.lastSync)}</b>
            {stale && <> (cách đây {ageDays} ngày) — có thể chưa có gói mới. Đây là do đồng bộ dữ liệu, không phải lỗi hiển thị.</>}
          </span>
          <span className="text-slate-400">·</span>
          <span>{stats.length} nước · {sellingCount} gói đang bán · {vendorCount} nhà cung cấp</span>
        </div>
      )}

      {unrecognized && unrecognized.total > 0 && <UnrecognizedNotice u={unrecognized} />}

      {loading && !data && (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-3xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        </div>
      )}

      {error && !data && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Hiếu đang fix, vui lòng đợi. <span className="text-red-400">({error})</span>
        </div>
      )}

      {data && (
        <>
          {!country && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold">
              {([["country", "Theo nước"], ["vendor", "Theo nhà cung cấp"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} type="button" onClick={() => go({ tab: k === "country" ? null : k })}
                  className={cn("rounded-lg px-4 py-2 transition-colors", tab === k ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {country ? (
            <CountryPage
              key={`${country}:${vendor ?? ""}`}
              index={data} code={country} initialVendor={vendor} activeProduct={product}
              onBack={() => go({ country: null, vendor: null, p: null })}
              onOpenProduct={code => go({ p: code })}
            />
          ) : tab === "vendor" ? (
            <VendorView index={data} onPick={(c, v) => go({ country: c, vendor: v, tab: null })} />
          ) : (
            <CountryHome stats={stats} refs={data.countries} onPick={c => go({ country: c })} />
          )}
        </>
      )}

      {data && product && (
        <ProductDrawer code={product} index={data} contextCountry={country} onClose={() => go({ p: null })} />
      )}
    </div>
  )
}

export default function ProductCataloguePage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-36 w-full rounded-3xl" /></div>}>
      <CatalogueInner />
    </Suspense>
  )
}
