import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "./session-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "GoHub PM",
  description: "GoHub Product Manager Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
