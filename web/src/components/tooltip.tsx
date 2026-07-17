"use client"

// Wave 0.6 — Tooltip dùng chung (CSS-only, không cần JS state).
// Dùng:
//   <InfoTooltip content="Giá nhập gốc tính theo USD. Chỉ admin thấy." />   ← icon ? cạnh tiêu đề cột
//   <Tooltip content="Nhãn giải thích"><span>text</span></Tooltip>           ← bao quanh bất kỳ element

import { HelpCircle } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string
  children: ReactNode
  className?: string
  // side: top (default) | bottom
  side?: "top" | "bottom"
}

export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const popover = cn(
    "absolute z-50 w-52 px-3 py-2 text-[11px] leading-snug text-white bg-slate-800 rounded-lg shadow-xl",
    "pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150",
    "whitespace-normal text-left",
    side === "bottom"
      ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
      : "bottom-full mb-1.5 left-1/2 -translate-x-1/2"
  )
  return (
    <span className={cn("relative inline-flex group/tip", className)}>
      {children}
      <span className={popover}>{content}</span>
    </span>
  )
}

// Icon ? nhỏ cạnh tiêu đề cột/label — phổ biến nhất.
export function InfoTooltip({ content, className }: { content: string; className?: string }) {
  return (
    <Tooltip content={content}>
      <HelpCircle className={cn("inline-block w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help ml-1 align-middle", className)} />
    </Tooltip>
  )
}
