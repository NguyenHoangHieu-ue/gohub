"use client"

import { useEffect, useState } from "react"
import { RefreshCw, Save, UserPlus } from "lucide-react"
import type { AssistantFeature } from "@/lib/assistant-features"

// Người dùng thử theo từng người (P3 personal-agent): bật 1 tính năng cho vài username cụ thể, không cần bật cả vai trò.
export default function AssistantPilotUsers({ features }: { features: AssistantFeature[] }) {
  const choices = features.filter(f => f.group !== "creator" && !f.soon)
  const [feature, setFeature] = useState("memory")
  const [pilot, setPilot] = useState<Record<string, string[]>>({})
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/config/assistant-feature-users").then(r => r.ok ? r.json() : null).then(d => { if (d) setPilot(d.pilot ?? {}) })
  }, [])
  useEffect(() => { setText((pilot[feature] ?? []).join(", ")) }, [feature, pilot])

  const save = async () => {
    setSaving(true)
    try {
      const names = text.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean)
      const r = await fetch("/api/config/assistant-feature-users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pilot, [feature]: names }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setPilot(d.pilot ?? {})
      setMsg({ ok: r.ok, text: !r.ok ? d.error || "Lưu thất bại" : d.unknown?.length ? `Đã lưu — bỏ qua username không tồn tại: ${d.unknown.join(", ")}` : "Đã lưu — áp dụng trong vòng 1 phút" })
      setTimeout(() => setMsg(null), 5000)
    } finally { setSaving(false) }
  }

  return (
    <div className="px-6 py-4 border-t border-slate-100 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><UserPlus className="w-3.5 h-3.5" /> Người dùng thử theo từng người</div>
      <p className="text-[11px] text-slate-400">Bật 1 tính năng cho vài username cụ thể dù vai trò của họ chưa được bật ở bảng trên (vd cho vài người thử Trí nhớ trước khi mở cả công ty).</p>
      <div className="flex flex-wrap items-start gap-2">
        <select value={feature} onChange={e => setFeature(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
          {choices.map(f => <option key={f.id} value={f.id}>{f.label}{(pilot[f.id]?.length ?? 0) > 0 ? ` (${pilot[f.id].length})` : ""}</option>)}
        </select>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="username, cách nhau dấu phẩy"
          className="flex-1 min-w-[240px] px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-700 disabled:opacity-50">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
        </button>
      </div>
      {msg && <div className={msg.ok ? "text-[11px] text-emerald-600" : "text-[11px] text-rose-600"}>{msg.text}</div>}
    </div>
  )
}
