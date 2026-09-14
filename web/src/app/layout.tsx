import type { Metadata } from "next"
import { Outfit } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "./session-provider"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" })

export const metadata: Metadata = {
  title: "Gohub Intel",
  description: "Gohub Intel — Business Intelligence & Product Hub",
}

// Đặt class 'dark' TRƯỚC khi paint để tránh nhấp nháy (FOUC).
// Mặc định LIGHT: chỉ bật dark khi user CHỦ ĐỘNG chọn (localStorage theme='dark') — KHÔNG theo OS.
// s196+21: tab BI (/analytics/* trừ /analytics/creator) khoá dark mode (quyết định Hiếu — xem
// lib/theme-lock.ts DARK_LOCK_INLINE_JS, giữ đúng logic y hệt isDarkModeLocked()) — nếu không chặn ở đây,
// user bật dark mode từ chatbot rồi F5 thẳng vào 1 tab BI sẽ thấy 1 nhịp UI vỡ trước khi JS client kịp gỡ.
const themeScript = `try{var p=location.pathname;var locked=(p.startsWith('/analytics/creator')?false:(p==='/analytics'||p.startsWith('/analytics/')));if(!locked&&localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${outfit.variable} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
