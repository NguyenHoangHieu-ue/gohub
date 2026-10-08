"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// U4: hội thoại dài — chỉ tự cuộn xuống khi người dùng đang ở cuối (đang đọc tin cũ thì không giật xuống); có nút "↓ Tin mới nhất".
const NEAR_PX = 120

export function useStickToBottom<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null)
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      const b = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_PX
      atBottomRef.current = b
      setAtBottom(b)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    // Nội dung cao thêm SAU khi đã cuộn (bảng/biểu đồ/ảnh vẽ xong muộn) → đang bám đáy thì kéo theo (QA U4: mở hội thoại dài bị kẹt giữa).
    const ro = new ResizeObserver(() => { if (atBottomRef.current) el.scrollTop = el.scrollHeight })
    const watch = () => Array.from(el.children).forEach(c => ro.observe(c))
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(el, { childList: true })
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); mo.disconnect() }
  }, [])

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
