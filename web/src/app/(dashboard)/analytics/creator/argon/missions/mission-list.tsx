"use client"

import { useState } from "react"
import { BarChart3, FileText, Mail, MessagesSquare, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { MISSION_TEMPLATES, PHASE_LABEL, PHASE_PILL, fmtUsd, phaseIndex, relTime, type MissionRowUi, type MissionTemplate } from "./mission-types"

const ICON = { thread: MessagesSquare, mail: Mail, chart: BarChart3, blank: FileText } as const

// Danh sách Sứ mệnh (cột trái, phía trên). Tạo mới: chọn mẫu (đọc thread, đọc hộp thư, theo dõi chỉ số, trống) rồi sửa tên + mục tiêu; Argon hỏi làm rõ tiếp ở pha đầu.
export function MissionList({ missions, activeId, onSelect, onCreate, showArchived, setShowArchived }: {
  missions: MissionRowUi[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, goal: string) => Promise<void>
  showArchived: boolean
  setShowArchived: (v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [tpl, setTpl] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [busy, setBusy] = useState(false)

  const pick = (t: MissionTemplate) => { setTpl(t.id); setName(t.name); setGoal(t.goal) }
  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await onCreate(name.trim(), goal.trim()); setName(""); setGoal(""); setTpl(null); setOpen(false) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="p-2.5">
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-sm transition-colors"><Plus size={15} />Sứ mệnh mới</button>
        {open && (
          <div className="mt-2.5 space-y-2">
            <div className="grid grid-cols-1 gap-1.5">
              {MISSION_TEMPLATES.map(t => {
                const Icon = ICON[t.icon]
                return (
                  <button key={t.id} type="button" onClick={() => pick(t)} aria-pressed={tpl === t.id}
                    className={cn("text-left rounded-xl border px-2.5 py-2 transition-colors", tpl === t.id ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40" : "border-gray-200 dark:border-slate-700 hover:border-violet-300 hover:bg-gray-50 dark:hover:bg-slate-700/50")}>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900 dark:text-slate-100"><Icon size={13} className="text-violet-600 dark:text-violet-300" />{t.label}</span>
                    <span className="block text-[11px] leading-snug text-gray-500 mt-0.5">{t.hint}</span>
                  </button>
                )
              })}
            </div>
            {tpl && <>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Tên sứ mệnh" aria-label="Tên sứ mệnh" maxLength={120}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={4} placeholder="Mục tiêu một vài câu (có thể để trống, Argon sẽ hỏi)" aria-label="Mục tiêu"
                className="w-full px-2.5 py-1.5 text-[13px] border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <div className="flex gap-1.5">
                <button type="button" onClick={submit} disabled={!name.trim() || busy} className="flex-1 px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg disabled:opacity-50">{busy ? "Đang tạo…" : "Tạo"}</button>
                <button type="button" onClick={() => { setOpen(false); setTpl(null) }} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg">Huỷ</button>
              </div>
            </>}
          </div>
        )}
      </div>

      <div className="px-2 space-y-1">
        {missions.length === 0 && (
          <div className="mx-1 my-3 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 px-3 py-5 text-center">
            <Sparkles size={18} className="mx-auto text-violet-500" />
            <div className="mt-1.5 text-sm font-medium text-gray-800 dark:text-slate-100">{showArchived ? "Không có sứ mệnh nào" : "Chưa có sứ mệnh nào"}</div>
            {!showArchived && <div className="mt-0.5 text-xs text-gray-500 leading-snug">Giao cho Argon một mục tiêu dài hạn: đọc hiểu thread, hộp thư, hoặc theo dõi một chỉ số. Bấm “Sứ mệnh mới” để chọn mẫu.</div>}
          </div>
        )}
        {missions.map(m => {
          const idx = phaseIndex(m.phase)
          return (
            <button key={m.id} type="button" onClick={() => onSelect(m.id)} aria-current={m.id === activeId}
              className={cn("group w-full text-left rounded-xl px-3 py-2.5 border transition-colors", m.id === activeId ? "border-violet-400 bg-violet-50/80 dark:bg-violet-950/40 shadow-sm" : "border-transparent hover:bg-gray-50 dark:hover:bg-slate-700/60", m.archived && "opacity-60")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-gray-900 dark:text-slate-100">{m.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={cn("text-[10.5px] px-1.5 py-px rounded-full", PHASE_PILL[m.phase])}>{PHASE_LABEL[m.phase]}</span>
                    <span className="flex gap-0.5" aria-hidden>{[0, 1, 2].map(i => <i key={i} className={cn("h-1 w-4 rounded-full", i < idx ? "bg-emerald-500" : i === idx && m.phase !== "paused" ? "bg-violet-500" : "bg-gray-200 dark:bg-slate-600")} />)}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[10.5px] text-gray-400 pt-0.5">{relTime(m.updated_at)}</span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">{m.files} file · {m.sources} nguồn{m.spent_usd > 0 ? ` · ${fmtUsd(m.spent_usd)}` : ""}</div>
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] text-gray-500"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-violet-600" />Hiện cả sứ mệnh đã lưu trữ</label>
    </div>
  )
}
