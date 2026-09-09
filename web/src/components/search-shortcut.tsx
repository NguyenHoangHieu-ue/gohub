"use client"

// Wave 0.6 — Phím tắt `/` focus ô tìm kiếm trên trang hiện tại.
// Gắn vào dashboard layout. Không can thiệp khi đang gõ trong input/textarea.

import { useEffect } from "react"

export function SearchShortcut() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return

      // Tìm input search đầu tiên trên trang (placeholder chứa "Tìm" hoặc type="search")
      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder*="Tìm"], input[placeholder*="tìm"], input[placeholder*="Search"], input[type="search"]'
      )
      if (input) {
        e.preventDefault()
        input.focus()
        input.select()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  return null
}
