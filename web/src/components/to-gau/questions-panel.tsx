"use client"

// Panel "Câu hỏi" — CS đặt câu hỏi về sản phẩm/policy, theo dõi trạng thái chưa/đang/đã xử lý
// thay vì tag người trong chat rồi trôi mất (yêu cầu s194+6).
import React, { useState, useEffect, useCallback } from "react"
import { HelpCircle, Send, Trash2, Clock, Loader2, CheckCircle2 } from "lucide-react"
import { useToast } from "@/components/toast"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { cn } from "@/lib/utils"
import { fmtTime } from "@/lib/to-gau-format"
import type { QuestionItem } from "@/lib/to-gau-types"

const STATUS_META: Record<QuestionItem["status"], { label: string; badge: string; icon: React.ReactNode }> = {
  chua:    { label: "Chưa xử lý",  badge: "bg-rose-50 text-rose-600 border-rose-200",       icon: <Clock size={11} /> },
  dang:    { label: "Đang xử lý",  badge: "bg-amber-50 text-amber-700 border-amber-200",    icon: <Loader2 size={11} /> },
  da_xu_ly:{ label: "Đã xử lý",    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={11} /> },
}

const FILTERS: { key: "all" | QuestionItem["status"]; label: string }[] = [
  { key: "all",     label: "Tất cả" },
  { key: "chua",    label: "Chưa xử lý" },
  { key: "dang",    label: "Đang xử lý" },
  { key: "da_xu_ly",label: "Đã xử lý" },
]

export function QuestionsPanel({
  groupId, myEmail, isPrivileged,
}: {
  groupId: string
  myEmail: string
  isPrivileged: boolean
}) {
  const toast = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
  const [questions, setQuestions]   = useState<QuestionItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<"all" | QuestionItem["status"]>("all")
  const [newQuestion, setNewQuestion] = useState("")
  const [posting, setPosting]       = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/questions`)
      if (!res.ok) return
      const json = await res.json()
      setQuestions(json.data ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!newQuestion.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestion.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setQuestions(prev => [json.data, ...prev])
      setNewQuestion("")
      toast.success("Đã đặt câu hỏi")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setPosting(false)
    }
  }

  async function updateQuestion(id: string, patch: { status?: QuestionItem["status"]; answer?: string }) {
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/questions?question_id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setQuestions(prev => prev.map(q => q.id === id ? json.data : q))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  async function handleDelete(id: string) {
    if (!await confirmDialog("Xóa câu hỏi này?")) return
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/questions?question_id=${id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setQuestions(prev => prev.filter(q => q.id !== id))
      toast.success("Đã xóa câu hỏi")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  function handleSubmitAnswer(id: string) {
    const answer = (answerDrafts[id] ?? "").trim()
    if (!answer) return
    updateQuestion(id, { answer, status: "da_xu_ly" })
    setAnswerDrafts(prev => ({ ...prev, [id]: "" }))
    toast.success("Đã trả lời — chuyển trạng thái Đã xử lý")
  }

  const filtered = filter === "all" ? questions : questions.filter(q => q.status === filter)
  const counts = questions.reduce((acc, q) => { acc[q.status] = (acc[q.status] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <>
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50">
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle size={16} className="text-brand-600" />
        <h2 className="font-semibold text-slate-700 text-[15px]">Câu hỏi CS</h2>
      </div>

      {/* Ask form */}
      <form onSubmit={handleAsk} className="mb-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <textarea
          value={newQuestion}
          onChange={e => setNewQuestion(e.target.value)}
          placeholder="Đặt câu hỏi về sản phẩm/policy... (thay vì tag người trong chat)"
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-brand-600 resize-none"
        />
        <button
          type="submit"
          disabled={posting || !newQuestion.trim()}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <Send size={13} />
          {posting ? "Đang gửi..." : "Đặt câu hỏi"}
        </button>
      </form>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
              filter === f.key
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            )}
          >
            {f.label}{f.key !== "all" && counts[f.key] ? ` (${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <span className="text-slate-400 text-[14px]">Đang tải...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HelpCircle size={36} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Chưa có câu hỏi nào</p>
          <p className="text-slate-400 text-[13px] mt-1">Đặt câu hỏi đầu tiên!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => {
            const meta   = STATUS_META[q.status]
            const canDel = q.asked_by === myEmail || isPrivileged
            return (
              <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] text-slate-800 whitespace-pre-wrap leading-relaxed flex-1">{q.question}</p>
                  {canDel && (
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors flex-shrink-0"
                      title="Xóa"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", meta.badge)}>
                    {meta.icon}{meta.label}
                  </span>
                  <span className="text-[11px] text-slate-400">{q.asked_by_name || q.asked_by} · {fmtTime(q.created_at)}</span>
                </div>

                {/* Status change buttons */}
                <div className="mt-2 flex gap-1.5">
                  {(["chua", "dang", "da_xu_ly"] as const).filter(s => s !== q.status).map(s => (
                    <button
                      key={s}
                      onClick={() => updateQuestion(q.id, { status: s })}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:border-brand-600 hover:text-brand-600 transition-colors"
                    >
                      → {STATUS_META[s].label}
                    </button>
                  ))}
                </div>

                {q.answer ? (
                  <div className="mt-3 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
                    <p className="text-[13px] text-slate-700 whitespace-pre-wrap">{q.answer}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Trả lời bởi {q.answered_by_name || q.answered_by}</p>
                  </div>
                ) : (
                  <div className="mt-3 flex items-end gap-2">
                    <textarea
                      value={answerDrafts[q.id] ?? ""}
                      onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Nhập câu trả lời..."
                      rows={1}
                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-brand-600 resize-none"
                    />
                    <button
                      onClick={() => handleSubmitAnswer(q.id)}
                      disabled={!(answerDrafts[q.id] ?? "").trim()}
                      className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-[12px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      Trả lời
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
    {ConfirmDialog}
    </>
  )
}
