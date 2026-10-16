"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Download, FileCode2, Printer, X } from "lucide-react"
import { reportDoc, reportDownload } from "@/lib/argon/report"

export const reportFileName = (title: string) => `${title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report"}.html`

export function downloadReport(title: string, html: string) {
  const url = URL.createObjectURL(new Blob([reportDownload(html, window.location.origin)], { type: "text/html;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url; a.download = reportFileName(title)
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// Khung toàn màn hình mở report: iframe sandbox="allow-scripts allow-modals" (không cùng origin → không đọc được phiên đăng nhập; allow-modals chỉ để lệnh in của chính report chạy được),
// CSP chặn mạng (lib/argon/report.ts). "In / PDF" gửi tin nhắn cho trang report (script in sẵn trong reportDoc) để gọi window.print() — chọn "Lưu dưới dạng PDF" ở hộp thoại in.
export function ReportViewer({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <FileCode2 size={16} className="text-violet-600" />
        <div className="font-semibold text-sm truncate flex-1">{title}</div>
        <button onClick={() => frame.current?.contentWindow?.postMessage("argon-print", "*")} className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 hover:underline" title="Mở hộp thoại in — chọn “Lưu dưới dạng PDF”"><Printer size={13} />In / PDF</button>
        <button onClick={() => downloadReport(title, html)} className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 hover:underline"><Download size={13} />Tải .html</button>
        <button onClick={onClose} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-slate-600"><X size={14} />Đóng (Esc)</button>
      </div>
      <iframe ref={frame} title={title} sandbox="allow-scripts allow-modals" srcDoc={reportDoc(html, window.location.origin)} className="flex-1 w-full border-0 bg-white" />
    </div>, document.body)
}
