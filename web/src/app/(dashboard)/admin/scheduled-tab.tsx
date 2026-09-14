"use client"

import { useEffect, useState } from "react"
import { Plus, Save, Clock, RefreshCw, Play, Pencil, Trash2, Users } from "lucide-react"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

interface ScheduledMessage {
  id: string; name: string; prompt: string; cron_expression: string
  lark_webhook_url?: string; lark_keyword?: string
  is_active: boolean; last_run_at?: string; created_at: string; created_by?: string
}

function parseCron(cron: string) {
  if (!cron) return { mode: "daily", time: "08:00", dow: "1", dom: "1", custom: "" }
  const parts = cron.split(" ")
  if (parts.length !== 5) return { mode: "custom", time: "08:00", dow: "1", dom: "1", custom: cron }
  const [m, h, dom, , dow] = parts
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
  if (dom === "*" && dow === "*") return { mode: "daily", time, dow: "1", dom: "1", custom: cron }
  if (dom === "*" && dow !== "*") return { mode: "weekly", time, dow, dom: "1", custom: cron }
  if (dom !== "*" && dow === "*") return { mode: "monthly", time, dow: "1", dom, custom: cron }
  return { mode: "custom", time: "08:00", dow: "1", dom: "1", custom: cron }
}

function buildCron(mode: string, time: string, dow: string, dom: string, custom: string) {
  if (mode === "custom") return custom
  const [h, m] = time.split(":").map(s => parseInt(s, 10).toString())
  if (mode === "daily")   return `${m} ${h} * * *`
  if (mode === "weekly")  return `${m} ${h} * * ${dow}`
  if (mode === "monthly") return `${m} ${h} ${dom} * *`
  return ""
}

export default function ScheduledTab({ onNotify }: { onNotify: (t: "success" | "error", m: string) => void }) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState<Partial<ScheduledMessage>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [schedMode, setSchedMode] = useState("daily")
  const [schedTime, setSchedTime] = useState("08:00")
  const [schedDow,  setSchedDow]  = useState("1")
  const [schedDom,  setSchedDom]  = useState("1")
  const [customCron, setCustomCron] = useState("")

  const fetchMessages = async () => {
    const res = await fetch("/api/admin/scheduled-messages")
    if (res.ok) setMessages(await res.json())
    setLoading(false)
  }
  useEffect(() => { fetchMessages() }, [])

  const openAdd = () => {
    setForm({}); setEditId(null)
    setSchedMode("daily"); setSchedTime("08:00"); setSchedDow("1"); setSchedDom("1"); setCustomCron("")
    setShowForm(true)
  }

  const openEdit = (msg: ScheduledMessage) => {
    setForm(msg); setEditId(msg.id)
    const p = parseCron(msg.cron_expression)
    setSchedMode(p.mode); setSchedTime(p.time); setSchedDow(p.dow); setSchedDom(p.dom); setCustomCron(p.custom)
    setShowForm(true)
  }

  const save = async () => {
    const cron = buildCron(schedMode, schedTime, schedDow, schedDom, customCron)
    if (!form.name?.trim() || !form.prompt?.trim() || !cron) {
      onNotify("error", "Tên, prompt và lịch là bắt buộc"); return
    }
    const url    = editId ? `/api/admin/scheduled-messages/${editId}` : "/api/admin/scheduled-messages"
    const method = editId ? "PUT" : "POST"
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cron_expression: cron }),
    })
    if (res.ok) {
      onNotify("success", editId ? "Đã cập nhật" : "Đã tạo lịch mới")
      setShowForm(false); fetchMessages()
    } else {
      onNotify("error", (await res.json()).error || "Hiếu đang fix, vui lòng đợi")
    }
  }

  const toggle = async (msg: ScheduledMessage) => {
    await fetch(`/api/admin/scheduled-messages/${msg.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !msg.is_active }),
    })
    fetchMessages()
  }

  const doDelete = async () => {
    if (!confirmDelId) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/scheduled-messages/${confirmDelId}`, { method: "DELETE" })
      onNotify("success", "Đã xóa"); fetchMessages()
    } finally {
      setDeleting(false); setConfirmDelId(null)
    }
  }

  const testRun = async (msg: ScheduledMessage) => {
    setTestingId(msg.id)
    const res = await fetch(`/api/admin/scheduled-messages/${msg.id}`, { method: "POST" })
    const d = await res.json()
    setTestingId(null)
    if (res.ok) onNotify("success", `Đã gửi test! Preview: ${d.preview}`)
    else onNotify("error", d.error || "Gửi thất bại")
    fetchMessages()
  }

  const DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-100">Lịch gửi Lark tự động</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gemini tạo nội dung → gửi Lark theo lịch cron (UTC)</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus size={14} /> Thêm lịch
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-brand-200 rounded-xl p-5 space-y-4">
          <h4 className="font-semibold text-sm text-gray-800 dark:text-slate-100">{editId ? "Sửa lịch" : "Thêm lịch mới"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-300 block mb-1">Tên lịch *</label>
              <input type="text" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Báo cáo doanh thu thứ Hai"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-300 block mb-1">Prompt Gemini *</label>
              <textarea rows={3} value={form.prompt || ""} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="VD: Tóm tắt hiệu suất kinh doanh tuần này trong 3 câu ngắn bằng tiếng Việt"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-300 block mb-1">Lịch gửi (UTC)</label>
              <div className="flex gap-2 flex-wrap">
                {["daily","weekly","monthly","custom"].map(m => (
                  <button key={m} onClick={() => setSchedMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      schedMode === m ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                    }`}>
                    {m === "daily" ? "Hàng ngày" : m === "weekly" ? "Hàng tuần" : m === "monthly" ? "Hàng tháng" : "Custom cron"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                {schedMode !== "custom" && (
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Giờ gửi</label>
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none" />
                  </div>
                )}
                {schedMode === "weekly" && (
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Thứ</label>
                    <select value={schedDow} onChange={e => setSchedDow(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none">
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {schedMode === "monthly" && (
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Ngày</label>
                    <input type="number" min={1} max={28} value={schedDom} onChange={e => setSchedDom(e.target.value)}
                      className="w-16 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none" />
                  </div>
                )}
                {schedMode === "custom" && (
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Cron expression (UTC)</label>
                    <input type="text" value={customCron} onChange={e => setCustomCron(e.target.value)}
                      placeholder="0 9 * * 1"
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none font-mono" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-300 mt-1 font-mono">
                Cron: {buildCron(schedMode, schedTime, schedDow, schedDom, customCron) || "—"}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-slate-300 block mb-1">Lark Webhook URL (optional)</label>
              <input type="text" value={form.lark_webhook_url || ""} onChange={e => setForm(f => ({ ...f, lark_webhook_url: e.target.value }))}
                placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
                className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-slate-300 block mb-1">Keyword prefix (optional)</label>
              <input type="text" value={form.lark_keyword || ""} onChange={e => setForm(f => ({ ...f, lark_keyword: e.target.value }))}
                placeholder="VD: 📊 Báo cáo:"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
            <button onClick={save}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Save size={14} className="inline mr-1.5" />{editId ? "Cập nhật" : "Lưu lịch"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {messages.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          Chưa có lịch gửi nào
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            <div key={msg.id} className={`bg-white border rounded-xl p-4 transition-all ${msg.is_active ? "border-gray-200 dark:border-slate-700" : "border-dashed border-gray-200 dark:border-slate-700 opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${msg.is_active ? "bg-emerald-400" : "bg-gray-300"}`} />
                    <span className="font-semibold text-sm text-gray-800 dark:text-slate-100 truncate">{msg.name}</span>
                    <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 dark:border-slate-700 shrink-0">
                      {msg.cron_expression}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 truncate pl-4">{msg.prompt.slice(0, 100)}{msg.prompt.length > 100 ? "..." : ""}</p>
                  <p className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 pl-4">
                    {msg.created_by && <span className="flex items-center gap-1"><Users size={10} />{msg.created_by}</span>}
                    {msg.last_run_at && <span>· Lần cuối: {new Date(msg.last_run_at).toLocaleString("vi-VN")}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => testRun(msg)} disabled={testingId === msg.id} title="Gửi test ngay"
                    className="p-1.5 text-brand-500 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50">
                    {testingId === msg.id ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                  <button onClick={() => toggle(msg)} title={msg.is_active ? "Tắt" : "Bật"}
                    className={`p-1.5 rounded-lg transition-colors ${msg.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50"}`}>
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={() => openEdit(msg)} title="Sửa"
                    className="p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmDelId(msg.id)} title="Xóa"
                    className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm xóa lịch (thay confirm() native — đồng bộ pattern modal của app) */}
      {confirmDelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-overlay-in" onClick={() => !deleting && setConfirmDelId(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-[340px] p-5 animate-modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><Trash2 className="w-4 h-4 text-rose-500" /></div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Xóa lịch gửi?</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Bạn chắc chắn muốn xóa lịch gửi tin nhắn này? Thao tác không thể hoàn tác.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelId(null)} disabled={deleting} className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
              <button onClick={doDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
