"use client"

import React, { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { UserGrantsMatrix } from "@/components/user-grants-matrix"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Save, RefreshCw, Eye, EyeOff, Shield, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_ROLES, ROLE_LABELS } from "@/lib/agents/types"
import KbDocsSection from "./kb-docs-section"
import AssistantFeaturesSection from "./assistant-features-section"
import DevTicketsSection from "./dev-tickets-section"

// Tất cả tab/route có thể ẩn
const ALL_TABS = [
  { id: "chatbot",         label: "Bé Gấu (Chatbot)" },
  { id: "to-gau",          label: "Tổ Gấu (Chat + Tài liệu)" },
  { id: "promotions",      label: "Promotions" },
  { id: "skus",            label: "System SKUs" },
  { id: "ncc",             label: "NCC Catalog" },
  { id: "countries",       label: "Reference" },
  { id: "dashboard",       label: "Analytics Dashboard" },
  { id: "quarterly",       label: "Quarter Report" },
  { id: "bod",             label: "BOD Report" },
  { id: "all-time",        label: "All-Time" },
  { id: "channels",        label: "Channels" },
  { id: "b2b",             label: "B2B" },
  { id: "b2c",             label: "B2C" },
  { id: "website",         label: "Website Analytics" },
  { id: "staff",           label: "Staff" },
  { id: "customers",       label: "Customers" },
  { id: "vendors",         label: "Vendors" },
  { id: "orders",          label: "Orders" },
  { id: "fulfillment",     label: "Inventory" },
  { id: "3hk-usage",       label: "3HK Usage" },
  { id: "cs-troubleshoot", label: "CS Troubleshoot" },
  { id: "products",        label: "Products (BI)" },
  { id: "targets",         label: "KPI / Targets" },
  { id: "scheduled",       label: "Scheduled Messages" },
  { id: "admin",           label: "Admin (Product)" },
  { id: "api-database",    label: "Dữ liệu & API (Devtools)" },
]

// Tab mặc định ẨN cho tất cả role (default-deny) — creator phải bật để cấp quyền
const DEFAULT_HIDDEN_TABS = ["api-database"]

const ROLES_TO_MANAGE = ALL_ROLES.filter(r => r !== "creator") // creator không bị ẩn tab của chính mình

export default function CreatorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [freshRole, setFreshRole] = useState<string | null>(null)

  // Fetch role mới nhất từ DB — JWT có thể cũ nếu admin vừa đổi role
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setFreshRole(d?.role ?? session?.user?.role ?? "staff")
    }).catch(() => setFreshRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (freshRole && !["creator", "admin"].includes(freshRole)) router.push("/chatbot")
  }, [freshRole, router])

  if (status !== "authenticated" || !freshRole || !["creator", "admin"].includes(freshRole)) return null
  return <CreatorSettings />
}

// Usage Analytics (trước là mục menu riêng, 1 lượt/60 ngày) nay nằm ở tab "Nhật ký và sử dụng".
const UsageSection = dynamic(() => import("./usage/page"), { loading: () => <div className="py-8 text-center text-sm text-slate-400">Đang tải…</div> })

function CreatorSettings() {
  const [visibility, setVisibility] = useState<Record<string, string[]>>({})
  const [savedSnap, setSavedSnap] = useState("")   // snapshot đã lưu → nút Lưu chỉ sáng khi khác snapshot
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [creatorInfo, setCreatorInfo] = useState<{ creatorCount: number; canAssignCreator: boolean } | null>(null)

  const dirty = JSON.stringify(visibility) !== savedSnap
  const [previewRole, setPreviewRole] = useState<string | null>(null)
  // 6 tab thay cho 1 trang dài: mỗi tab 1 việc (s238).
  type CsTab = "grants" | "assistant" | "visibility" | "docs" | "log"
  const [tab, setTab] = useState<CsTab>("grants")

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const allHiddenForRole = (role: string) => ALL_TABS.every(tab => isHidden(role, tab.id))
  const toggleAllForRole = (role: string) => {
    setVisibility(prev => ({
      ...prev,
      [role]: allHiddenForRole(role) ? [] : ALL_TABS.map(t => t.id),
    }))
  }

  const allHiddenForTab = (tabId: string) => ROLES_TO_MANAGE.every(role => isHidden(role, tabId))
  const toggleAllForTab = (tabId: string) => {
    const shouldHide = !allHiddenForTab(tabId)
    setVisibility(prev => {
      const next = { ...prev }
      for (const role of ROLES_TO_MANAGE) {
        const hidden = new Set(next[role] || [])
        shouldHide ? hidden.add(tabId) : hidden.delete(tabId)
        next[role] = Array.from(hidden)
      }
      return next
    })
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/config/tab-visibility").then(r => r.ok ? r.json() : {}),
      fetch("/api/config/creator-status").then(r => r.ok ? r.json() : null),
    ]).then(([vis, cs]) => {
      const raw = vis || {} as Record<string, string[]>
      // Nếu config chưa từng được save (trống hoàn toàn), khởi tạo DEFAULT_HIDDEN_TABS cho mọi role
      const isFirstTime = Object.keys(raw).length === 0
      const loaded: Record<string, string[]> = { ...raw }
      if (isFirstTime) {
        for (const role of ROLES_TO_MANAGE) {
          loaded[role] = [...DEFAULT_HIDDEN_TABS]
        }
      }
      setVisibility(loaded)
      setSavedSnap(JSON.stringify(loaded))
      setCreatorInfo(cs)
    }).finally(() => setLoading(false))
  }, [])

  const toggleTab = (role: string, tabId: string) => {
    setVisibility(prev => {
      const hidden = new Set(prev[role] || [])
      hidden.has(tabId) ? hidden.delete(tabId) : hidden.add(tabId)
      return { ...prev, [role]: Array.from(hidden) }
    })
  }

  const isHidden = (role: string, tabId: string) => (visibility[role] || []).includes(tabId)

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch("/api/config/tab-visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visibility) })
      if (r.ok) setSavedSnap(JSON.stringify(visibility))
      notify(r.ok, r.ok ? "Đã lưu cấu hình ẩn tab" : "Lưu thất bại")
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Creator Settings</h1>
            <p className="text-slate-500 text-sm">Quyền hạn cao nhất: cấp quyền, cấu hình trợ lý, ẩn/hiện tab, tài liệu</p>
          </div>
        </div>
        {tab === "visibility" && (
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu thay đổi
        </button>
        )}
      </div>

      {msg && <div className={cn("px-4 py-3 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-rose-50 border border-rose-100 text-rose-700")}>{msg.text}</div>}

      {creatorInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>Creator status:</strong> {creatorInfo.creatorCount}/2 tài khoản creator đang hoạt động.
            {creatorInfo.creatorCount >= 2 && " Đã đạt giới hạn tối đa."}
            {" "}Admin không thể gán role creator{creatorInfo.creatorCount > 0 ? " (đã có creator)" : " khi chưa có creator nào"}.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
        {([["grants", "Quyền theo người"], ["assistant", "Bé Gấu và Gấu Pro"], ["visibility", "Hiển thị tab"], ["docs", "Tài liệu và Wiki"], ["log", "Nhật ký và sử dụng"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", tab === id ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "visibility" && (loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-bold text-slate-800">Ma trận ẩn Tab</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click ô để ẩn tab đó với role. Creator luôn thấy tất cả dù có ẩn hay không.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48">Tab</th>
                  {ROLES_TO_MANAGE.map(r => (
                    <th key={r} className="px-3 py-2.5 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => setPreviewRole(r)} className="hover:text-sky-600 hover:underline transition-colors" title="Xem trước role này thấy gì">
                          {ROLE_LABELS[r] ?? r}
                        </button>
                        <button onClick={() => toggleAllForRole(r)}
                          className={cn("w-5 h-5 rounded inline-flex items-center justify-center transition-all border", allHiddenForRole(r) ? "bg-rose-100 border-rose-200 text-rose-500" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}
                          title={allHiddenForRole(r) ? "Hiện tất cả tab cho role này" : "Ẩn tất cả tab cho role này"}>
                          {allHiddenForRole(r) ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ALL_TABS.map(tab => (
                  <tr key={tab.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2 text-xs font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleAllForTab(tab.id)}
                          className={cn("w-5 h-5 rounded inline-flex items-center justify-center shrink-0 transition-all border", allHiddenForTab(tab.id) ? "bg-rose-100 border-rose-200 text-rose-500" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}
                          title={allHiddenForTab(tab.id) ? "Hiện tab này cho tất cả role" : "Ẩn tab này cho tất cả role"}>
                          {allHiddenForTab(tab.id) ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </button>
                        {tab.label}
                      </div>
                    </td>
                    {ROLES_TO_MANAGE.map(role => {
                      const hidden = isHidden(role, tab.id)
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          <button onClick={() => toggleTab(role, tab.id)} className={cn("w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all border", hidden ? "bg-rose-100 border-rose-200 text-rose-500 hover:bg-rose-200" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}>
                            {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-rose-500"><EyeOff className="w-3 h-3" />Đỏ = ẩn với role đó</span>
            <span>Trắng = hiển thị bình thường</span>
            <span className="text-amber-600 font-medium">⚠️ "Dữ liệu & API" ẩn theo mặc định — bật để cấp quyền cho role tương ứng</span>
          </p>
        </div>
      ))}

      {tab === "assistant" && <><AssistantFeaturesSection /><DevTicketsSection /></>}

      {tab === "grants" && <UserGrantsMatrix onNotify={notify} />}

      {/* Audit Log */}
      {tab === "log" && <><AuditLogSection /><UsageSection /></>}

      {/* Cà Thread */}

      {/* Upload tài liệu → AI đề xuất Wiki chính thức (gán nhóm trong Tổ Gấu) */}
      {tab === "docs" && <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-bold text-slate-800 mb-4">Tài liệu chính thức — Upload & AI đề xuất Wiki</h2>
        <KbDocsSection />
      </div>}

      {/* Preview modal — xem trước role này thấy gì */}
      {previewRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreviewRole(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Xem trước: {ROLE_LABELS[previewRole] ?? previewRole}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Tab role này thấy được (creator thấy tất cả)</p>
              </div>
              <button onClick={() => setPreviewRole(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {(() => {
                const visible = ALL_TABS.filter(tab => !isHidden(previewRole, tab.id))
                return visible.length === 0
                  ? <div className="text-center py-6 text-sm text-slate-400">Role này không thấy tab nào</div>
                  : <div className="space-y-1">{visible.map(tab => (
                      <div key={tab.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-700 bg-slate-50">
                        <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {tab.label}
                      </div>
                    ))}</div>
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TARGET_LABEL: Record<string, string> = { gp_access: "Gấu Pro", my_metrics_access: "My Metrics", market_access: "Thị trường & Báo giá" }

function AuditLogSection() {
  const [logs, setLogs]       = useState<any[] | null>(null)
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/creator/access-audit-log?limit=30")
      const d = await r.json()
      setLogs(d.logs ?? [])
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }

  const toggle = () => { const next = !show; setShow(next); if (next && logs === null) load() }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={toggle} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-500 rounded-xl flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <h2 className="font-bold text-slate-800 text-sm">Audit Log — Cấp / Thu hồi quyền</h2>
            <p className="text-xs text-slate-400">30 thao tác gần nhất (Gấu Pro + My Metrics)</p>
          </div>
        </div>
        {show ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {show && (
        <div className="border-t border-slate-100 p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Đang tải…
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">Chưa có thao tác nào được ghi lại (cần chạy migration v41).</div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-xs flex-wrap">
                  <span className={cn("px-1.5 py-0.5 rounded font-medium shrink-0", log.action === "add" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600")}>
                    {log.action === "add" ? "Cấp" : "Thu hồi"}
                  </span>
                  <span className="text-slate-400 shrink-0">{TARGET_LABEL[log.target_type] ?? log.target_type}</span>
                  <span className="font-medium text-slate-800">@{log.target_username}</span>
                  <span className="text-slate-400">bởi @{log.performed_by}</span>
                  <span className="ml-auto text-slate-300 shrink-0">
                    {new Date(log.performed_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
