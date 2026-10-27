"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { JetBrains_Mono } from "next/font/google"
import { ChevronDown, Database, MessagesSquare, Moon, Phone, Plug, Scale, Settings2, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useArgonAccess } from "./use-argon-member"
import { BearAvatar } from "@/components/brand/bear"
import { LarkConnectPrompt } from "./lark-connect-prompt"
import "./argon.css"

// Số, nhãn và huy hiệu dùng font mono (có dấu tiếng Việt) để giao diện có chất "bảng điều khiển công nghệ"; chữ nội dung vẫn là Be Vietnam Pro.
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "700"], variable: "--font-mono" })

// Phân quyền: CREATOR thấy hết (3 tab + menu Thêm). Người khác (thành viên được cấp) CHỈ thấy mục Hỏi — không thấy Hôm nay, Kho, menu Thêm; vào trang khác bị đưa về Hỏi.
// Gấu Prime (Argon): 3 tab — Hôm nay (việc cần duyệt + đề xuất + kế hoạch) · Hỏi · Kho (tài liệu, sổ sự việc, thực thể, nguồn tự động) — và menu "Thêm" (Cuộc gọi, Bản đồ, Nâng cao).
const A = "/analytics/creator/argon"
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

export default function ArgonLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ""
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { member, loading } = useArgonAccess()
  const menuRef = useRef<HTMLDivElement>(null)
  // Huy hiệu số việc đang chờ (nhẹ: ?count=1); tải lại mỗi lần đổi trang trong Trợ lý.
  useEffect(() => { if (loading || member) return; fetch("/api/creator/assistant/inbox?count=1", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(j => setPending(j?.total ?? 0)).catch(() => undefined) }, [path, loading, member])
  // Thành viên chỉ được ở mục Hỏi.
  useEffect(() => { if (member && !(path === `${A}/hoi-tim` || path.startsWith(`${A}/hoi-tim/`))) router.replace(`${A}/hoi-tim`) }, [member, path, router])
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
  return (
    <div className={cn("argon-ui", mono.variable)}>
      <div className="ag-aurora" aria-hidden><div className="ag-grid" /></div>
      <nav aria-label="Trợ lý" className="max-w-[1700px] mx-auto px-4 pt-4 pb-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <div className="flex items-center gap-2.5 pr-1">
            <BearAvatar size={38} className="!rounded-2xl" />
            <div className="ag-title text-[17px] font-bold tracking-tight">Gấu Prime</div>
          </div>
          {!member && <div className="ag-tabs" role="tablist">
            {TABS.map(t => (
              <Link key={t.href} href={t.href} aria-current={tabOn(t) ? "page" : undefined} className="ag-tab">
                <t.icon size={15} />{t.label}
                {"badge" in t && t.badge && pending > 0 && <span className="ag-badge">{pending}</span>}
              </Link>
            ))}
          </div>}
          <div ref={menuRef} className={cn("relative ml-auto", member && "hidden")}>
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"
              className={cn("ag-btn-ghost", moreActive && "!border-[var(--ag-line-hot)]")}>
              {moreActive ? moreActive.label : "Thêm"}<ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div role="menu" className="ag-card ag-card-flat absolute right-0 top-full z-30 mt-2 w-64 py-1.5 !bg-[var(--ag-glass-strong)]">
                {MORE.map(m => (
                  <Link key={m.href} href={m.href} role="menuitem" className={cn("flex items-center gap-2.5 px-3.5 py-2 text-[13px] rounded-lg mx-1 hover:bg-violet-500/10", moreActive?.href === m.href ? "text-violet-600 dark:text-violet-300 font-medium" : "text-[var(--ag-ink)]")}>
                    <m.icon size={15} className="text-[var(--ag-mute)]" />{m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>
      <Suspense fallback={null}><LarkConnectPrompt /></Suspense>
      {member && !(path === `${A}/hoi-tim` || path.startsWith(`${A}/hoi-tim/`)) ? null : children}
    </div>
  )
}
