import type { Metadata } from "next"
import { Be_Vietnam_Pro } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "./session-provider"

// Be Vietnam Pro có đủ dấu tiếng Việt (Outfit chỉ có latin nên dấu bị rơi sang font hệ thống, chữ không đều).
const beVietnam = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-sans" })

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
      <body className={`${beVietnam.variable} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
