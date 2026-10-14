"use client"

import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import type { AppSetting } from "./admin-types"
import FxTable from "./fx-table"
import { CUSTOM_UNLIMITED_KEY, DATAPOOL_FORMULA, customUnlimitedLabel, parseCustomUnlimited, resolveFormula, type CustomUnlimited } from "@/lib/datapool-formula"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

export default function SettingsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [settings, setSettings]   = useState<AppSetting[]>([])
  const [changed, setChanged]     = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(true)
  const [saving,  setSaving]      = useState(false)
  const [draft, setDraft] = useState({ hs: "", hsUnit: "GB" as "MB" | "GB", speed: "", gbPerDay: "" })

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
  // Các mức Unlimited tự thêm: danh sách đang sửa (chưa lưu) hoặc đã lưu
  const customNow: CustomUnlimited[] = changed[CUSTOM_UNLIMITED_KEY] !== undefined ? parseCustomUnlimited([{ key: CUSTOM_UNLIMITED_KEY, value: changed[CUSTOM_UNLIMITED_KEY] }]) : parseCustomUnlimited(settings)
  const setCustom = (list: CustomUnlimited[]) => setValue(CUSTOM_UNLIMITED_KEY, JSON.stringify(list))
  const addCustom = () => {
    const hsNum = parseFloat(draft.hs.replace(",", ".")) || 0
    if (draft.hsUnit === "GB" && hsNum > 0 && hsNum < 1) { onNotify("error", "Dưới 1GB hãy nhập theo MB (vd 500 MB) — 0.5 GB sẽ thành 512MB, không khớp 500MB ở tab Tạo sản phẩm"); return }
    const dataMb = hsNum * (draft.hsUnit === "GB" ? 1024 : 1)
    const speedMbps = parseFloat(draft.speed.replace(",", ".")) || 0
    const gbPerDay = parseFloat(draft.gbPerDay.replace(",", ".")) || 0
    if (!(dataMb > 0 && speedMbps > 0 && gbPerDay > 0)) { onNotify("error", "Nhập đủ tốc độ cao, tốc độ Mbps và GB/ngày (đều > 0)"); return }
    const builtIn = dataMb === 3072 && speedMbps === 10
    if (builtIn || customNow.some(c => c.dataMb === dataMb && c.speedMbps === speedMbps)) { onNotify("error", "Mức này đã có — sửa số ở dòng cũ"); return }
    setCustom([...customNow, { dataMb, speedMbps, gbPerDay }])
    setDraft({ hs: "", hsUnit: "GB", speed: "", gbPerDay: "" })
  }

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
        <div className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
          <div className="text-sm font-medium text-gray-700 dark:text-slate-200">Các loại Unlimited khác (tự thêm)</div>
          <p className="text-xs text-gray-500">Mỗi mức = dung lượng tốc độ cao mỗi ngày + tốc độ Unlimited (Mbps) → GB/ngày thực dùng để tính giá (GB tính giá = số này × số ngày). Tab Tạo sản phẩm (BC Datapool) dùng được ngay sau khi lưu; mức 3GB + 10Mbps có sẵn ở trên.</p>
          {customNow.length === 0 && <div className="text-xs text-gray-400">Chưa có mức nào.</div>}
          {customNow.map((c, i) => (
            <div key={`${c.dataMb}:${c.speedMbps}`} className="flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0 text-gray-700 dark:text-slate-200">{customUnlimitedLabel(c)}</div>
              <input type="number" step="any" value={c.gbPerDay}
                onChange={e => { const v = parseFloat(e.target.value); setCustom(customNow.map((x, j) => (j === i ? { ...x, gbPerDay: Number.isFinite(v) ? v : 0 } : x))) }}
                className="w-24 px-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-xs text-gray-400 w-14">GB/ngày</span>
              <button onClick={() => setCustom(customNow.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Xoá</button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-xs text-gray-500">Tốc độ cao
              <div className="flex gap-1 mt-0.5">
                <input value={draft.hs} onChange={e => setDraft(d => ({ ...d, hs: e.target.value }))} placeholder="vd 1" className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
                <select value={draft.hsUnit} onChange={e => setDraft(d => ({ ...d, hsUnit: e.target.value as "MB" | "GB" }))} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"><option>GB</option><option>MB</option></select>
              </div>
            </label>
            <label className="text-xs text-gray-500">Unlimited (Mbps)
              <input value={draft.speed} onChange={e => setDraft(d => ({ ...d, speed: e.target.value }))} placeholder="vd 5" className="block w-24 mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
            </label>
            <label className="text-xs text-gray-500">GB/ngày tính giá
              <input value={draft.gbPerDay} onChange={e => setDraft(d => ({ ...d, gbPerDay: e.target.value }))} placeholder="vd 2.1" className="block w-28 mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
            </label>
            <button onClick={addCustom} className="px-3 py-1.5 text-sm font-medium border border-brand-600 text-brand-700 rounded-lg hover:bg-brand-50">+ Thêm mức</button>
          </div>
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
