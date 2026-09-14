"use client"

import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import type { AppSetting } from "./admin-types"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

const SETTING_UNITS: Record<string, string> = {
  // Tỷ giá — Gohub JSC (VND)
  "fx.usd_vnd":              "VND / 1 USD",
  "fx.vnd_cny":              "VND / 1 CNY (JSC)",
  "fx.vnd_gbp":              "VND / 1 GBP (JSC)",
  // Tỷ giá — Gohub Inc (1 USD = X)
  "fx.hkd_usd":              "USD / 1 HKD  (= 1 / HKD/USD)",
  "fx.twd_usd":              "USD / 1 TWD  (= 1 / TWD/USD)",
  "fx.usd_jpy":              "JPY / 1 USD",
  "fx.usd_thb":              "THB / 1 USD",
  "fx.usd_cny":              "CNY / 1 USD (Inc)",
  "fx.usd_eur":              "EUR / 1 USD",
  "fx.usd_gbp":              "GBP / 1 USD (Inc)",
  "fx.usd_sgd":              "SGD / 1 USD",
  // 3HK formula
  "3hk.fixed_factor":        "(0 – 1)",
  "3hk.daily_factor":        "(0 – 1)",
  "3hk.unlim_10mbps_gb_day": "GB/day",
  "3hk.unlim_5mbps_gb_day":  "GB/day",
}

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

  const getCurrentValue = (s: AppSetting) =>
    changed[s.key] !== undefined ? changed[s.key] : s.value

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
      // Reflect saved values back
      setSettings(prev => prev.map(s =>
        changed[s.key] !== undefined
          ? { ...s, value: changed[s.key], updated_at: new Date().toISOString() }
          : s
      ))
      setChanged({})
      onNotify("success", `Đã lưu ${updates.length} cài đặt`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  const fxSettings      = settings.filter(s => s.category === "fx_rate")
  const formulaSettings = settings.filter(s => s.category === "formula")

  const renderSection = (title: string, rows: AppSetting[]) => (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">{title}</h3>
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map(s => (
          <div key={s.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700 dark:text-slate-200">{s.label}</div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">{s.key}</div>
              {s.updated_at && (
                <div className="text-xs text-gray-300 mt-0.5">
                  Cập nhật: {new Date(s.updated_at).toLocaleString("vi-VN")}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                step="any"
                value={getCurrentValue(s)}
                onChange={e => setValue(s.key, e.target.value)}
                className={`w-28 px-3 py-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition ${
                  changed[s.key] !== undefined ? "border-amber-400 bg-amber-50" : "border-gray-300"
                }`}
              />
              {SETTING_UNITS[s.key] && (
                <span className="text-xs text-gray-400 w-28">{SETTING_UNITS[s.key]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      {renderSection("Tỷ Giá Nội Bộ", fxSettings)}
      {renderSection("Công Thức 3HK Datapool", formulaSettings)}
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
