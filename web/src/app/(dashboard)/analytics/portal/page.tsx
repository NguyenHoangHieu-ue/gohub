"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  ExternalLink, Link2, Plus, Trash2, UserPlus, Shield,
  RefreshCw, AlertTriangle, BarChart2, ShoppingBag, TrendingUp, DollarSign,
} from "lucide-react"
import { useToast } from "@/components/toast"

// ── Portals definition ──────────────────────────────────────────────────────
const PORTALS = [
  {
    id:   "commission",
    name: "Commission Analytics",
    desc: "Báo cáo hoa hồng affiliate theo sản phẩm, đơn hàng, thời gian.",
    url:  "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics",
  },
  {
    id:   "affiliate",
    name: "Affiliate Analytics",
    desc: "Tổng quan hiệu suất affiliate: clicks, conversions, revenue.",
    url:  "https://banhang.shopee.vn/portal/web-seller-affiliate/affiliate_analytics",
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtVND(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0)
  return Math.round(v).toLocaleString("vi-VN") + " ₫"
}
function fmtNum(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0)
  return Math.round(v).toLocaleString("vi-VN")
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Default: current month
function defaultRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start: isoDate(start), end: isoDate(now) }
}

interface MetricsData {
  affiliates:    number
  itemsSold:     number
  orderAmount:   number
  estCommission: number
}

interface PortalUser { username: string; name: string | null; email: string | null }

// ── Commission Metrics panel ─────────────────────────────────────────────────
function CommissionPanel() {
  const toast = useToast()
  const { start: defStart, end: defEnd } = defaultRange()
  const [startDate, setStartDate] = useState(defStart)
  const [endDate,   setEndDate]   = useState(defEnd)
  const [data,    setData]    = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!startDate || !endDate) return
    setLoading(true); setErr(null)
    try {
      const res  = await fetch(`/api/portal/shopee-data?type=commission_metrics&startDate=${startDate}&endDate=${endDate}`)
      const json = await res.json()
      if (!res.ok) {
        setErr(json.message || json.error || "Lỗi không xác định")
        return
      }
      setData(json.data)
    } catch {
      setErr("Không kết nối được server")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const kpis = data ? [
    { label: "Affiliates",          value: fmtNum(data.affiliates),    icon: UserPlus,    color: "text-violet-600",  bg: "bg-violet-50"  },
    { label: "Đơn hàng (items)",    value: fmtNum(data.itemsSold),     icon: ShoppingBag, color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "Doanh thu",           value: fmtVND(data.orderAmount),   icon: TrendingUp,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Est. Commission",     value: fmtVND(data.estCommission), icon: DollarSign,  color: "text-amber-600",   bg: "bg-amber-50"   },
  ] : []

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[15px]">Commission Analytics</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#003B95]" />
          <span className="text-slate-400 text-[13px]">→</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#003B95]" />
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[13px]">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="rounded-xl border border-slate-100 p-4 animate-pulse bg-slate-50 h-20" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`rounded-xl border border-slate-100 p-4 ${k.bg}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <k.icon size={13} className={k.color} />
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
              </div>
              <p className={`font-bold text-[15px] ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-400 text-[13px]">Chưa có dữ liệu.</p>
      )}
    </div>
  )
}

// ── Session update form (creator only) ──────────────────────────────────────
function SessionPanel() {
  const toast = useToast()
  const [status,   setStatus]   = useState<{ configured: boolean; updated_at?: string; cookie_prefix?: string } | null>(null)
  const [open,     setOpen]     = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form, setForm] = useState({ cookie: "", af_ac_enc_dat: "", af_ac_enc_sz_token: "", x_sap_ri: "", x_sap_sec: "" })

  useEffect(() => {
    fetch("/api/admin/portal-session")
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cookie.trim()) { toast.warning("Paste cookie vào trước"); return }
    setSaving(true)
    try {
      const res  = await fetch("/api/admin/portal-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Đã lưu session")
      setOpen(false)
      setForm({ cookie: "", af_ac_enc_dat: "", af_ac_enc_sz_token: "", x_sap_ri: "", x_sap_sec: "" })
      setStatus({ configured: true, updated_at: new Date().toISOString(), cookie_prefix: form.cookie.slice(0, 40) + "..." })
    } catch (err: any) {
      toast.error(err.message || "Lỗi lưu session")
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof typeof form, label: string, hint: string) => (
    <div key={key}>
      <label className="text-[12px] font-medium text-slate-600 block mb-1">{label}</label>
      <p className="text-[11px] text-slate-400 mb-1">{hint}</p>
      <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        rows={key === "cookie" || key === "x_sap_sec" ? 3 : 1}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono focus:outline-none focus:border-[#003B95] resize-none" />
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[#003B95]" />
          <h2 className="font-semibold text-slate-700 text-[15px]">Session Shopee</h2>
        </div>
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} />
          Cập nhật session
        </button>
      </div>

      {status?.configured ? (
        <div className="text-[13px] text-slate-600">
          <p>Trạng thái: <span className="text-emerald-600 font-medium">Đã cấu hình</span></p>
          {status.updated_at && <p className="text-slate-400 text-[12px] mt-0.5">Cập nhật lúc: {new Date(status.updated_at).toLocaleString("vi-VN")}</p>}
          {status.cookie_prefix && <p className="text-slate-400 text-[11px] mt-0.5 font-mono">{status.cookie_prefix}</p>}
        </div>
      ) : (
        <p className="text-amber-600 text-[13px]">Chưa có session. Nhấn "Cập nhật session" để thêm.</p>
      )}

      {open && (
        <form onSubmit={handleSave} className="space-y-3 pt-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-500">
            Lấy từ DevTools → Network → click request <code className="bg-slate-100 px-1 rounded">gql?q=QueryCommissionKeyMetrics</code> → Headers
          </p>
          {field("cookie",              "cookie (bắt buộc)",          "Toàn bộ dòng cookie: từ Request Headers")}
          {field("af_ac_enc_dat",       "af-ac-enc-dat",              "Ví dụ: 084473f1ce9a3c31")}
          {field("af_ac_enc_sz_token",  "af-ac-enc-sz-token",         "Token dài, dạng base64|...")}
          {field("x_sap_ri",            "x-sap-ri",                   "Hex string ngắn")}
          {field("x_sap_sec",           "x-sap-sec (quan trọng)",     "Token rất dài — cần thiết để Shopee không block")}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.cookie.trim()}
              className="flex-1 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors">
              {saving ? "Đang lưu..." : "Lưu session"}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 transition-colors">
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Access management ────────────────────────────────────────────────────────
function AccessPanel() {
  const toast = useToast()
  const [users,    setUsers]    = useState<PortalUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [addInput, setAddInput] = useState("")
  const [adding,   setAdding]   = useState(false)

  useEffect(() => {
    fetch("/api/admin/portal-users")
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addInput.trim()) return
    setAdding(true)
    try {
      const res  = await fetch("/api/admin/portal-users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: addInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setUsers(prev => prev.some(u => u.username === json.user.username) ? prev : [...prev, json.user])
      setAddInput("")
      toast.success(`Đã cấp quyền cho ${json.user.name || json.user.username}`)
    } catch (err: any) { toast.error(err.message || "Hiếu đang fix, vui lòng đợi") }
    finally { setAdding(false) }
  }

  async function handleRemove(username: string) {
    try {
      const res = await fetch(`/api/admin/portal-users?username=${encodeURIComponent(username)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setUsers(prev => prev.filter(u => u.username !== username))
      toast.success("Đã thu hồi quyền")
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[15px]">Quyền truy cập Portal</h2>
      </div>
      <p className="text-slate-400 text-[12px]">User được thêm vào đây có thể xem Portal tab trong sidebar.</p>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={addInput} onChange={e => setAddInput(e.target.value)}
          placeholder="Username (vd: hieunh862)"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]" />
        <button type="submit" disabled={adding || !addInput.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          <Plus size={14} />{adding ? "..." : "Thêm"}
        </button>
      </form>
      {loading ? (
        <p className="text-slate-400 text-[13px]">Đang tải...</p>
      ) : users.length === 0 ? (
        <p className="text-slate-400 text-[13px]">Chưa có user nào (ngoài creator).</p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.username} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div>
                <p className="text-[13px] font-medium text-slate-700">{u.name || u.username}</p>
                <p className="text-[11px] text-slate-400">{u.username}{u.email ? ` · ${u.email}` : ""}</p>
              </div>
              <button onClick={() => handleRemove(u.username)}
                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PortalPage() {
  const { data: session } = useSession()
  const role      = (session?.user as any)?.role ?? session?.user?.role ?? ""
  const isCreator = role === "creator"

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#003B95]/10 flex items-center justify-center">
          <Link2 size={20} className="text-[#003B95]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Portal Access</h1>
          <p className="text-slate-500 text-[13px]">Dữ liệu affiliate từ Shopee Seller Portal</p>
        </div>
      </div>

      {/* Commission data */}
      <CommissionPanel />

      {/* Portal links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PORTALS.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-2">
                Shopee Affiliate
              </span>
              <h3 className="font-semibold text-slate-800 text-[15px]">{p.name}</h3>
              <p className="text-slate-500 text-[13px] mt-1">{p.desc}</p>
            </div>
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors">
              <ExternalLink size={14} />
              Mở Portal
            </a>
          </div>
        ))}
      </div>

      {/* Creator-only: Session + Access management */}
      {isCreator && (
        <>
          <SessionPanel />
          <AccessPanel />
        </>
      )}
    </div>
  )
}
