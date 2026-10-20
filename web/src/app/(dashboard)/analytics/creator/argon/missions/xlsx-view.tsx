"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "../argon-types"

interface Sheet { name: string; rows: string[][]; totalRows: number; totalCols: number; truncated: boolean }
interface Preview { sheets: Sheet[]; moreSheets: number }

// Xem trước file Excel trong workspace: các sheet dạng bảng (cắt 200 dòng × 30 cột), hàng đầu cố định làm tiêu đề. Số đúng như Excel hiển thị; công thức không chạy.
export function XlsxView({ url, path, version }: { url: string; path: string; version: number }) {
  const [data, setData] = useState<Preview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState(0)

  useEffect(() => {
    let live = true
    setData(null); setErr(null); setSel(0)
    api<{ preview: Preview }>(`${url}?path=${encodeURIComponent(path)}&preview=1&v=${version}`).then(r => { if (live) setData(r.preview) }).catch(e => { if (live) setErr((e as Error).message) })
    return () => { live = false }
  }, [url, path, version])

  if (err) return <div className="text-sm text-amber-700 dark:text-amber-300">Không xem trước được: {err}</div>
  if (!data) return <div className="text-sm text-gray-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Đang đọc file Excel…</div>
  const sheet = data.sheets[sel] ?? data.sheets[0]
  if (!sheet) return <div className="text-sm text-gray-400">File Excel không có sheet nào.</div>
  const cols = Math.max(0, ...sheet.rows.map(r => r.length))
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Các sheet">
        {data.sheets.map((s, i) => <button key={s.name} type="button" role="tab" aria-selected={i === sel} onClick={() => setSel(i)}
          className={cn("px-2.5 py-1 text-xs rounded-md border", i === sel ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200")}>{s.name}</button>)}
        {data.moreSheets > 0 && <span className="px-2 py-1 text-xs text-gray-500">+{data.moreSheets} sheet nữa (tải xuống để xem)</span>}
      </div>
      <div className="text-[11px] text-gray-500">{sheet.totalRows} dòng × {sheet.totalCols} cột{sheet.truncated ? " — chỉ hiện 200 dòng × 30 cột đầu, tải xuống để xem đủ" : ""}</div>
      {sheet.rows.length === 0 ? <div className="text-sm text-gray-400">Sheet trống.</div> : (
        <div className="overflow-auto max-h-[60vh] rounded-lg border border-gray-200 dark:border-slate-700">
          <table className="border-collapse text-[12.5px] tabular-nums">
            <thead className="sticky top-0 bg-violet-50 dark:bg-violet-950/60">
              <tr>{Array.from({ length: cols }, (_, c) => <th key={c} className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap border-b border-violet-200 dark:border-violet-900 text-violet-800 dark:text-violet-200">{sheet.rows[0]?.[c] ?? ""}</th>)}</tr>
            </thead>
            <tbody>
              {sheet.rows.slice(1).map((r, i) => <tr key={i} className="even:bg-gray-50 dark:even:bg-slate-800/60">{Array.from({ length: cols }, (_, c) => <td key={c} className="px-2.5 py-1 border-t border-gray-100 dark:border-slate-700 whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis" title={r[c]}>{r[c] ?? ""}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
