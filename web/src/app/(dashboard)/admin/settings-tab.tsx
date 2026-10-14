"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import type { AppSetting } from "./admin-types"
import FxTable from "./fx-table"
import { DATAPOOL_FORMULA, UNLIMITED_LEVELS_KEY, levelMb, parseUnlimitedLevels, resolveFormula, sanitizeLevels, type CustomUnlimited } from "@/lib/datapool-formula"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

/** 1 dòng của bảng mức Unlimited khi đang sửa (giữ chuỗi gõ dở; chỉ dòng hợp lệ mới được lưu). */
interface LevelRow { amount: string; unit: "MB" | "GB"; speed: string; gb: string }
const num = (s: string) => parseFloat(s.replace(",", ".")) || 0
const toRow = (l: CustomUnlimited): LevelRow => ({ amount: String(l.dataMb % 1024 === 0 ? l.dataMb / 1024 : l.dataMb), unit: l.dataMb % 1024 === 0 ? "GB" : "MB", speed: String(l.speedMbps), gb: String(l.gbPerDay) })
const rowToLevel = (r: LevelRow): CustomUnlimited => ({ dataMb: levelMb(num(r.amount), r.unit), speedMbps: num(r.speed), gbPerDay: num(r.gb) })
/** Lỗi của 1 dòng (null = hợp lệ). */
function rowError(r: LevelRow, rows: LevelRow[], i: number): string | null {
  if (!(num(r.amount) > 0) || !(num(r.speed) > 0) || !(num(r.gb) > 0)) return "Nhập đủ 3 số (đều > 0)"
  if (r.unit === "GB" && num(r.amount) < 1) return "Dưới 1GB nhập theo MB (vd 500 MB), không nhập 0.5 GB"
  const l = rowToLevel(r)
  if (rows.some((x, j) => j < i && rowToLevel(x).dataMb === l.dataMb && rowToLevel(x).speedMbps === l.speedMbps)) return "Trùng mức ở dòng phía trên"
  return null
}

export default function SettingsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [settings, setSettings]   = useState<AppSetting[]>([])
  const [changed, setChanged]     = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(true)
  const [saving,  setSaving]      = useState(false)
  const [levels, setLevels]       = useState<LevelRow[]>([])
  const levelsInit = useRef(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => { setSettings(d.settings ?? []); setLoading(false) })
      .catch(() => { onNotify("error", "Hiếu đang fix, vui lòng đợi"); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nạp bảng mức Unlimited vào form 1 lần sau khi tải (và sau mỗi lần lưu thành công)
  useEffect(() => {
    if (loading || levelsInit.current) return
    levelsInit.current = true
    setLevels(parseUnlimitedLevels(settings).map(toRow))
  }, [loading, settings])

  const setValue = (key: string, val: string) => {
    setChanged(prev => ({ ...prev, [key]: val }))
  }

  // Sửa bảng mức: cập nhật form + ghi JSON các dòng hợp lệ vào danh sách thay đổi chờ lưu
  const editLevels = (next: LevelRow[]) => {
    setLevels(next)
    setValue(UNLIMITED_LEVELS_KEY, JSON.stringify(sanitizeLevels(next.filter((r, i) => !rowError(r, next, i)).map(rowToLevel))))
  }
  const patchLevel = (i: number, p: Partial<LevelRow>) => editLevels(levels.map((r, j) => (j === i ? { ...r, ...p } : r)))

  const save = async () => {
    const invalid = levels.map((r, i) => rowError(r, levels, i)).filter(Boolean).length
    if (invalid && changed[UNLIMITED_LEVELS_KEY] !== undefined) { onNotify("error", `Bảng mức Unlimited còn ${invalid} dòng chưa hợp lệ (tô đỏ) — sửa hoặc xoá dòng đó trước khi lưu`); return }
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
      if (d?.settings) { setSettings(d.settings); setLevels(parseUnlimitedLevels(d.settings).map(toRow)) }
      setChanged({})
      onNotify("success", `Đã lưu ${updates.length} cài đặt`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  // Công thức Datapool DÙNG CHUNG (3HK, BC Datapool...): giá trị = key datapool.* → key cũ 3hk.* → mặc định
  const formulaNow = resolveFormula(settings)
  // Fixed/Daily là 2 ô số đơn; các mức Unlimited nằm ở bảng riêng bên dưới (không còn 3 ô cố định)
  const simpleFormulas = DATAPOOL_FORMULA.filter(d => !/unlim/.test(d.key))
  const levelsDirty = changed[UNLIMITED_LEVELS_KEY] !== undefined

  return (
    <div className="space-y-4 max-w-6xl">
      <FxTable onNotify={onNotify} />
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">Công Thức Datapool (dùng chung 3HK, BC Datapool...)</h3>
          <p className="text-xs text-gray-500 mt-1">Giả định khách thực dùng bao nhiêu data để tính COGS. Áp dụng cho chatbot, tab Tạo sản phẩm và tab Soát giá vốn. Mỗi tháng review lại; đổi số thì giá vốn tính lại đổi theo (hệ thống sẽ soát và báo lệch).</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {simpleFormulas.map(d => {
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

        <div className={`pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2 ${levelsDirty ? "ring-1 ring-amber-300 rounded-lg p-3 -mx-1" : ""}`}>
          <div className="text-sm font-medium text-gray-700 dark:text-slate-200">Các mức Unlimited</div>
          <p className="text-xs text-gray-500">
            Gói Unlimited = <b>N GB tốc độ cao</b> mỗi ngày + phần còn lại ở <b>mức throttle Unlimited (Mbps)</b> + Unlimited 1Mbps. Mỗi mức nhập 3 số: GB tốc độ cao, mức throttle, và <b>GB/ngày tính giá</b> (giả định khách thực dùng).
            Giá data = GB/ngày × số ngày × giá/GB. Tạo sản phẩm (3HK, BC) chỉ chọn được các mức có trong bảng này; muốn bán mức mới thì thêm dòng. Dưới 1GB nhập theo MB (500 MB).
          </p>
          <div className="space-y-1.5">
            {levels.length === 0 && <div className="text-xs text-gray-400">Bảng trống — chưa tạo được gói Unlimited nào.</div>}
            {levels.map((r, i) => {
              const err = rowError(r, levels, i)
              const cls = `px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 ${err ? "border-red-400 bg-red-50" : "border-gray-300"}`
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-xs text-gray-500">GB tốc độ cao
                    <div className="flex gap-1 mt-0.5">
                      <input value={r.amount} onChange={e => patchLevel(i, { amount: e.target.value })} inputMode="decimal" className={`${cls} w-20 text-right`} />
                      <select value={r.unit} onChange={e => patchLevel(i, { unit: e.target.value as "MB" | "GB" })} className={cls}><option>GB</option><option>MB</option></select>
                    </div>
                  </label>
                  <label className="text-xs text-gray-500">Mức throttle Unlimited (Mbps)
                    <input value={r.speed} onChange={e => patchLevel(i, { speed: e.target.value })} inputMode="decimal" className={`${cls} block w-28 mt-0.5 text-right`} />
                  </label>
                  <label className="text-xs text-gray-500">GB/ngày tính giá
                    <input value={r.gb} onChange={e => patchLevel(i, { gb: e.target.value })} inputMode="decimal" className={`${cls} block w-28 mt-0.5 text-right`} />
                  </label>
                  <button onClick={() => editLevels(levels.filter((_, j) => j !== i))} className="mt-4 text-gray-400 hover:text-red-600" title="Xoá mức này"><Trash2 size={15} /></button>
                  {err && <span className="mt-4 text-xs text-red-600">{err}</span>}
                </div>
              )
            })}
          </div>
          <button onClick={() => editLevels([...levels, { amount: "", unit: "GB", speed: "", gb: "" }])} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-brand-600 text-brand-700 rounded-lg hover:bg-brand-50"><Plus size={13} /> Thêm mức</button>
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
