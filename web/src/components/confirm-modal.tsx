"use client"

import { useEffect, useRef } from "react"
import { AlertTriangle, Loader2, X } from "lucide-react"

interface ConfirmModalProps {
  open:           boolean
  title?:         string
  message:        string
  confirmLabel?:  string
  danger?:        boolean
  loading?:       boolean
  onConfirm:      () => void
  onCancel:       () => void
}

export function ConfirmModal({
  open, title = "Xác nhận", message,
  confirmLabel = "Xác nhận xóa", danger = true,
  loading = false,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) btnRef.current?.focus()
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open || loading) return
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-overlay-in"
      onClick={() => { if (!loading) onCancel() }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4 animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {danger && (
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
          {!loading && (
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Huỷ
          </button>
          <button
            ref={btnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-80 ${
              danger
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-brand-600 hover:bg-brand-700 text-white"
            }`}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "Đang xóa..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
