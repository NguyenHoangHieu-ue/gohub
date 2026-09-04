// Format helpers dùng chung giữa quarterly/page.tsx và các component tách ra dưới components/quarterly/
// (s183 Phase 5 — tách cơ học, công thức giữ NGUYÊN Y HỆT bản gốc trong page.tsx).

import { formatCompactNumber } from "@/lib/analytics-formatters"

// Hiển thị số đầy đủ với dấu phân cách hàng nghìn (vi-VN: dấu chấm)
export const fc  = (n: number) => Math.round(n).toLocaleString("vi-VN")
export const pct = (v: number) => `${v.toFixed(1)}%`

export function parseFmt(s: string): number { return parseFloat(s.replace(/[^\d.-]/g, "")) || 0 }
export function fmtInput(n: number): string { return n > 0 ? Math.round(n).toLocaleString("vi-VN") : "" }

export const cm1Color = (v: number) => v >= 0 ? "text-blue-700" : "text-red-600"
export const momColor = (v: number | null) => v == null ? "text-slate-400" : v >= 0 ? "text-green-600" : "text-red-500"
export const prColor  = "text-slate-500"

// Số compact ("18.7 Tỷ") thay số đầy đủ để tránh chồng lấn trong grid/card.
export const fck = (n: number) => formatCompactNumber(n)
