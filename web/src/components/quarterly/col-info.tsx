"use client"

// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import { useState, useRef } from "react"
import { createPortal } from "react-dom"

// ─── ColInfo — tooltip công thức cột ──────────────────────────────────────────
// Dùng createPortal + position:fixed để thoát overflow-hidden của parent container.
export function ColInfo({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const show = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.top - 6, left: r.left + r.width / 2 })
    }
    setOpen(true)
  }

  return (
    <span className="inline-flex items-center align-middle ml-1">
      <button
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); if (!open) show(); else setOpen(false) }}
        className="w-3 h-3 rounded-full bg-blue-400/25 text-[7px] font-black text-blue-200 hover:bg-blue-400/60 transition-colors inline-flex items-center justify-center leading-none select-none"
      >i</button>
      {open && typeof window !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="w-56 bg-slate-900 text-white text-[10px] rounded-lg shadow-2xl p-2.5 leading-relaxed whitespace-pre-line pointer-events-none"
        >
          {tip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>,
        document.body,
      )}
    </span>
  )
}
