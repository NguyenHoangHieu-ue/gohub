"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"

interface SidebarCtx {
  collapsed: boolean
  toggle:    () => void
}

const Ctx = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} })

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

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

  return <Ctx.Provider value={{ collapsed, toggle }}>{children}</Ctx.Provider>
}

export const useSidebar = () => useContext(Ctx)
