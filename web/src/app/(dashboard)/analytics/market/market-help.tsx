"use client"

import React, { useState } from "react"
import { Lightbulb, HelpCircle, X } from "lucide-react"

/** Vài câu tóm tắt bằng lời thường ở đầu màn hình — người xem không rành số liệu đọc là hiểu tình hình (Hiếu yêu cầu s225). */
export function InsightBox({ title = "Tóm tắt nhanh", lines }: { title?: string; lines: React.ReactNode[] }) {
  if (!lines.length) return null
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800"><Lightbulb className="w-4 h-4" />{title}</p>
      <ul className="mt-1.5 space-y-1 text-sm text-slate-700 list-disc pl-5">
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  )
}

const TERMS: [string, string][] = [
  ["Doanh thu", "Tiền bán hàng đã giao cho khách (không gồm phí ship, không gồm đơn nội bộ)."],
  ["Giá vốn", "Tiền GoHub trả cho nhà cung cấp để có 1 sản phẩm (gồm data và khung SIM/eSIM)."],
  ["Lãi gộp", "Doanh thu trừ giá vốn. Biên lãi = lãi gộp ÷ doanh thu."],
  ["Ước cả quý", "Quý chưa hết: lấy số đã bán chia số ngày đã qua rồi nhân đủ số ngày của quý, để so công bằng với quý trước."],
  ["Thị trường", "Nước (hoặc nhóm nước như Châu Âu 33 nước) mà khách dùng sản phẩm."],
  ["Nhà cung cấp", "Đơn vị bán data/SIM cho GoHub: 3HK, BC Datapool, WorldMove, KDDI…"],
  ["Sản phẩm (SKU)", "Mã 13 ký tự của 1 gói cụ thể, ví dụ 3CJPN3DF00507 = eSIM Nhật 5GB dùng 7 ngày."],
  ["Loại SIM", "eSIM (cài bằng mã QR), SIM vật lý (thẻ cắm máy), Nạp thêm data (mua thêm cho SIM đang dùng)."],
  ["Kiểu gói", "Theo ngày: mỗi ngày được 1 lượng data. Trọn gói: 1 lượng data dùng cả kỳ. Không giới hạn: dùng thoải mái (có thể giảm tốc sau ngưỡng)."],
  ["Gọi/SMS", "Gói chỉ có data, có kèm gọi/nhắn tin, hay có số điện thoại địa phương."],
  ["B2B / B2C", "B2B: bán cho doanh nghiệp, đại lý. B2C: bán lẻ cho khách (web, app, sàn TMĐT)."],
  ["Giá nhập đầy đủ", "Giá của nhà cung cấp đã cộng mọi phí (khung SIM/eSIM, phí kích hoạt…) và đổi ra tiền Việt theo tỷ giá nội bộ, để so ngang nhau."],
  ["Rẻ hơn %", "Giá vốn của 1 gói ở nơi khác thấp hơn giá đang nhập bao nhiêu phần trăm. Chỉ so giá từng gói, không nhân số lượng bán."],
]

export function Glossary() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">
        <HelpCircle className="w-4 h-4" />Giải thích từ ngữ
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Giải thích từ ngữ trên trang</h2>
              <button onClick={() => setOpen(false)} aria-label="Đóng"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <dl className="space-y-2.5 text-sm">
              {TERMS.map(([t, d]) => (
                <div key={t}><dt className="font-semibold text-slate-800">{t}</dt><dd className="text-slate-600">{d}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  )
}

/** Tiền VND gọn để đọc: 1,2 tỷ · 350 triệu · 45 nghìn. */
export function vnd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  const a = Math.abs(n), s = n < 0 ? "−" : ""
  if (a >= 1e9) return `${s}${(a / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`
  if (a >= 1e3) return `${s}${Math.round(a / 1e3).toLocaleString("vi-VN")} nghìn`
  return `${s}${Math.round(a).toLocaleString("vi-VN")} đ`
}

export const pctTxt = (x: number, digits = 1) => `${x.toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`
