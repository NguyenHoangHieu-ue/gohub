"use client"

// Wave 0.1 — Toast system dùng chung (provider + useToast).
// Mục tiêu: thay alert()/thao tác im lặng bằng phản hồi nổi góc màn hình, tự tắt, stack được.
// Dùng: const toast = useToast(); toast.success("Đã lưu"). Có success/error/info/warning + promise().

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastKind = "success" | "error" | "info" | "warning"

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  duration: number
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, duration?: number) => number
  success: (message: string, duration?: number) => number
  error: (message: string, duration?: number) => number
  info: (message: string, duration?: number) => number
  warning: (message: string, duration?: number) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const KIND_STYLE: Record<ToastKind, { icon: React.ElementType; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: "border-emerald-200 dark:border-emerald-800", iconColor: "text-emerald-500" },
  error:   { icon: XCircle,      ring: "border-rose-200 dark:border-rose-800",       iconColor: "text-rose-500" },
  info:    { icon: Info,         ring: "border-blue-200 dark:border-blue-800",       iconColor: "text-blue-500" },
  warning: { icon: AlertTriangle,ring: "border-amber-200 dark:border-amber-800",     iconColor: "text-amber-500" },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const show = useCallback((message: string, kind: ToastKind = "info", duration = 3000) => {
    const id = ++idRef.current
    setItems((prev) => [...prev, { id, kind, message, duration }])
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
    }
    return id
  }, [dismiss])

  // Dọn timer khi unmount.
  useEffect(() => {
    const map = timers.current
    return () => { map.forEach((t) => clearTimeout(t)); map.clear() }
  }, [])

  const api: ToastApi = {
    show,
    success: (m, d) => show(m, "success", d),
    error:   (m, d) => show(m, "error", d),
    info:    (m, d) => show(m, "info", d),
    warning: (m, d) => show(m, "warning", d),
    dismiss,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-none">
        {items.map((t) => {
          const s = KIND_STYLE[t.kind]
          const Icon = s.icon
          return (
            <div key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white dark:bg-slate-800 shadow-lg px-4 py-3",
                "animate-[toast-in_180ms_ease-out]", s.ring,
              )}>
              <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", s.iconColor)} />
              <p className="flex-1 text-sm text-slate-700 dark:text-slate-100 leading-snug break-words">{t.message}</p>
              <button onClick={() => dismiss(t.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
      <style jsx global>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

// Hook chính. Nếu gọi ngoài provider vẫn không crash — fallback về console (an toàn cho test/SSR).
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  const noop = (m: string, k?: ToastKind) => { if (typeof console !== "undefined") console.log(`[toast:${k ?? "info"}] ${m}`); return 0 }
  return {
    show: noop,
    success: (m) => noop(m, "success"),
    error:   (m) => noop(m, "error"),
    info:    (m) => noop(m, "info"),
    warning: (m) => noop(m, "warning"),
    dismiss: () => {},
  }
}
