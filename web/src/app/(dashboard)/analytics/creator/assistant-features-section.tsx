"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Lock, RefreshCw, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/lib/agents/types"
import type { AssistantFeature, FeatureGroup, FeatureMatrix } from "@/lib/assistant-features"

const GROUPS: { id: FeatureGroup; label: string; hint: string }[] = [
  { id: "everyone", label: "Mọi người", hint: "Mặc định bật cho mọi vai trò" },
  { id: "by_role", label: "Theo quyền", hint: "Mặc định chỉ Admin — bật thêm cho vai trò cần dùng" },
  { id: "creator", label: "Chỉ Creator", hint: "Khoá cứng, không cấp cho vai trò khác" },
]

// Bảng bật/tắt tính năng Bé Gấu theo vai trò (plan be-gau-upgrade.md U3). Creator luôn có tất cả.
export default function AssistantFeaturesSection() {
  const [features, setFeatures] = useState<AssistantFeature[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [matrix, setMatrix] = useState<FeatureMatrix>({})
  const [snap, setSnap] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/config/assistant-features").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setFeatures(d.features); setRoles(d.roles); setMatrix(d.matrix); setSnap(JSON.stringify(d.matrix))
    }).finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(matrix) !== snap
  const on = (f: string, r: string) => (matrix[f] ?? []).includes(r)
  const toggle = (f: string, r: string) => setMatrix(prev => {
    const s = new Set(prev[f] ?? [])
    s.has(r) ? s.delete(r) : s.add(r)
    return { ...prev, [f]: roles.filter(x => s.has(x)) }
  })
  const toggleRow = (f: string) => setMatrix(prev => ({ ...prev, [f]: roles.every(r => on(f, r)) ? [] : [...roles] }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch("/api/config/assistant-features", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(matrix) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setMatrix(d.matrix); setSnap(JSON.stringify(d.matrix)) }
      setMsg({ ok: r.ok, text: r.ok ? "Đã lưu — Bé Gấu áp dụng trong vòng 1 phút" : d.error || "Lưu thất bại" })
      setTimeout(() => setMsg(null), 3000)
    } finally { setSaving(false) }
  }

  const countFor = (r: string) => features.filter(f => !f.soon && f.group !== "creator" && on(f.id, r)).length

  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-sky-50 bg-sky-50/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Bé Gấu — Tính năng theo vai trò</h2>
            <p className="text-xs text-slate-400">Bấm ô để bật/tắt. Creator luôn dùng được mọi tính năng.</p>
          </div>
        </div>
        <button onClick={save} disabled={saving || !dirty}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu
        </button>
      </div>

      {msg && <div className={cn("mx-6 mt-4 px-4 py-2.5 rounded-xl text-sm", msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100")}>{msg.text}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[260px]">Tính năng</th>
                {roles.map(r => (
                  <th key={r} className="px-2 py-2.5 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    <div>{ROLE_LABELS[r] ?? r}</div>
                    <div className="mt-0.5 font-medium normal-case tracking-normal text-slate-400">{countFor(r)} bật</div>
                  </th>
                ))}
              </tr>
            </thead>
            {GROUPS.map(g => {
              const rows = features.filter(f => f.group === g.id)
              if (!rows.length) return null
              return (
                <tbody key={g.id} className="divide-y divide-slate-50">
                  <tr className="bg-slate-50/70">
                    <td colSpan={roles.length + 1} className="px-4 py-2 text-[11px] font-bold text-slate-600">
                      {g.label}<span className="ml-2 font-normal text-slate-400">{g.hint}</span>
                    </td>
                  </tr>
                  {rows.map(f => {
                    const locked = f.group === "creator"
                    return (
                      <tr key={f.id} className={cn("hover:bg-slate-50/40", f.soon && "opacity-60")}>
                        <td className="px-4 py-2">
                          <button type="button" disabled={locked} onClick={() => toggleRow(f.id)} title={locked ? undefined : "Bật/tắt cho mọi vai trò"}
                            className={cn("text-left", !locked && "hover:text-sky-700")}>
                            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                              {f.label}
                              {f.soon && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase">Sắp có</span>}
                            </div>
                            <div className="text-[11px] text-slate-400">{f.description}</div>
                          </button>
                        </td>
                        {roles.map(r => {
                          const active = on(f.id, r)
                          return (
                            <td key={r} className="px-2 py-2 text-center">
                              {locked ? (
                                <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center bg-slate-50 border border-slate-100 text-slate-300" title="Chỉ Creator">
                                  <Lock className="w-3 h-3" />
                                </span>
                              ) : (
                                <button type="button" onClick={() => toggle(f.id, r)} aria-pressed={active}
                                  aria-label={`${f.label} — ${ROLE_LABELS[r] ?? r}`}
                                  className={cn("w-7 h-7 rounded-lg inline-flex items-center justify-center border transition-all",
                                    active ? "bg-emerald-100 border-emerald-200 text-emerald-600 hover:bg-emerald-200" : "bg-slate-50 border-slate-200 text-transparent hover:bg-slate-100")}>
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
          <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100">
            Xanh = vai trò đó dùng được. "Sắp có" = tính năng đang làm, bật trước thì có hiệu lực ngay khi ra mắt.
            Dữ liệu (doanh thu, sản phẩm, kiến thức, tạo file Lark của chính mình) luôn có cho mọi vai trò.
          </p>
        </div>
      )}
    </div>
  )
}
