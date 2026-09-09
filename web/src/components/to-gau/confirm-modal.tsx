"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useCallback } from "react"

export function ConfirmModal({ message, onConfirm, onCancel }: {
  message:   string
  onConfirm: () => void
  onCancel:  () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <p className="text-[14px] text-slate-700 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[13px] font-medium hover:bg-rose-600 transition-colors"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  )
}

export function useConfirm() {
  const [pending, setPending] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback((message: string) => new Promise<boolean>(resolve => {
    setPending({ message, resolve })
  }), [])
  const ConfirmDialog = pending ? (
    <ConfirmModal
      message={pending.message}
      onConfirm={() => { pending.resolve(true);  setPending(null) }}
      onCancel={() =>  { pending.resolve(false); setPending(null) }}
    />
  ) : null
  return { confirm, ConfirmDialog }
}
