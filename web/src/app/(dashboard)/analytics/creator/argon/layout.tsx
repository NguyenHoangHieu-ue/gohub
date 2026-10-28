"use client"

import { usePathname, useRouter } from "next/navigation"
import { Suspense, useEffect } from "react"
import { JetBrains_Mono } from "next/font/google"
import { cn } from "@/lib/utils"
import { useArgonAccess } from "./use-argon-member"
import { ARGON_BASE as A, ArgonNav } from "./argon-nav"
import { LarkConnectPrompt } from "./lark-connect-prompt"
import "./argon.css"

// Số, nhãn và huy hiệu dùng font mono (có dấu tiếng Việt) để giao diện có chất "bảng điều khiển công nghệ"; chữ nội dung vẫn là Be Vietnam Pro.
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "700"], variable: "--font-mono" })

// Phân quyền: CREATOR thấy hết (3 tab + menu Thêm). Người khác (thành viên được cấp) CHỈ thấy mục Hỏi — không thấy Hôm nay, Kho, menu Thêm; vào trang khác bị đưa về Hỏi.
// Gấu Prime (Argon): 3 tab — Hôm nay · Hỏi · Kho — và menu "Thêm" (Cuộc gọi, Bridge, Chạy song song, Tự động, Nâng cao): xem argon-nav.tsx.
// Trang Hỏi (màn hình rộng): thanh điều hướng nằm trong cột trái cùng danh sách cuộc trò chuyện, nên thanh ngang trên đầu ẩn đi để khung chat được cao hơn.
export default function ArgonLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ""
  const router = useRouter()
  const { member } = useArgonAccess()
  const onHoi = path === `${A}/hoi-tim` || path.startsWith(`${A}/hoi-tim/`)
  // Thành viên chỉ được ở mục Hỏi.
  useEffect(() => { if (member && !onHoi) router.replace(`${A}/hoi-tim`) }, [member, onHoi, router])

  return (
    <div className={cn("argon-ui", mono.variable)}>
      <div className="ag-aurora" aria-hidden><div className="ag-grid" /></div>
      <div className={cn(onHoi && "lg:hidden")}><ArgonNav variant="bar" /></div>
      <Suspense fallback={null}><LarkConnectPrompt /></Suspense>
      {member && !onHoi ? null : children}
    </div>
  )
}
