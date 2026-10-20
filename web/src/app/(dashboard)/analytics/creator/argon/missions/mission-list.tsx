"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { PHASE_LABEL, PHASE_PILL, fmtUsd, type MissionRowUi } from "./mission-types"

// Danh sách Sứ mệnh (cột trái, phía trên). Tạo mới: tên + mục tiêu một câu; Argon sẽ hỏi làm rõ tiếp ở pha đầu.
export function MissionList({ missions, activeId, onSelect, onCreate, showArchived, setShowArchived }: {
  missions: MissionRowUi[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, goal: string) => Promise<void>
  showArchived: boolean
  setShowArchived: (v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await onCreate(name.trim(), goal.trim()); setName(""); setGoal(""); setOpen(false) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="p-2">
        <button type="button" onClick={() => setOpen(v => !v)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg"><Plus size={14} />Sứ mệnh mới</button>
        {open && (
          <div className="mt-2 space-y-1.5">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Tên, vd Giữ %Datapool Q4 ≥ 75%" aria-label="Tên sứ mệnh" maxLength={120}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} placeholder="Mục tiêu một vài câu (có thể để trống, Argon sẽ hỏi)" aria-label="Mục tiêu"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
            <div className="flex gap-1.5">
              <button type="button" onClick={submit} disabled={!name.trim() || busy} className="flex-1 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">{busy ? "Đang tạo…" : "Tạo"}</button>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg">Huỷ</button>
            </div>
          </div>
        )}
      </div>
      <div className="px-1.5 space-y-1">
        {missions.length === 0 && <div className="text-xs text-gray-400 text-center py-5">{showArchived ? "Không có sứ mệnh nào." : "Chưa có sứ mệnh nào. Tạo sứ mệnh đầu tiên."}</div>}
        {missions.map(m => (
          <button key={m.id} type="button" onClick={() => onSelect(m.id)} aria-current={m.id === activeId}
            className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm border", m.id === activeId ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40" : "border-transparent hover:bg-gray-50 dark:hover:bg-slate-700", m.archived && "opacity-60")}>
            <div className="truncate font-medium text-gray-900 dark:text-slate-100">{m.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className={cn("px-1.5 py-px rounded-full", PHASE_PILL[m.phase])}>{PHASE_LABEL[m.phase]}</span>
              <span>{m.files} file · {m.sources} nguồn{m.spent_usd > 0 ? ` · ${fmtUsd(m.spent_usd)}` : ""}</span>
            </div>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-gray-500"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-violet-600" />Hiện cả sứ mệnh đã lưu trữ</label>
    </div>
  )
}
