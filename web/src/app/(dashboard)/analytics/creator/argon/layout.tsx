"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, Database, MessagesSquare, Network, Phone, Settings2, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useArgonMember } from "./use-argon-member"

// Trợ lý (Argon): 3 tab — Hôm nay (việc cần duyệt + đề xuất + kế hoạch) · Hỏi · Kho (tài liệu, sổ sự việc, thực thể, nguồn tự động) — và menu "Thêm" (Cuộc gọi, Bản đồ, Nâng cao).
const A = "/analytics/creator/argon"
const TABS = [
  { href: A, label: "Hôm nay", icon: Sun, exact: true, badge: true },
  { href: `${A}/hoi-tim`, label: "Hỏi", icon: MessagesSquare },
  { href: `${A}/kho-nguon`, label: "Kho", icon: Database },
]
const MORE = [
  { href: `${A}/cuoc-goi`, label: "Cuộc gọi", icon: Phone },
  { href: `${A}/ban-do`, label: "Bản đồ vận hành", icon: Network },
  { href: `${A}/nang-cao`, label: "Nâng cao", icon: Settings2 },
]

export default function ArgonLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ""
  const [pending, setPending] = useState(0)
  const member = useArgonMember()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Huy hiệu số việc đang chờ (nhẹ: ?count=1); tải lại mỗi lần đổi trang trong Trợ lý.
  useEffect(() => { fetch("/api/creator/assistant/inbox?count=1", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(j => setPending(j?.total ?? 0)).catch(() => undefined) }, [path])
  useEffect(() => { setOpen(false) }, [path])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", off)
    return () => document.removeEventListener("mousedown", off)
  }, [open])

  const moreActive = [...MORE].sort((a, b) => b.href.length - a.href.length).find(m => path === m.href || path.startsWith(`${m.href}/`)) ?? null
  const tabOn = (t: (typeof TABS)[number]) => !moreActive && (t.exact ? path === t.href : path.startsWith(t.href))   // trang cũ /viec-can-duyet, /boi-canh chuyển hướng về Hôm nay
  return (
    <div>
      <nav aria-label="Trợ lý" className="max-w-[1700px] mx-auto px-4 pt-3">
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
          {TABS.map(t => (
            <Link key={t.href} href={t.href} aria-current={tabOn(t) ? "page" : undefined}
              className={cn("inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium border-b-2 -mb-px transition-colors", tabOn(t) ? "border-violet-600 text-violet-700 dark:text-violet-300" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200")}>
              <t.icon size={15} />{t.label}{"badge" in t && t.badge && pending > 0 && <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[10.5px] font-semibold leading-4 text-white">{pending}</span>}
            </Link>
          ))}
          <div ref={menuRef} className={cn("relative ml-auto", member && "hidden")}>
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"
              className={cn("inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors", moreActive ? "border-violet-600 text-violet-700 dark:text-violet-300 font-medium" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200")}>
              {moreActive ? moreActive.label : "Thêm"}<ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
                {MORE.map(m => (
                  <Link key={m.href} href={m.href} role="menuitem" className={cn("flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-gray-50 dark:hover:bg-slate-700", moreActive?.href === m.href ? "text-violet-700 dark:text-violet-300 font-medium" : "text-gray-700 dark:text-slate-200")}>
                    <m.icon size={15} className="text-gray-400" />{m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>
      {children}
    </div>
  )
}
