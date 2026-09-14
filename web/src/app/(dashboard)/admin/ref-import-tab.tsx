"use client"

import { useRef, useState, type DragEvent } from "react"
import { FileSpreadsheet, X, RefreshCw, Play, Check } from "lucide-react"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

const TABLE_META: Record<string, { label: string; file: string; columns: string[] }> = {
  ref_countries:         { label: "Quốc gia",              file: "countries-*.xlsx",         columns: ["code", "name", "nameVn"] },
  ref_support_countries: { label: "Nhóm nước hỗ trợ",      file: "support-countries-*.xlsx", columns: ["code", "name", "supportCountry", "supportCountryVn", "countryCodes"] },
  ref_categories:        { label: "Category (mã nhóm)",    file: "categories-*.xlsx",         columns: ["code", "name", "type", "description"] },
  ref_vendors:           { label: "Vendor",                file: "vendors-*.xlsx",            columns: ["Vendor Code", "Name", "Description"] },
}

export default function RefImportTab({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const [files, setFiles]   = useState<File[]>([])
  const [results, setResults] = useState<{ filename: string; ok: boolean; table?: string; upserted?: number; error?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (incoming: File[]) => {
    const xlsx = incoming.filter(f => f.name.endsWith(".xlsx"))
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...xlsx.filter(f => !names.has(f.name))]
    })
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const handleImport = async () => {
    if (!files.length) return
    setLoading(true); setResults([])
    const res: typeof results = []
    for (const file of files) {
      const fd = new FormData(); fd.append("file", file)
      try {
        const r = await fetch("/api/admin/import-ref-data", { method: "POST", body: fd })
        const d = await r.json()
        if (d.ok) res.push({ filename: file.name, ok: true, table: d.table, upserted: d.upserted })
        else res.push({ filename: file.name, ok: false, error: d.error })
      } catch (e: any) {
        res.push({ filename: file.name, ok: false, error: e.message })
      }
    }
    setResults(res)
    setLoading(false)
    const passed = res.filter(r => r.ok).length
    if (passed === res.length) onNotify("success", `Import thành công ${passed}/${res.length} file`)
    else onNotify("error", `${res.length - passed} file lỗi — xem chi tiết bên dưới`)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Cập nhật dữ liệu tham chiếu</h2>
        <p className="text-xs text-slate-500 mt-0.5">Upload file Excel (.xlsx) tải từ hệ thống → tự động nhận diện loại bảng và upsert vào Supabase.</p>
      </div>

      {/* Hướng dẫn tên file */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Tên file được nhận diện:</p>
        <div className="space-y-1.5">
          {Object.entries(TABLE_META).map(([tbl, meta]) => (
            <div key={tbl} className="flex items-start gap-3">
              <code className="text-[10px] font-mono bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded text-brand-700 dark:text-brand-300 shrink-0">{meta.file}</code>
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{meta.label}</span>
                <span className="text-[10px] text-slate-400 ml-1.5">({tbl})</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Cột: {meta.columns.join(" · ")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-800/30" : "border-slate-300 dark:border-slate-600 hover:border-brand-400 hover:bg-brand-50/40"
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Kéo thả file hoặc click để chọn</p>
        <p className="text-xs text-slate-400 mt-1">Hỗ trợ .xlsx · Tối đa 5MB mỗi file · Có thể chọn nhiều file cùng lúc</p>
        <input ref={inputRef} type="file" accept=".xlsx" multiple hidden
          onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = "" }} />
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{files.length} file đã chọn:</p>
          {files.map((f, i) => (
            <div key={f.name} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{f.name}</p>
                  <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-rose-600 transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={loading || !files.length}
          className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-40"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {loading ? "Đang import…" : "Import tất cả"}
        </button>
        {files.length > 0 && !loading && (
          <button onClick={() => { setFiles([]); setResults([]) }}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors">
            Xóa hết
          </button>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Kết quả:</p>
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${
              r.ok
                ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                : "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800"
            }`}>
              {r.ok
                ? <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                : <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200">{r.filename}</p>
                {r.ok
                  ? <p className="text-green-700 dark:text-green-300">✅ Upserted <strong>{r.upserted}</strong> dòng vào <code className="font-mono">{r.table}</code></p>
                  : <p className="text-rose-700 dark:text-rose-300">❌ {r.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
