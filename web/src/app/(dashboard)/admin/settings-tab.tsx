"use client"

import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import type { AppSetting } from "./admin-types"
import FxTable from "./fx-table"
import { DATAPOOL_FORMULA, resolveFormula } from "@/lib/datapool-formula"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

export default function SettingsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [settings, setSettings]   = useState<AppSetting[]>([])
  const [changed, setChanged]     = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(true)
  const [saving,  setSaving]      = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => { setSettings(d.settings ?? []); setLoading(false) })
      .catch(() => { onNotify("error", "Hiếu đang fix, vui lòng đợi"); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (key: string, val: string) => {
    setChanged(prev => ({ ...prev, [key]: val }))
  }

  const save = async () => {
    const updates = Object.entries(changed).map(([key, value]) => ({ key, value }))
    if (updates.length === 0) { onNotify("error", "Chưa có thay đổi nào"); return }
    setSaving(true)
    const res = await fetch("/api/admin/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates }),
    })
    setSaving(false)
    if (res.ok) {
      // Nạp lại để thấy cả các dòng datapool.* vừa được tạo mới
      const d = await fetch("/api/admin/settings").then(r => r.json()).catch(() => null)
      if (d?.settings) setSettings(d.settings)
      setChanged({})
      onNotify("success", `Đã lưu ${updates.length} cài đặt`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  // Công thức Datapool DÙNG CHUNG (3HK, BC Datapool...): giá trị = key datapool.* → key cũ 3hk.* → mặc định
  const formulaNow = resolveFormula(settings)

  return (
    <div className="space-y-4 max-w-6xl">
      <FxTable onNotify={onNotify} />
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">Công Thức Datapool (dùng chung 3HK, BC Datapool...)</h3>
          <p className="text-xs text-gray-500 mt-1">Giả định khách thực dùng bao nhiêu data để tính COGS. Áp dụng cho chatbot và tab Tạo sản phẩm.</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {DATAPOOL_FORMULA.map(d => {
            const cur = changed[d.key] !== undefined ? changed[d.key] : String(formulaNow[d.key])
            return (
              <div key={d.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700 dark:text-slate-200">{d.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{d.hint}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{d.key}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number" step="any" value={cur}
                    onChange={e => setValue(d.key, e.target.value)}
                    className={`w-28 px-3 py-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition ${changed[d.key] !== undefined ? "border-amber-400 bg-amber-50" : "border-gray-300"}`}
                  />
                  <span className="text-xs text-gray-400 w-16">{d.unit}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || Object.keys(changed).length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? "Đang lưu..." : "Lưu tất cả"}
        </button>
        {Object.keys(changed).length > 0 && (
          <span className="text-sm text-amber-600">{Object.keys(changed).length} thay đổi chưa lưu</span>
        )}
      </div>
    </div>
  )
}
