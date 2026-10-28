"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, Database, MessagesSquare, Moon, Phone, Plug, Scale, Settings2, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useArgonAccess } from "./use-argon-member"
import { BearAvatar } from "@/components/brand/bear"

// Thanh điều hướng Gấu Prime: Tên + 3 tab (Hôm nay · Hỏi · Kho) + menu "Thêm".
//  - variant "bar": thanh ngang trên đầu trang (layout.tsx).
//  - variant "side": gọn trong cột trái của trang Hỏi, cùng ô với danh sách cuộc trò chuyện (khung chat được rộng ra, không còn thanh trên đầu).
// Thành viên (không phải Creator) chỉ thấy tên, không thấy tab/menu.
export const ARGON_BASE = "/analytics/creator/argon"
const A = ARGON_BASE
const TABS = [
  { href: A, label: "Hôm nay", icon: Sun, exact: true, badge: true },
  { href: `${A}/hoi-tim`, label: "Hỏi", icon: MessagesSquare },
  { href: `${A}/kho-nguon`, label: "Kho", icon: Database },
]
const MORE = [
  { href: `${A}/cuoc-goi`, label: "Cuộc gọi", icon: Phone },
  { href: `${A}/bridge`, label: "Bridge (nối trình duyệt)", icon: Plug },
  { href: `${A}/song-song`, label: "Chạy song song Gấu Pro", icon: Scale },
  { href: `${A}/tu-dong`, label: "Tự động hằng đêm", icon: Moon },
  { href: `${A}/nang-cao`, label: "Sứ mệnh (kiểu cũ)", icon: Settings2 },
]

export function ArgonNav({ variant = "bar" }: { variant?: "bar" | "side" }) {
  const path = usePathname() ?? ""
  const { member, loading } = useArgonAccess()
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Huy hiệu số việc đang chờ (nhẹ: ?count=1); tải lại mỗi lần đổi trang.
  useEffect(() => { if (loading || member) return; fetch("/api/creator/assistant/inbox?count=1", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(j => setPending(j?.total ?? 0)).catch(() => undefined) }, [path, loading, member])
  useEffect(() => { setOpen(false) }, [path])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", off)
    return () => document.removeEventListener("mousedown", off)
  }, [open])

  // Mục "Thêm" đang mở: chọn mục khớp DÀI NHẤT.
  const moreActive = [...MORE].sort((a, b) => b.href.length - a.href.length).find(m => path === m.href || path.startsWith(`${m.href}/`)) ?? null
  const tabOn = (t: (typeof TABS)[number]) => !moreActive && (t.exact ? path === t.href : path.startsWith(t.href))
  const side = variant === "side"

  const title = (
    <div className="flex items-center gap-2.5 pr-1">
      <BearAvatar size={side ? 32 : 38} className="!rounded-2xl" />
      <div className={cn("ag-title font-bold tracking-tight", side ? "text-[16px]" : "text-[17px]")}>Gấu Prime</div>
    </div>
  )
  const tabs = !member && (
    <div className={cn("ag-tabs", side && "!flex w-full !gap-0.5 !p-1")} role="tablist">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} aria-current={tabOn(t) ? "page" : undefined} className={cn("ag-tab", side && "min-w-0 flex-1 justify-center !gap-1 !px-1.5 !text-[12.5px]")}>
          <t.icon size={side ? 13 : 15} className="shrink-0" />{t.label}
          {"badge" in t && t.badge && pending > 0 && <span className="ag-badge">{pending}</span>}
        </Link>
      ))}
    </div>
  )
  const more = !member && (
    <div ref={menuRef} className={cn("relative", !side && "ml-auto")}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu" className={cn("ag-btn-ghost", side && "w-full justify-between", moreActive && "!border-[var(--ag-line-hot)]")}>
        {moreActive ? moreActive.label : "Thêm"}<ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className={cn("ag-card ag-card-flat absolute z-30 mt-2 w-64 py-1.5 !bg-[var(--ag-glass-strong)]", side ? "left-0 top-full" : "right-0 top-full")}>
          {MORE.map(m => (
            <Link key={m.href} href={m.href} role="menuitem" className={cn("flex items-center gap-2.5 px-3.5 py-2 text-[13px] rounded-lg mx-1 hover:bg-violet-500/10", moreActive?.href === m.href ? "text-violet-600 dark:text-violet-300 font-medium" : "text-[var(--ag-ink)]")}>
              <m.icon size={15} className="text-[var(--ag-mute)]" />{m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  if (side) return <div className="flex flex-col gap-2.5 border-b border-gray-100 dark:border-slate-700 p-3">{title}{tabs}{more}</div>
  return (
    <nav aria-label="Trợ lý" className="max-w-[1700px] mx-auto px-4 pt-4 pb-1">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">{title}{tabs}{more}</div>
    </nav>
  )
}
