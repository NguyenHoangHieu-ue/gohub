import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "./session-provider"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "GoHub PM",
  description: "GoHub Product Manager Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${geist.variable} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
