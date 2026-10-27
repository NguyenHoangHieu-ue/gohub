// Thương hiệu của các trợ lý AI:
//  - Gấu Prime: con gấu mặc áo hoodie nâu (public/brand/bear.png, nền trong suốt).
//  - Bé Gấu: phiên bản "mini" của Gấu Prime (public/brand/bear-mini.png) — cùng nét vẽ và màu, nhỏ gọn hơn.
//  - Gấu Pro: không dùng con gấu (giữ biểu tượng riêng).
// Nhận `size` + `className` như icon lucide để dùng được ở mọi chỗ đang truyền một icon.
function BrandImg({ src, size, className }: { src: string; size: number | string; className?: string }) {
  const px = typeof size === "number" ? size : Number.parseInt(String(size), 10) || 16
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden width={px} height={px} draggable={false} className={`inline-block shrink-0 object-contain select-none ${className ?? ""}`} style={{ width: px, height: px }} />
}

export function Bear({ size = 16, className }: { size?: number | string; className?: string }) {
  return <BrandImg src="/brand/bear.png" size={size} className={className} />
}

export function BearMini({ size = 16, className }: { size?: number | string; className?: string }) {
  return <BrandImg src="/brand/bear-mini.png" size={size} className={className} />
}

const AVATAR = "inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-slate-700/60 ring-1 ring-amber-200/70 dark:ring-slate-600"

/** Ô vuông bo tròn chứa con gấu Gấu Prime — avatar trợ lý trong khung chat. */
export function BearAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={`${AVATAR} ${className ?? ""}`} style={{ width: size, height: size }}>
      <Bear size={Math.round(size * 0.82)} />
    </span>
  )
}

/** Avatar của Bé Gấu (bản mini). */
export function BearMiniAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={`${AVATAR} ${className ?? ""}`} style={{ width: size, height: size }}>
      <BearMini size={Math.round(size * 0.82)} />
    </span>
  )
}
