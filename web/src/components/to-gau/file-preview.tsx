"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { fmtFileSize } from "@/lib/to-gau-format"
import type { Attachment } from "@/lib/to-gau-types"

// ── File Preview (before send) ──
export function FilePreviewItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/")
  const [objUrl, setObjUrl] = useState<string>("")

  useEffect(() => {
    if (!isImage) return
    const url = URL.createObjectURL(file)
    setObjUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <div className="relative flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1.5 text-[12px] text-slate-700 max-w-[160px]">
      {isImage && objUrl ? (
        <img src={objUrl} alt={file.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
      ) : (
        <span className="text-lg flex-shrink-0">📄</span>
      )}
      <span className="truncate flex-1 min-w-0">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 text-slate-400 hover:text-rose-500"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Message Attachment Display ──
export function AttachmentDisplay({ attachment }: { attachment: Attachment }) {
  const [lightbox, setLightbox] = useState(false)
  const isImage = attachment.type.startsWith("image/")

  if (isImage) {
    return (
      <>
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 rounded-lg cursor-pointer object-contain mt-1"
          onClick={() => setLightbox(true)}
        />
        {lightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <img src={attachment.url} alt={attachment.name} className="max-w-full max-h-full rounded-xl" />
          </div>
        )}
      </>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-3 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors text-[13px] text-slate-700 max-w-[240px]"
    >
      <span className="text-lg flex-shrink-0">📄</span>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{attachment.name}</p>
        <p className="text-[11px] text-slate-400">{fmtFileSize(attachment.size)}</p>
      </div>
      <span className="text-[11px] text-[#003B95] font-medium flex-shrink-0">Tải về</span>
    </a>
  )
}
