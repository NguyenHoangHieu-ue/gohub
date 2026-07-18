"use client"

// Wave 0.6 — Empty/Help states dùng chung.
// Thay các <div class="text-gray-400">Không tìm thấy</div> trơ bằng component có icon + gợi ý hành động.
// Dùng:
//   <EmptyState title="Chưa có dữ liệu" />
//   <EmptyState icon={<Search size={32}/>} title="Không tìm thấy kết quả" description="Thử từ khoá khác" action={{ label: "Xoá bộ lọc", onClick: () => setSearch("") }} />
//   <EmptyTableRow colSpan={5} title="Không tìm thấy" />   ← dùng trong <tbody>

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center select-none", className)}>
      {icon && <div className="mb-3 text-slate-300 dark:text-slate-600 [&_svg]:w-9 [&_svg]:h-9">{icon}</div>}
      <p className="text-sm font-medium text-slate-500 dark:text-slate-300">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// Dùng trong <tbody> khi bảng rỗng (thay <tr><td colSpan={N} class="...">text</td></tr>)
export function EmptyTableRow({ colSpan, title = "Không có dữ liệu", description, className }: {
  colSpan: number; title?: string; description?: string; className?: string
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn("px-4 py-14 text-center", className)}>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-300">{description}</p>}
      </td>
    </tr>
  )
}
