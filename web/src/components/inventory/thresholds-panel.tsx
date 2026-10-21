"use client"

import { useEffect, useState } from "react"
import { Boxes, RefreshCw, Save, Settings2 } from "lucide-react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

// Ngưỡng cảnh báo tồn kho (trước đây ở Cấu hình hệ thống). Mọi người xem được; chỉ admin/creator sửa (API cũng chặn ghi).
const DEFAULTS = { safeDays: 90, normalDays: 60, warningDays: 30 }
type T = typeof DEFAULTS
const FIELDS: [keyof T, string][] = [
  ["safeDays", "An toàn: từ (ngày)"],
  ["normalDays", "Bình thường: từ (ngày)"],
  ["warningDays", "Cần chú ý: từ (ngày). Dưới mức này là Nguy hiểm"],
]

export function InventoryThresholdsPanel() {
  const { data: session } = useSession()
  const canEdit = ["admin", "creator"].includes(session?.user?.role ?? "")
  const [open, setOpen] = useState(false)
  const [t, setT] = useState<T>(DEFAULTS)
  const [saved, setSaved] = useState(JSON.stringify(DEFAULTS))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/config/inventory-alert-thresholds", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return
      const v = { safeDays: d.safeDays ?? 90, normalDays: d.normalDays ?? 60, warningDays: d.warningDays ?? 30 }
      setT(v); setSaved(JSON.stringify(v))
    }).catch(() => {})
  }, [open])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch("/api/config/inventory-alert-thresholds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setSaved(JSON.stringify(t))
      setMsg({ ok: r.ok, text: r.ok ? "Đã lưu. Tải lại tab Tồn kho để thấy mức mới." : (j.error || "Lưu thất bại") })
    } finally { setSaving(false) }
  }

  const dirty = JSON.stringify(t) !== saved
  return (
    <div className="mb-4">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
        <Settings2 className="w-3.5 h-3.5" />Ngưỡng cảnh báo tồn kho
      </button>
      {open && (
        <div className="mt-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-brand-600" />
            <div className="mr-auto">
              <h2 className="font-bold text-slate-800">Ngưỡng cảnh báo tồn kho</h2>
              <p className="text-[12.5px] text-slate-500">Dựa trên số ngày còn hàng ước tính (tồn hiện tại chia tốc độ bán mỗi ngày).</p>
            </div>
            {canEdit && (
              <button onClick={save} disabled={saving || !dirty}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50", dirty ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-200 text-slate-400")}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
              </button>
            )}
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="text-[12.5px] font-semibold text-slate-600" htmlFor={`thr-${key}`}>{label}</label>
                <input id={`thr-${key}`} type="number" min={1} value={t[key]} disabled={!canEdit}
                  onChange={e => setT(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 text-[12.5px] text-slate-500">Phải theo thứ tự An toàn &gt; Bình thường &gt; Cần chú ý. Mặc định 90/60/30 ngày.{!canEdit && " Chỉ admin và creator được sửa."}</p>
          {msg && <p className={cn("px-5 pb-4 text-[13px]", msg.ok ? "text-emerald-700" : "text-rose-600")}>{msg.text}</p>}
        </div>
      )}
    </div>
  )
}
