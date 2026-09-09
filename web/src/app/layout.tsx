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
const themeScript = `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`

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
