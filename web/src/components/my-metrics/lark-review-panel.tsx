"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback } from "react"
import { Sparkles, ChevronUp, ChevronDown, Check, Pencil, X, ExternalLink, StickyNote, Undo2 } from "lucide-react"
import { hhmm } from "@/lib/my-metrics-format"
import type { LarkEvent } from "@/lib/my-metrics-types"

// ─── Bé Gấu review queue (Lark auto-detect) ───────────────────────────────────
export function LarkReviewPanel({ metric, quarter, unit, onReviewed }: {
  metric: "sla" | "vendor_speed"; quarter: string; unit: "giờ" | "phút"; onReviewed?: () => void
}) {
  const [pending,    setPending]    = useState<LarkEvent[]>([])
  const [rejected,   setRejected]   = useState<LarkEvent[]>([])
  const [notMatched, setNotMatched] = useState<LarkEvent[]>([])
  const [selfInit,   setSelfInit]   = useState<LarkEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(true)
  const [rejOpen, setRejOpen] = useState(false)
  const [nmOpen, setNmOpen] = useState(false)
  const [selfOpen, setSelfOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, { request_time: string; completion_time: string }>>({})
  const [noteEditing, setNoteEditing] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [p, r, nm, self] = await Promise.all([
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=pending_review`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=rejected`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=not_matched&self_initiated=false`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&status=not_matched&self_initiated=true`),
    ])
    if (p.ok) { const j = await p.json(); setPending(j.items ?? []) }
    if (r.ok) { const j = await r.json(); setRejected(j.items ?? []) }
    if (nm.ok) { const j = await nm.json(); setNotMatched(j.items ?? []) }
    if (self.ok) { const j = await self.json(); setSelfInit(j.items ?? []) }
    setLoaded(true)
  }, [quarter, metric])

  useEffect(() => { fetchData() }, [fetchData])

  const startEdit = (ev: LarkEvent) => setEditing(p => ({
    ...p, [ev.id]: { request_time: ev.request_time?.slice(0, 16) ?? "", completion_time: ev.completion_time?.slice(0, 16) ?? "" },
  }))

  const review = async (id: string, action: "confirm" | "reject", times?: { request_time?: string; completion_time?: string }) => {
    setBusy(id)
    const r = await fetch(`/api/analytics/my-metrics/lark-events/${id}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...times }),
    })
    setBusy(null)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi duyệt"); return }
    setEditing(p => { const n = { ...p }; delete n[id]; return n })
    fetchData()
    onReviewed?.()
  }

  const saveNote = async (id: string) => {
    setBusy(id)
    const r = await fetch(`/api/analytics/my-metrics/lark-events/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hieu_note: noteEditing[id] ?? "" }),
    })
    setBusy(null)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi lưu ghi chú"); return }
    setNoteEditing(p => { const n = { ...p }; delete n[id]; return n })
    fetchData()
  }

  const override = async (id: string) => {
    if (!confirm("Vẫn tính case này dù Hiếu tự đăng? Sẽ gọi AI phân loại lại thread ngay bây giờ.")) return
    setBusy(id)
    const r = await fetch(`/api/analytics/my-metrics/lark-events/${id}/override`, { method: "POST" })
    setBusy(null)
    if (!r.ok) { const j = await r.json(); alert(j.error ?? "Lỗi override"); return }
    fetchData()
    onReviewed?.()
  }

  // Ô ghi chú tự do — dùng chung cho pending/rejected/self-initiated (mọi trạng thái đều audit được).
  const NoteEditor = ({ ev }: { ev: LarkEvent }) => {
    const isEditing = noteEditing[ev.id] !== undefined
    if (!isEditing) return (
      <button onClick={() => setNoteEditing(p => ({ ...p, [ev.id]: ev.hieu_note ?? "" }))}
        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-brand-600 mt-1">
        <StickyNote className="w-2.5 h-2.5" /> {ev.hieu_note ? <span className="text-slate-500 italic truncate max-w-[220px]">{ev.hieu_note}</span> : "+ ghi chú"}
      </button>
    )
    return (
      <div className="flex items-center gap-1 mt-1">
        <input autoFocus value={noteEditing[ev.id]} onChange={e => setNoteEditing(p => ({ ...p, [ev.id]: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && saveNote(ev.id)}
          placeholder="Ghi chú để đối chiếu sau…"
          className="border border-slate-200 rounded px-1.5 py-0.5 text-[10px] w-48" />
        <button disabled={busy === ev.id} onClick={() => saveNote(ev.id)} className="text-emerald-600"><Check className="w-3 h-3" /></button>
        <button onClick={() => setNoteEditing(p => { const n = { ...p }; delete n[ev.id]; return n })} className="text-slate-400"><X className="w-3 h-3" /></button>
      </div>
    )
  }

  if (!loaded) return null
  const totalSeen = pending.length + rejected.length + notMatched.length + selfInit.length
  if (totalSeen === 0) return null

  return (
    <div className="border border-amber-200 rounded-xl bg-amber-50/50 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="flex items-center gap-1.5 text-xs font-black text-amber-700">
          <Sparkles className="w-3.5 h-3.5" />
          {pending.length > 0 ? `Bé Gấu phát hiện ${pending.length} case mới — chờ duyệt` : "Chưa có case mới chờ duyệt"}
          <span className="font-normal text-amber-600/70">· đã quét {totalSeen} thread</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-amber-600" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-600" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {pending.map(ev => {
            const isEditing = !!editing[ev.id]
            return (
              <div key={ev.id} className="bg-white border border-amber-200 rounded-lg p-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <a href={`https://applink.larksuite.com/client/chat/open?openChatId=${encodeURIComponent(ev.chat_id)}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-black hover:bg-brand-100">
                    💬 {ev.chat_name} <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-slate-500 italic mb-1">"{ev.ai_reason || "(không có lý do)"}"</p>
                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <div><span className="text-slate-400">📩 </span><span className="font-bold">{hhmm(ev.request_time)}</span> <span className="text-slate-400">({ev.request_sender ?? "?"})</span><p className="text-slate-600 whitespace-pre-wrap break-words">{ev.request_snippet}</p></div>
                    <div><span className="text-slate-400">✅ </span><span className="font-bold">{ev.completion_time ? hhmm(ev.completion_time) : "chưa xong"}</span> {ev.completion_sender && <span className="text-slate-400">({ev.completion_sender})</span>}<p className="text-slate-600 whitespace-pre-wrap break-words">{ev.completion_snippet}</p></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="datetime-local" value={editing[ev.id].request_time}
                      onChange={e => setEditing(p => ({ ...p, [ev.id]: { ...p[ev.id], request_time: e.target.value } }))}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                    <input type="datetime-local" value={editing[ev.id].completion_time}
                      onChange={e => setEditing(p => ({ ...p, [ev.id]: { ...p[ev.id], completion_time: e.target.value } }))}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px]" />
                  </div>
                )}
                {ev.duration_value != null && !isEditing && <p className="mt-1 font-black text-slate-700">⏱ {ev.duration_value.toFixed(2)} {unit}</p>}
                {!isEditing && <NoteEditor ev={ev} />}
                <div className="flex gap-1.5 mt-2">
                  {!isEditing ? (
                    <>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "confirm")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="w-3 h-3" /> Xác nhận
                      </button>
                      <button onClick={() => startEdit(ev)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <Pencil className="w-3 h-3" /> Sửa giờ
                      </button>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "reject")}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                        <X className="w-3 h-3" /> Từ chối
                      </button>
                    </>
                  ) : (
                    <>
                      <button disabled={busy === ev.id} onClick={() => review(ev.id, "confirm", {
                        request_time: editing[ev.id].request_time ? new Date(editing[ev.id].request_time).toISOString() : undefined,
                        completion_time: editing[ev.id].completion_time ? new Date(editing[ev.id].completion_time).toISOString() : undefined,
                      })} className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        Lưu &amp; xác nhận
                      </button>
                      <button onClick={() => setEditing(p => { const n = { ...p }; delete n[ev.id]; return n })}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {rejected.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setRejOpen(v => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                {rejOpen ? "Ẩn" : "Xem"} {rejected.length} case đã từ chối (Hiếu từ chối tay)
              </button>
              {rejOpen && (
                <div className="mt-1.5 space-y-1">
                  {rejected.map(ev => (
                    <div key={ev.id} className="text-[10px] text-slate-400 bg-white/60 rounded px-2 py-1">
                      {hhmm(ev.request_time)} · {(ev.request_snippet ?? "").slice(0, 60)} — <em>{ev.ai_reason}</em>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {notMatched.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setNmOpen(v => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                {nmOpen ? "Ẩn" : "Xem"} {notMatched.length} thread Bé Gấu ĐÃ XEM nhưng không khớp (audit AI — kiểm tra bot có bỏ sót không)
              </button>
              {nmOpen && (
                <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto">
                  {notMatched.map(ev => (
                    <div key={ev.id} className="text-[10px] text-slate-400 bg-white/60 rounded px-2 py-1">
                      {hhmm(ev.request_time)} · {(ev.request_snippet ?? "").slice(0, 80)} — <em>{ev.ai_reason || "(không có lý do)"}</em>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {selfInit.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setSelfOpen(v => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                {selfOpen ? "Ẩn" : "Xem"} {selfInit.length} thread Hiếu tự đăng — không tính tự động (chung cho SLA + Vendor Speed)
              </button>
              {selfOpen && (
                <div className="mt-1.5 space-y-1.5 max-h-64 overflow-y-auto">
                  {selfInit.map(ev => (
                    <div key={ev.id} className="text-[10px] bg-white/60 rounded-lg px-2 py-1.5">
                      <div className="text-slate-400">{hhmm(ev.request_time)} <span className="text-slate-500">({ev.request_sender ?? "?"})</span></div>
                      <p className="text-slate-600 whitespace-pre-wrap break-words">{ev.request_snippet}</p>
                      <NoteEditor ev={ev} />
                      <button disabled={busy === ev.id} onClick={() => override(ev.id)}
                        className="flex items-center gap-1 mt-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                        <Undo2 className="w-3 h-3" /> Vẫn tính case này
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
