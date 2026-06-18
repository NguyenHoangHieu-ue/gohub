import type { Metadata } from "next"
import { Outfit } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "./session-provider"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" })

export const metadata: Metadata = {
  title: "Gohub Intel",
  description: "Gohub Intel — Business Intelligence & Product Hub",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${outfit.variable} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
