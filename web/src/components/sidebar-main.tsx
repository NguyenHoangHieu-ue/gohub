"use client"

import { useSidebar } from "./sidebar-context"
import { TopBar } from "./top-bar"

export function SidebarMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <main className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-200 ease-in-out ${collapsed ? "ml-16" : "ml-60"}`}>
      <TopBar />
      {children}
    </main>
  )
}
