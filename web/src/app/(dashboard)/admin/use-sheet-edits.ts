"use client"

import { useCallback, useState } from "react"
import type { CellEdit, EditSheet } from "@/lib/datapool-audit/edits"

/** Danh sách ô đã chỉnh tay của bản xem trước (khoá theo sheet + mã dòng + cột). Giữ qua các lần "Xem trước" lại. */
export function useSheetEdits() {
  const [edits, setEdits] = useState<CellEdit[]>([])
  const find = useCallback((sheet: EditSheet, key: string, col: number) => edits.find(e => e.sheet === sheet && e.key === key && e.col === col), [edits])
  const set = useCallback((sheet: EditSheet, key: string, col: number, value: string) =>
    setEdits(prev => [...prev.filter(e => !(e.sheet === sheet && e.key === key && e.col === col)), { sheet, key, col, value }]), [])
  const reset = useCallback((sheet: EditSheet, key: string, col: number) => setEdits(prev => prev.filter(e => !(e.sheet === sheet && e.key === key && e.col === col))), [])
  const clear = useCallback(() => setEdits([]), [])
  return { edits, find, set, reset, clear }
}
