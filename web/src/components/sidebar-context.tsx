"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"

interface SidebarCtx {
  collapsed:    boolean          // thu gọn icon-rail (chỉ desktop)
  toggle:       () => void
  mobileOpen:   boolean          // off-canvas mở trên mobile (< md)
  openMobile:   () => void
  closeMobile:  () => void
}

const Ctx = createContext<SidebarCtx>({
  collapsed: false, toggle: () => {},
  mobileOpen: false, openMobile: () => {}, closeMobile: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar_collapsed") === "1")
    } catch {}
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0") } catch {}
      return next
    })
  }, [])

  const openMobile  = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <Ctx.Provider value={{ collapsed, toggle, mobileOpen, openMobile, closeMobile }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSidebar = () => useContext(Ctx)
