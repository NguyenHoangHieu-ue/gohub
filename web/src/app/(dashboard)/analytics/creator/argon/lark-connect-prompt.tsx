"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Link2, X } from "lucide-react"

// Cửa sổ xin cấp quyền Lark khi vào Gấu Prime. Chỉ hiện khi CHƯA có phiên Lark còn hạn (chưa kết nối hoặc phiên Lark đã hết hạn): bấm "Cho phép" → sang trang cấp quyền của Lark → quay lại đúng trang.
// Đã còn phiên thì KHÔNG hỏi lại. "Để sau" chỉ ẩn trong phiên làm việc hiện tại của trình duyệt (không hỏi dồn dập).
const KEY = "gh_lark_prompt_dismissed"

export function LarkConnectPrompt() {
  const path = usePathname() ?? ""
  const sp = useSearchParams()
  const failed = sp?.get("lark") === "error"
  const [show, setShow] = useState(false)
  useEffect(() => {
    let on = true
    let dismissed = false
    try { dismissed = sessionStorage.getItem(KEY) === "1" } catch { /* trình duyệt chặn: coi như chưa ẩn */ }
    if (dismissed && !failed) return
    fetch("/api/lark/oauth/status", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => { if (on && d && d.connected === false) setShow(true) }).catch(() => undefined)
    return () => { on = false }
  }, [failed])
  if (!show) return null

  const later = () => { try { sessionStorage.setItem(KEY, "1") } catch { /* bỏ qua */ } setShow(false) }
  const go = () => { window.location.href = `/api/lark/oauth/start?return=${encodeURIComponent(path)}` }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Cho phép Lark">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-200"><Link2 size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900 dark:text-slate-100">Cho phép Gấu Prime dùng Lark của bạn</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600 dark:text-slate-300">Để Gấu Prime xem được <b className="font-medium">công việc và tài liệu Lark của bạn</b> (chỉ đọc), bạn cần cho phép một lần. Bạn sẽ sang trang của Lark, bấm <b className="font-medium">“Cho phép”</b> rồi tự quay lại đây.</p>
            {failed && <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-800 dark:text-red-200">Lần trước chưa cấp quyền được. Bạn thử lại giúp mình nhé.</p>}
          </div>
          <button type="button" onClick={later} aria-label="Đóng" className="rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><X size={16} /></button>
        </div>
        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={go} className="h-11 flex-1 rounded-xl bg-violet-600 text-[15px] font-medium text-white hover:bg-violet-700">Cho phép</button>
          <button type="button" onClick={later} className="h-11 rounded-xl border border-gray-300 dark:border-slate-600 px-5 text-[15px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800">Để sau</button>
        </div>
      </div>
    </div>
  )
}
