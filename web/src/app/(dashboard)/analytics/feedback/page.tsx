"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  MessageSquare, Send, CheckCircle, Clock, X, Check, RefreshCw, User, Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FeedbackItem {
  id: string
  user_id: string
  user_email: string
  content: string
  status: "submitted" | "fixed" | "rejected"
  reject_reason?: string
  created_at: string
  updated_at: string
}

type FilterStatus = "all" | "submitted" | "fixed" | "rejected"

function StatusBadge({ status }: { status: FeedbackItem["status"] }) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
      status === "fixed"    ? "bg-emerald-50 text-emerald-600" :
      status === "rejected" ? "bg-rose-50 text-rose-600" :
                              "bg-amber-50 text-amber-600"
    )}>
      {status === "fixed"    ? <CheckCircle className="w-3 h-3" /> :
       status === "rejected" ? <X           className="w-3 h-3" /> :
                               <Clock       className="w-3 h-3" />}
      {status}
    </span>
  )
}

export default function FeedbackPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"

  const [feedbacks,    setFeedbacks]    = useState<FeedbackItem[]>([])
  const [content,      setContent]      = useState("")
  const [loading,      setLoading]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [filter,       setFilter]       = useState<FilterStatus>("all")
  const [rejectId,     setRejectId]     = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const fetchFeedbacks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/feedbacks?status=${filter}`)
      if (res.ok) setFeedbacks(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFeedbacks() }, [filter])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/feedbacks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: content.trim() }),
      })
      if (res.ok) { setContent(""); fetchFeedbacks() }
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: string, status: FeedbackItem["status"], reason?: string) => {
    const res = await fetch(`/api/feedbacks/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, rejectReason: reason }),
    })
    if (res.ok) { setRejectId(null); setRejectReason(""); fetchFeedbacks() }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Feedback</h1>
        <p className="text-slate-500 text-sm mt-1">Góp ý, báo lỗi hoặc đề xuất cải tiến hệ thống.</p>
      </div>

      {/* Submit Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600" />
          Gửi feedback mới
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Mô tả góp ý, lỗi hoặc đề xuất của bạn..."
            className="w-full h-28 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            required
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg",
                submitting || !content.trim()
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200"
              )}
            >
              <Send className="w-4 h-4" />
              {submitting ? "Đang gửi..." : "Gửi feedback"}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Danh sách feedback</h2>
          <div className="flex items-center gap-2">
            <button onClick={fetchFeedbacks} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              {(["all", "submitted", "fixed", "rejected"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize",
                    filter === f ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {f === "all" ? "Tất cả" : f === "submitted" ? "Chờ xử lý" : f === "fixed" ? "Đã fix" : "Từ chối"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 animate-pulse space-y-4">
              <div className="flex justify-between"><div className="h-4 w-32 bg-slate-100 rounded" /><div className="h-4 w-20 bg-slate-100 rounded" /></div>
              <div className="h-14 bg-slate-50 rounded" />
            </div>
          ))
        ) : feedbacks.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <MessageSquare className="w-7 h-7 text-slate-300" />
            </div>
            <div>
              <p className="text-slate-700 font-bold">Chưa có feedback nào</p>
              <p className="text-slate-400 text-sm">Hãy là người đầu tiên gửi ý kiến!</p>
            </div>
          </div>
        ) : (
          feedbacks.map(fb => (
            <div key={fb.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{fb.user_email?.split("@")[0] || fb.user_id}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(fb.created_at).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                </div>
                <StatusBadge status={fb.status} />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 leading-relaxed italic">
                "{fb.content}"
                {fb.status === "rejected" && fb.reject_reason && (
                  <div className="mt-3 pt-3 border-t border-slate-200 not-italic">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Lý do từ chối:</p>
                    <p className="text-xs text-rose-600 bg-rose-50/50 p-2 rounded-lg border border-rose-100">{fb.reject_reason}</p>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                  {rejectId === fb.id ? (
                    <div className="bg-slate-50 p-3 rounded-xl space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Lý do từ chối</label>
                      <textarea
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-rose-500 outline-none"
                        placeholder="Giải thích lý do từ chối..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setRejectId(null)} className="px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg">Hủy</button>
                        <button
                          onClick={() => updateStatus(fb.id, "rejected", rejectReason)}
                          disabled={!rejectReason.trim()}
                          className="px-3 py-1 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
                        >
                          Xác nhận từ chối
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {fb.status !== "fixed" && (
                        <button
                          onClick={() => updateStatus(fb.id, "fixed")}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-100"
                        >
                          <Check className="w-3 h-3" />
                          Đã fix
                        </button>
                      )}
                      {fb.status !== "rejected" && (
                        <button
                          onClick={() => setRejectId(fb.id)}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100"
                        >
                          <X className="w-3 h-3" />
                          Từ chối
                        </button>
                      )}
                      {(fb.status === "fixed" || fb.status === "rejected") && (
                        <button
                          onClick={() => updateStatus(fb.id, "submitted")}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Revert
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
