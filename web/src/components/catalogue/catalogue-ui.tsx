"use client"

import React, { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { flagEmoji } from "@/lib/catalogue/country-index"

/** Nút chip bật/tắt dùng cho bộ lọc. */
export function FilterChip({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string
}) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50",
      )}
    >
      {children}
    </button>
  )
}

export function Badge({ tone = "slate", children, title }: {
  tone?: "slate" | "brand" | "green" | "amber" | "red" | "violet"; children: React.ReactNode; title?: string
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-50 text-brand-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-700",
  }
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* trình duyệt chặn clipboard */ }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-700"
      title="Sao chép"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {done ? "Đã chép" : (label ?? "Chép")}
    </button>
  )
}

/** Khung mục trong ngăn chi tiết. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 first:border-t-0">
      <h3 className="text-[15px] font-bold text-slate-800">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Một dòng "nhãn — giá trị" dễ đọc. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  )
}

const FLAG_W = [20, 40, 80, 160, 320]
const pickW = (n: number) => FLAG_W.find(w => w >= n) ?? 320

/** Cờ nước dạng ảnh (flagcdn) — Windows không hiện được emoji cờ (chỉ ra chữ "JP"), nên dùng ảnh; lỗi tải thì rơi về emoji. */
export function Flag({ code, width = 24, className }: { code: string; width?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const c = code.toLowerCase()
  if (!/^[a-z]{2}$/.test(c) || failed) {
    return <span aria-hidden className={cn("inline-block leading-none", className)} style={{ fontSize: width * 0.8 }}>{flagEmoji(code)}</span>
  }
  const h = Math.round(width * 0.75)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w${pickW(width)}/${c}.png`}
      srcSet={`https://flagcdn.com/w${pickW(width * 2)}/${c}.png 2x`}
      width={width} height={h} alt="" loading="lazy" onError={() => setFailed(true)}
      className={cn("inline-block shrink-0 rounded-[3px] object-cover shadow-sm ring-1 ring-black/10", className)}
    />
  )
}
