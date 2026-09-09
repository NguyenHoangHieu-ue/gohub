// KB constants — client-safe (KHÔNG import pdf-parse/pdfjs).
// Tách khỏi lib/kb.ts vì kb.ts dùng require("pdf-parse") → pdfjs-dist WASM. Client component
// (kb/page.tsx) import trực tiếp kb.ts sẽ kéo cả pdfjs WASM vào browser bundle → fetch .wasm 404.
// Constants dùng cho cả client + server đặt ở đây; kb.ts re-export để server route giữ nguyên.

export const DEPARTMENTS = ["all", "sales", "product", "tech", "finance"] as const
export type Department = typeof DEPARTMENTS[number]

export const DEPT_LABELS: Record<Department, string> = {
  all:     "Tất cả",
  sales:   "Sales",
  product: "Product",
  tech:    "Tech",
  finance: "Finance",
}
