"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Calculator, PackagePlus } from "lucide-react"

const PriceCalc = dynamic(() => import("@/components/product-tools/price-calc"), { loading: () => <div className="text-sm text-gray-400 py-6">Đang tải...</div> })
const CreateProducts = dynamic(() => import("@/components/product-tools/create-products"), { loading: () => <div className="text-sm text-gray-400 py-6">Đang tải...</div> })

type Mode = "price" | "create"

// Tính giá & Tạo sản phẩm (s236): Creator có cả hai; người khác tuỳ quyền Creator cấp (tính giá / tạo sản phẩm).
export default function ProductToolsPage() {
  const [me, setMe] = useState<{ pricing: boolean; create: boolean; creator: boolean } | null>(null)
  const [mode, setMode] = useState<Mode>("price")
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/user/me", { cache: "no-store" }).then(r => (r.ok ? r.json() : null))
      .then(d => setMe({ pricing: d?.pricing_enabled === true, create: d?.product_create_enabled === true, creator: d?.role === "creator" }))
      .catch(() => setMe({ pricing: false, create: false, creator: false }))
  }, [])
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode")
    if (m === "create") setMode("create")
  }, [])

  const notify = (type: "success" | "error", text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  if (!me) return <div className="p-6 text-sm text-gray-400">Đang tải...</div>
  if (!me.pricing) return <div className="p-6 text-sm text-gray-500">Bạn chưa được cấp quyền dùng tab này. Nhờ Hiếu cấp quyền.</div>
  const active: Mode = me.create ? mode : "price"

  const tab = (m: Mode, icon: React.ReactNode, title: string, desc: string) => (
    <button key={m} onClick={() => setMode(m)} className={`text-left flex-1 min-w-[240px] p-4 rounded-2xl border-2 transition ${active === m ? "border-brand-600 bg-brand-50 dark:bg-brand-950/30" : "border-gray-200 dark:border-slate-700 hover:border-gray-300 bg-white dark:bg-slate-900"}`}>
      <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-slate-100">{icon}{title}</div>
      <div className="text-xs text-gray-500 mt-1">{desc}</div>
    </button>
  )

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Tính giá & Tạo sản phẩm</h1>
        <p className="text-sm text-gray-500 mt-1">Tra giá vốn gói data của các nhà cung cấp (BC Datapool, 3HK){me.create ? " và tạo file sản phẩm để import vào hệ thống" : ""}.</p>
      </div>

      {me.create && (
        <div className="flex flex-wrap gap-3">
          {tab("price", <Calculator size={18} />, "Tính giá", "Chọn loại SIM, nước, gói và số ngày để xem giá vốn. Không cần tạo file.")}
          {tab("create", <PackagePlus size={18} />, "Tạo sản phẩm", "Tạo mã SKU/Product và xuất file Excel để import vào hệ thống.")}
        </div>
      )}

      {msg && <div className={`p-3 rounded-xl text-sm ${msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

      {active === "price" ? <PriceCalc /> : <CreateProducts onNotify={notify} canUpload={me.creator} />}
    </div>
  )
}
