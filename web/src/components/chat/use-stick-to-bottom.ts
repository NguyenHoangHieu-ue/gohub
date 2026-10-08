"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// U4: hội thoại dài — chỉ tự cuộn xuống khi người dùng đang ở cuối (đang đọc tin cũ thì không giật xuống); có nút "↓ Tin mới nhất".
// Callback ref (không phải useRef + effect []): trang có thể vẽ khung chat MUỘN (Gấu Pro chờ kiểm quyền) — QA U4 bị kẹt ở đầu vì vậy.
const NEAR_PX = 120

export function useStickToBottom<T extends HTMLElement>(deps: unknown[]) {
  const [el, setEl] = useState<T | null>(null)
  const elRef = useRef<T | null>(null)
  const ref = useCallback((node: T | null) => { elRef.current = node; setEl(node) }, [])
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)

  const scrollToBottom = useCallback((smooth = true) => {
    const e = elRef.current
    if (e) e.scrollTo({ top: e.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [])

  useEffect(() => {
    if (!el) return
    const onScroll = () => {
      const b = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_PX
      atBottomRef.current = b
      setAtBottom(b)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    // Nội dung cao thêm SAU khi đã cuộn (bảng/biểu đồ/ảnh vẽ xong muộn) → đang bám đáy thì kéo theo.
    const ro = new ResizeObserver(() => { if (atBottomRef.current) el.scrollTop = el.scrollHeight })
    const watch = () => Array.from(el.children).forEach(c => ro.observe(c))
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(el, { childList: true })
    if (atBottomRef.current) el.scrollTop = el.scrollHeight
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); mo.disconnect() }
  }, [el])

  // Nội dung đổi (tin mới, chữ đang chạy) → chỉ bám đáy khi người dùng đang ở đáy.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  /** Gọi khi mở hội thoại / người dùng vừa gửi tin: luôn nhảy xuống cuối. */
  const jumpToBottom = useCallback(() => {
    atBottomRef.current = true
    setAtBottom(true)
    requestAnimationFrame(() => scrollToBottom(false))
  }, [scrollToBottom])

  return { ref, atBottom, scrollToBottom, jumpToBottom }
}
