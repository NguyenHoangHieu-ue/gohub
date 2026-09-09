"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback } from "react"
import { Sparkles, ChevronUp, ChevronDown, Check, Pencil, X, ExternalLink } from "lucide-react"
import { hhmm } from "@/lib/my-metrics-format"
import type { LarkEvent } from "@/lib/my-metrics-types"

// ─── Bé Gấu review queue (Lark auto-detect) ───────────────────────────────────
export function LarkReviewPanel({ metric, quarter, unit, onReviewed }: {
  metric: "sla" | "vendor_speed"; quarter: string; unit: "giờ" | "phút"; onReviewed?: () => void
}) {
  const [pending,    setPending]    = useState<LarkEvent[]>([])
  const [rejected,   setRejected]   = useState<LarkEvent[]>([])
  const [notMatched, setNotMatched] = useState<LarkEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(true)
  const [rejOpen, setRejOpen] = useState(false)
  const [nmOpen, setNmOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, { request_time: string; completion_time: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [p, r, nm] = await Promise.all([
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=pending_review`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=rejected`),
      fetch(`/api/analytics/my-metrics/lark-events?quarter=${quarter}&metric=${metric}&status=not_matched`),
    ])
    if (p.ok) { const j = await p.json(); setPending(j.items ?? []) }
    if (r.ok) { const j = await r.json(); setRejected(j.items ?? []) }
    if (nm.ok) { const j = await nm.json(); setNotMatched(j.items ?? []) }
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

  if (!loaded) return null
  const totalSeen = pending.length + rejected.length + notMatched.length
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
        </div>
      )}
    </div>
  )
}
