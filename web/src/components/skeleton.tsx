"use client"

// Wave 0.2 — Skeleton loaders dùng chung.
// Thay spinner/"Đang tải..." trơ bằng khung xương đúng layout → giảm layout-shift (CLS), cảm giác nhanh hơn.
// Dùng: <SkeletonTable rows={8} cols={5} /> · <SkeletonCards count={4} /> · <SkeletonText lines={3} /> · <Skeleton className="h-10 w-40" />

import { cn } from "@/lib/utils"

// Khối xương cơ bản — animate-pulse, bo góc, màu nhạt (dark-mode aware).
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700/50", className)} />
}

// Vài dòng text giả (dòng cuối ngắn hơn cho tự nhiên).
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  )
}

// Bảng xương: header mờ + N dòng × M cột. Khớp bảng list (skus/ncc/countries/kb...).
export function SkeletonTable({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800", className)}>
      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-24" : "flex-1")} />
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-24" : "flex-1", c === cols - 1 && "max-w-[80px]")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Lưới card xương — cho trang dạng card/grid.
export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

// Danh sách dòng đơn giản (list rời rạc, không phải bảng).
export function SkeletonList({ rows = 6, className, rowClassName }: { rows?: number; className?: string; rowClassName?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-14 w-full rounded-xl", rowClassName)} />
      ))}
    </div>
  )
}
