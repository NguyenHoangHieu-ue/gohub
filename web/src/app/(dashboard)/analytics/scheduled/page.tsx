"use client"

import React, { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { Clock, Plus, Edit2, Trash2, Power, Save, X, Calendar, MessageSquare, Globe2, Play, User, FileText } from "lucide-react"
import { useToast } from "@/components/toast"

// Port intel ScheduledMessages — tab riêng (admin-only). Backend web /api/admin/scheduled-messages (+/[id]).
// Cron tự chạy qua GitHub Actions (*/15') + Vercel Cron backstop (0 0 * * *) → /api/cron/scheduled-messages.
// Giờ cron nhập ở đây = GIỜ VIỆT NAM (ICT); matcher scheduled-cron.ts so theo ICT.

interface ScheduledMessage {
  id: string
  name: string
  prompt: string
  cron_expression: string
  lark_webhook_url: string
  lark_keyword?: string
  is_active: boolean
  last_run_at: string | null
  created_at: string
  created_by: string
}

function parseCron(cron: string) {
  if (!cron) return { mode: "daily", time: "08:00", dayOfWeek: "1", dayOfMonth: "1", customString: "" }
  const parts = cron.split(" ")
  if (parts.length !== 5) return { mode: "custom", time: "08:00", dayOfWeek: "1", dayOfMonth: "1", customString: cron }
  const [m, h, dom, mon, dow] = parts
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
  if (dom === "*" && mon === "*" && dow === "*") return { mode: "daily", time, dayOfWeek: "1", dayOfMonth: "1", customString: cron }
  if (dom === "*" && mon === "*" && dow !== "*") return { mode: "weekly", time, dayOfWeek: dow, dayOfMonth: "1", customString: cron }
  if (dom !== "*" && mon === "*" && dow === "*") return { mode: "monthly", time, dayOfWeek: "1", dayOfMonth: dom, customString: cron }
  return { mode: "custom", time: "08:00", dayOfWeek: "1", dayOfMonth: "1", customString: cron }
}

function generateCron(mode: string, time: string, dayOfWeek: string, dayOfMonth: string, customString?: string) {
  if (mode === "custom") return customString || ""
  const [h, m] = time.split(":").map(s => parseInt(s, 10).toString())
  if (mode === "daily") return `${m} ${h} * * *`
  if (mode === "weekly") return `${m} ${h} * * ${dayOfWeek}`
  if (mode === "monthly") return `${m} ${h} ${dayOfMonth} * *`
  return ""
}

const BASE = "/api/admin/scheduled-messages"

export default function ScheduledMessagesPage() {
  const { data: session, status } = useSession()
  const [canEdit, setCanEdit] = useState<boolean>(false)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.json()).then((d: any) => {
      const role: string = d.role ?? ""
      const tabs: string[] = d.writable_tabs ?? []
      setCanEdit(["admin", "creator"].includes(role) || tabs.includes("scheduled"))
    }).catch(() => {
      setCanEdit(["admin", "creator"].includes(session?.user?.role ?? ""))
    })
  }, [status, session?.user?.username])

  if (status !== "authenticated") return null
  return <ScheduledMessages canEdit={canEdit} />
}

function ScheduledMessages({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState<Partial<ScheduledMessage>>({})

  const [scheduleMode, setScheduleMode] = useState("daily")
  const [scheduleTime, setScheduleTime] = useState("08:00")
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState("1")
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState("1")
  const [customCron, setCustomCron] = useState("")

  useEffect(() => { fetchMessages() }, [])

  const fetchMessages = async () => {
    try {
      const res = await fetch(BASE)
      const data = await res.json()
      setMessages(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const cronToSave = scheduleMode === "custom" ? customCron : generateCron(scheduleMode, scheduleTime, scheduleDayOfWeek, scheduleDayOfMonth)
    if (!formData.name || !formData.prompt || !cronToSave) {
      toast.warning("Vui lòng nhập đủ Name, Prompt và lịch.")
      return
    }
    try {
      const url = isEditing ? `${BASE}/${isEditing}` : BASE
      const method = isEditing ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, cron_expression: cronToSave }),
      })
      if (res.ok) {
        setIsAdding(false); setIsEditing(null); setFormData({})
        fetchMessages()
        toast.success(isEditing ? "Đã cập nhật scheduled message." : "Đã tạo scheduled message.")
      } else {
        toast.error(`Lỗi: ${(await res.json()).error}`)
      }
    } catch (err) {
      console.error(err)
      toast.error("Không lưu được scheduled message.")
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Xoá scheduled message này?")) return
    try {
      const res = await fetch(`${BASE}/${id}`, { method: "DELETE" })
      if (res.ok) fetchMessages()
    } catch (err) {
      console.error(err)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch(`${BASE}/${id}`, { method: "POST" })
      const data = await res.json()
      if (res.ok) toast.success("Test thành công: " + (data.message || data.preview || "đã gửi"))
      else toast.error("Test thất bại: " + (data.error || "Unknown error"))
    } catch (err) {
      console.error(err)
      toast.error("Test lỗi.")
    } finally {
      setTestingId(null)
    }
  }

  const downloadBase64 = (base64: string, filename: string, mime: string) => {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: mime })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCreateWeeklyReport = async () => {
    setGeneratingReport(true)
    try {
      const res = await fetch(`${BASE}/weekly-report`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error("Tạo Weekly Report thất bại: " + (data.error || "Unknown error")); return }
      downloadBase64(data.docx, data.docxFilename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      toast.success("Đã tạo Weekly Report (.docx).")
    } catch (err) {
      console.error(err)
      toast.error("Tạo Weekly Report lỗi.")
    } finally {
      setGeneratingReport(false)
    }
  }

  const toggleActive = async (msg: ScheduledMessage) => {
    try {
      await fetch(`${BASE}/${msg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !msg.is_active }),
      })
      fetchMessages()
    } catch (err) {
      console.error(err)
    }
  }

  const startEditing = (msg: ScheduledMessage) => {
    setIsEditing(msg.id); setIsAdding(false); setFormData(msg)
    const parsed = parseCron(msg.cron_expression)
    setScheduleMode(parsed.mode); setScheduleTime(parsed.time)
    setScheduleDayOfWeek(parsed.dayOfWeek); setScheduleDayOfMonth(parsed.dayOfMonth)
    if (parsed.mode === "custom") setCustomCron(parsed.customString || "")
  }

  const startAdding = () => {
    setIsAdding(true); setIsEditing(null); setFormData({})
    setScheduleMode("daily"); setScheduleTime("08:00")
    setScheduleDayOfWeek("1"); setScheduleDayOfMonth("1"); setCustomCron("")
  }

  const cancel = () => { setIsAdding(false); setIsEditing(null); setFormData({}) }

  const renderForm = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800">{isEditing ? "Sửa Scheduled Message" : "Tạo Scheduled Message"}</h3>
        <button onClick={cancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Tên</label>
          <input type="text" placeholder="VD: Báo cáo doanh thu hằng ngày"
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="space-y-4">
          <label className="text-sm font-bold text-slate-700">Tần suất &amp; Giờ <span className="font-normal text-slate-400">(giờ VN)</span></label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
              value={scheduleMode} onChange={e => setScheduleMode(e.target.value)}>
              <option value="daily">Hằng ngày</option>
              <option value="weekly">Hằng tuần</option>
              <option value="monthly">Hằng tháng</option>
              <option value="custom">Custom (Cron)</option>
            </select>
            {scheduleMode !== "custom" && (
              <input type="time" className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
            )}
            {scheduleMode === "weekly" && (
              <select className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={scheduleDayOfWeek} onChange={e => setScheduleDayOfWeek(e.target.value)}>
                <option value="1">Thứ 2</option><option value="2">Thứ 3</option><option value="3">Thứ 4</option>
                <option value="4">Thứ 5</option><option value="5">Thứ 6</option><option value="6">Thứ 7</option><option value="0">Chủ nhật</option>
              </select>
            )}
            {scheduleMode === "monthly" && (
              <select className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={scheduleDayOfMonth} onChange={e => setScheduleDayOfMonth(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Ngày {d}</option>)}
              </select>
            )}
            {scheduleMode === "custom" && (
              <input type="text" placeholder="VD: 0 8 * * 1-5"
                className="w-full px-4 py-2 font-mono bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={customCron} onChange={e => setCustomCron(e.target.value)} />
            )}
          </div>
          {scheduleMode === "custom" && <p className="text-xs text-slate-500">Minute, Hour, Day of Month, Month, Day of Week (giờ Việt Nam)</p>}
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-bold text-slate-700">Lark Webhook URL</label>
          <div className="relative">
            <Globe2 className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.lark_webhook_url || ""} onChange={e => setFormData({ ...formData, lark_webhook_url: e.target.value })} />
          </div>
          <p className="text-xs text-slate-500">Để trống → gửi qua bot Lark mặc định của hệ thống.</p>
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-bold text-slate-700">Webhook Keyword (tuỳ chọn)</label>
          <input type="text" placeholder="VD: openthemagicgate"
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.lark_keyword || ""} onChange={e => setFormData({ ...formData, lark_keyword: e.target.value })} />
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-bold text-slate-700">AI Prompt</label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <textarea rows={10} placeholder="Hướng dẫn cho AI Analyst..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={formData.prompt || ""} onChange={e => setFormData({ ...formData, prompt: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button onClick={cancel} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">Huỷ</button>
        <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm">
          <Save className="w-4 h-4" />{isEditing ? "Cập nhật" : "Tạo lịch"}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Clock className="w-6 h-6 text-blue-600" />Scheduled Messages</h1>
          <p className="text-slate-500 mt-1">Cấu hình báo cáo AI tự động gửi lên Lark.</p>
        </div>
        {canEdit && !isAdding && !isEditing && (
          <div className="flex items-center gap-2">
            <button onClick={handleCreateWeeklyReport} disabled={generatingReport}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-xl font-bold text-sm hover:bg-blue-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {generatingReport
                ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <FileText className="w-4 h-4" />}
              {generatingReport ? "Đang tạo báo cáo..." : "Create Weekly Report"}
            </button>
            <button onClick={startAdding} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-sm">
              <Plus className="w-4 h-4" />Lịch mới
            </button>
          </div>
        )}
      </div>

      {(isAdding || isEditing) && renderForm()}

      {!isAdding && !isEditing && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4"><Calendar className="w-8 h-8" /></div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Chưa có lịch nào</h3>
              <p className="text-slate-500">Tạo báo cáo tự động đầu tiên để bắt đầu.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-4 w-32">Trạng thái</th>
                    <th className="p-4">Tên &amp; Lịch</th>
                    <th className="p-4 hidden md:table-cell w-1/4">Prompt</th>
                    <th className="p-4 hidden md:table-cell">Người tạo</th>
                    <th className="p-4 hidden lg:table-cell">Lần chạy cuối</th>
                    {canEdit && <th className="p-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {messages.map(msg => (
                    <tr key={msg.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        {canEdit ? (
                          <button onClick={() => toggleActive(msg)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${msg.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                            <Power className="w-3 h-3" />{msg.is_active ? "Active" : "Paused"}
                          </button>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${msg.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            <Power className="w-3 h-3" />{msg.is_active ? "Active" : "Paused"}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{msg.name}</div>
                        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 mt-1"><Clock className="w-3 h-3" />{msg.cron_expression}</div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="text-sm text-slate-600 line-clamp-2" title={msg.prompt}>{msg.prompt}</div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600"><User className="w-3.5 h-3.5 text-slate-400" />{msg.created_by || "—"}</div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <div className="text-sm text-slate-500">{msg.last_run_at ? new Date(msg.last_run_at).toLocaleString("vi-VN") : "Chưa chạy"}</div>
                      </td>
                      {canEdit && (
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleTest(msg.id)} disabled={testingId === msg.id}
                              className={`p-2 rounded-lg transition-colors ${testingId === msg.id ? "text-slate-400 bg-slate-50" : "text-emerald-600 hover:bg-emerald-50"}`} title="Test ngay">
                              {testingId === msg.id ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button onClick={() => startEditing(msg)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(msg.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Xoá"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
