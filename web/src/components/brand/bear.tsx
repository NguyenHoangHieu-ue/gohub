// Thương hiệu chung của các trợ lý AI (Bé Gấu, Gấu Pro, Gấu Prime): con gấu mặc áo hoodie nâu (public/brand/bear.png, nền trong suốt).
// Nhận `size` + `className` như icon lucide để dùng được ở mọi chỗ đang truyền một icon.
export function Bear({ size = 16, className }: { size?: number | string; className?: string }) {
  const px = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 16
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/bear.png" alt="" aria-hidden width={px} height={px} draggable={false} className={`inline-block shrink-0 object-contain select-none ${className ?? ""}`} style={{ width: px, height: px }} />
}

/** Ô vuông bo tròn chứa con gấu — dùng làm avatar trợ lý trong khung chat. */
export function BearAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-slate-700/60 ring-1 ring-amber-200/70 dark:ring-slate-600 ${className ?? ""}`} style={{ width: size, height: size }}>
      <Bear size={Math.round(size * 0.82)} />
    </span>
  )
}
