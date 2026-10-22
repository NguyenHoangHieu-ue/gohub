"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Database, MessagesSquare, Network, Phone, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

// Phòng Argon: 6 tab (Hôm nay · Kho · Bối cảnh và Kế hoạch · Bản đồ · Trợ lý · Cuộc gọi). Sứ mệnh, workspace, tuần tra, sổ dự đoán… vẫn ở "Nâng cao".
const TABS = [
  { href: "/analytics/creator/argon", label: "Hôm nay", icon: Sun, exact: true },
  { href: "/analytics/creator/argon/kho-nguon", label: "Kho", icon: Database },
  { href: "/analytics/creator/argon/boi-canh", label: "Bối cảnh và Kế hoạch", icon: Compass },
  { href: "/analytics/creator/argon/ban-do", label: "Bản đồ", icon: Network },
  { href: "/analytics/creator/argon/tro-ly", label: "Trợ lý", icon: MessagesSquare },
  { href: "/analytics/creator/argon/cuoc-goi", label: "Cuộc gọi", icon: Phone },
]

export default function ArgonLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ""
  const advanced = path.startsWith("/analytics/creator/argon/nang-cao") || path.startsWith("/analytics/creator/argon/kho-nguon/du-an")
  return (
    <div>
      <nav aria-label="Phòng Argon" className="max-w-[1700px] mx-auto px-4 pt-3">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-slate-700">
          {TABS.map(t => {
            const on = !advanced && (t.exact ? path === t.href : path.startsWith(t.href) && !path.startsWith("/analytics/creator/argon/kho-nguon/du-an"))
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                className={cn("inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium border-b-2 -mb-px transition-colors", on ? "border-violet-600 text-violet-700 dark:text-violet-300" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200")}>
                <t.icon size={15} />{t.label}
              </Link>
            )
          })}
          <Link href="/analytics/creator/argon/nang-cao" className={cn("ml-auto shrink-0 px-3 py-2 text-[12.5px]", advanced ? "text-violet-700 dark:text-violet-300 font-medium" : "text-gray-400 hover:text-gray-600")}>Nâng cao</Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
