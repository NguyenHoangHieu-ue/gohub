"use client"

import React, { useState, useEffect } from "react"
import { Settings as SettingsIcon, Shield, Save, RefreshCw, Plus, X, Filter, Sliders, ChevronDown, Database, MapPin, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { CONFIGURABLE_ROLES, ROLE_LABELS } from "@/lib/agents/types"
import { useRoleGuard } from "@/lib/use-role-guard"

// Cấu hình Analytics — UI theo style intel Settings, backend web (app_settings).
// 3 mục: Partner Tiers (đối tác chiến lược) · Access Policy (Guardian) · Role Filters (lọc dòng BI theo role).

const CATEGORIES: { id: string; label: string }[] = [
  { id: "product_catalog", label: "Sản phẩm / Catalog" },
  { id: "revenue_bi", label: "Doanh thu / BI" },
  { id: "margin_cogs", label: "Giá vốn / Margin" },
  { id: "staff_hr", label: "Nhân sự (HR)" },
  { id: "customer_pii", label: "Thông tin khách hàng" },
  { id: "internal_kb_other_dept", label: "Tài liệu phòng ban" },
  { id: "system_internal", label: "Nội bộ hệ thống" },
  { id: "general", label: "Chung / Chào hỏi" },
]
const POLICY_ROLES = CONFIGURABLE_ROLES
type Decision = "allow" | "deny" | "dept"
const NEXT_DECISION: Record<Decision, Decision> = { allow: "deny", deny: "dept", dept: "allow" }
const DECISION_STYLE: Record<Decision, string> = {
  allow: "bg-emerald-100 text-emerald-700", deny: "bg-rose-100 text-rose-700", dept: "bg-amber-100 text-amber-700",
}
const DECISION_LABEL: Record<Decision, string> = { allow: "Cho phép", deny: "Từ chối", dept: "Theo phòng ban" }
const DEFAULT_POLICY: Record<string, Record<string, Decision>> = {
  product_catalog: { bod: "allow", staff: "allow" }, revenue_bi: { bod: "allow", staff: "allow" },
  margin_cogs: { bod: "allow", staff: "deny" }, staff_hr: { bod: "allow", staff: "deny" },
  customer_pii: { bod: "allow", staff: "deny" }, internal_kb_other_dept: { bod: "allow", staff: "dept" },
  system_internal: { bod: "deny", staff: "deny" }, general: { bod: "allow", staff: "allow" },
}
// Điền mặc định cho các role phòng/nhân viên = giống "staff" (hr ngoại lệ: staff_hr = allow). Khớp guardian.ts.
const DEPT_ROLES = ["b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"]
for (const cat of Object.keys(DEFAULT_POLICY)) {
  const base = DEFAULT_POLICY[cat].staff
  for (const r of DEPT_ROLES) DEFAULT_POLICY[cat][r] = base
  if (cat === "staff_hr") DEFAULT_POLICY[cat].hr = "allow"
}
const FILTER_ROLES = CONFIGURABLE_ROLES

export default function SettingsPage() {
  const { ready } = useRoleGuard(["admin", "creator"])   // role tươi từ DB (không dùng JWT stale)
  if (!ready) return null
  return <AnalyticsSettings />
}

function AnalyticsSettings() {
  const [tiers, setTiers] = useState<Record<string, string[]>>({ Strategic: [] })
  const [policy, setPolicy] = useState<Record<string, Record<string, Decision>>>({})
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savedTiers,   setSavedTiers]   = useState<string>("{}")
  const [savedPolicy,  setSavedPolicy]  = useState<string>("{}")
  const [savedFilters, setSavedFilters] = useState<string>("{}")
  const [customRules, setCustomRules]   = useState<string>("")
  const [savedCustomRules, setSavedCustomRules] = useState<string>("")
  const dirtyTiers       = JSON.stringify(tiers)   !== savedTiers
  const dirtyPolicy      = JSON.stringify(policy)  !== savedPolicy
  const dirtyFilters     = JSON.stringify(filters) !== savedFilters
  const dirtyCustomRules = customRules !== savedCustomRules
  const [availablePartners, setAvailablePartners] = useState<string[]>([])
  const [newTier, setNewTier] = useState("")
  const [addInputs, setAddInputs] = useState<Record<string, string>>({})
  const [db, setDb] = useState<any>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [flushing, setFlushing] = useState(false)
  const [skuRules, setSkuRules] = useState<{ startsWith: string; codeLength: number; description: string }[]>([])
  const [savedSkuRules, setSavedSkuRules] = useState<string>("[]")
  const dirtySkuRules = JSON.stringify(skuRules) !== savedSkuRules
  const [countryCodes, setCountryCodes] = useState<{ code: string; country: string }[]>([])
  const [itemChannelTypes, setItemChannelTypes] = useState<Record<string, string[]>>({ B2C: ["B2C", "ECO"], B2B: ["OD", "WS", "Strategic", "TIER", "SILVER", "DEAL", "B2B"] })
  const [savedItemChannelTypes, setSavedItemChannelTypes] = useState<string>("{}")
  const [allItemTypes, setAllItemTypes] = useState<string[]>([])
  const dirtyItemChannelTypes = JSON.stringify(itemChannelTypes) !== savedItemChannelTypes
  const [newChannelPrefix, setNewChannelPrefix] = useState<Record<string, string>>({})

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const syncTursoCosts = async () => {
    setSyncing(true)
    try {
      const r = await fetch("/api/admin/sync-turso-costs", { method: "POST" })
      const d = await r.json()
      notify(!!d.ok, d.ok ? ("Sync OK: " + d.synced + " dong (" + d.months + " thang)") : (d.error || "Sync that bai"))
    } catch (e) { notify(false, "Loi ket noi") } finally { setSyncing(false) }
  }

  const flushCache = async () => {
    setFlushing(true)
    try {
      const r = await fetch("/api/admin/flush-analytics-cache", { method: "POST" })
      const d = await r.json()
      notify(!!d.ok, d.ok ? `Đã xoá ${d.deleted} cache entries — lần tải tiếp sẽ lấy dữ liệu mới` : "Xoá cache thất bại")
    } catch { notify(false, "Lỗi kết nối") } finally { setFlushing(false) }
  }

  const checkDb = async () => {
    setDbLoading(true)
    try {
      const r = await fetch("/api/analytics/db-status")
      setDb(r.ok ? await r.json() : { error: "Không tải được tình trạng database" })
    } catch { setDb({ error: "Lỗi kết nối" }) } finally { setDbLoading(false) }
  }
  const fmtTime = (s?: string | null) => s ? new Date(s).toLocaleString("vi-VN") : "—"

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [t, p, f, ch, skuRule, cc, ict, crRes] = await Promise.all([
        fetch("/api/config/partner-tiers").then(r => r.ok ? r.json() : {}),
        fetch("/api/config/access-policy").then(r => r.ok ? r.json() : {}),
        fetch("/api/config/role-filters").then(r => r.ok ? r.json() : {}),
        fetch("/api/channels?channelGroup=B2B").then(r => r.ok ? r.json() : []),
        fetch("/api/config/sku-destination-rule").then(r => r.ok ? r.json() : { rules: [] }).catch(() => ({ rules: [] })),
        fetch("/api/config/country-codes").then(r => r.ok ? r.json() : []),
        fetch("/api/config/item-channel-types").then(r => r.ok ? r.json() : { config: {}, allTypes: [] }).catch(() => ({ config: {}, allTypes: [] })),
        fetch("/api/config/chatbot-rules").then(r => r.ok ? r.json() : { rules: "" }).catch(() => ({ rules: "" })),
      ])
      const parsedSkuRules = skuRule?.rules || []
      setSkuRules(parsedSkuRules)
      setSavedSkuRules(JSON.stringify(parsedSkuRules))
      setCountryCodes(Array.isArray(cc) ? cc : [])
      const parsedIct = ict?.config || {}
      setItemChannelTypes(parsedIct)
      setSavedItemChannelTypes(JSON.stringify(parsedIct))
      setAllItemTypes(Array.isArray(ict?.allTypes) ? ict.allTypes : [])
      const parsedTiers = t && Object.keys(t).length ? t : { Strategic: [] }
      const parsedPolicy = p || {}
      const parsedFilters = f || {}
      setTiers(parsedTiers)
      setPolicy(parsedPolicy)
      setFilters(parsedFilters)
      setSavedTiers(JSON.stringify(parsedTiers))
      setSavedPolicy(JSON.stringify(parsedPolicy))
      setSavedFilters(JSON.stringify(parsedFilters))
      setAvailablePartners(Array.isArray(ch) ? ch.filter((c: any) => typeof c === "string") : [])
      const cr = crRes?.rules ?? ""
      setCustomRules(cr); setSavedCustomRules(cr)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [])

  const getDecision = (cat: string, role: string): Decision => (policy[cat]?.[role] ?? DEFAULT_POLICY[cat]?.[role] ?? "allow") as Decision

  const savePost = async (key: string, url: string, body: any) => {
    setSaving(key)
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) {
        // Reset dirty state sau khi lưu
        if (key === "tiers")         setSavedTiers(JSON.stringify(body))
        if (key === "policy")        setSavedPolicy(JSON.stringify(body))
        if (key === "filters")       setSavedFilters(JSON.stringify(body))
        if (key === "sku-dest")      setSavedSkuRules(JSON.stringify(body.rules ?? body))
        if (key === "item-channel")  setSavedItemChannelTypes(JSON.stringify(body))
      }
      notify(res.ok, res.ok ? "Đã lưu" : "Lưu thất bại")
    } finally {
      setSaving(null)
    }
  }

  const addPartner = (tier: string, v: string) => {
    const val = v.trim()
    if (!val) return
    setTiers(prev => ({ ...prev, [tier]: Array.from(new Set([...(prev[tier] || []), val])) }))
    setAddInputs(prev => ({ ...prev, [tier]: "" }))
  }
  const removePartner = (tier: string, name: string) => setTiers(prev => ({ ...prev, [tier]: (prev[tier] || []).filter(p => p !== name) }))
  const addTier = () => {
    const name = newTier.trim()
    if (!name) return
    if (tiers[name]) { notify(false, `Nhóm "${name}" đã tồn tại`); return }
    setTiers(prev => ({ ...prev, [name]: [] }))
    setNewTier("")
  }
  const deleteTier = (tier: string) => setTiers(prev => { const n = { ...prev }; delete n[tier]; return n })

  const cyclePolicy = (cat: string, role: string) => {
    const cur = getDecision(cat, role)
    setPolicy(prev => ({ ...prev, [cat]: { ...(prev[cat] || {}), [role]: NEXT_DECISION[cur] } }))
  }
  const fullPolicy = () => {
    const out: Record<string, Record<string, Decision>> = {}
    CATEGORIES.forEach(c => { out[c.id] = {}; POLICY_ROLES.forEach(r => { out[c.id][r] = getDecision(c.id, r) }) })
    return out
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#003B95] rounded-xl flex items-center justify-center"><SettingsIcon className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics Settings</h1>
            <p className="text-slate-500 text-sm">Đối tác chiến lược · Chính sách truy cập chatbot · Lọc dòng BI theo role</p>
          </div>
        </div>
        <button onClick={fetchAll} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"><RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} /></button>
      </div>

      {msg && <div className={cn("px-4 py-3 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-rose-50 border border-rose-100 text-rose-700")}>{msg.text}</div>}

      {/* Database Status — kiểm tra nhanh kho dữ liệu còn cập nhật không */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><Database className="w-5 h-5 text-[#003B95]" /><h2 className="font-bold text-slate-800">Tình trạng Database</h2></div>
          <span className="flex items-center gap-2">
            <button onClick={flushCache} disabled={flushing} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50" title="Xoá L2 Supabase cache — lần tải tiếp lấy dữ liệu mới từ gohub_dw">
              {flushing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Xoá Cache"}
            </button>
            <button onClick={syncTursoCosts} disabled={syncing} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
              {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Sync sang Supabase"}
            </button>
            <button onClick={checkDb} disabled={dbLoading} className="flex items-center gap-2 px-4 py-2 bg-[#003B95] text-white rounded-xl text-xs font-bold hover:bg-[#002B70] disabled:opacity-50">
              {dbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Kiem tra"}
            </button>
          </span>
        </div>
        {db && (
          <div className="p-6 text-sm">
            {db.error ? <p className="text-rose-600">{db.error}</p> : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">Kiểm tra lúc {fmtTime(db.checkedAt)}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(db.warehouse || []).map((w: any) => (
                    <div key={w.table} className="border border-slate-100 rounded-lg p-3 bg-slate-50/40">
                      <p className="font-bold text-slate-700 text-xs truncate" title={w.table}>{w.table}</p>
                      {w.error ? <p className="text-rose-500 text-xs mt-1">{w.error}</p> : (
                        <>
                          <p className="text-slate-500 text-xs mt-1">{w.rows.toLocaleString("vi-VN")} dòng</p>
                          <p className="text-slate-500 text-xs">Dữ liệu mới nhất: <span className="font-medium text-slate-700">{w.latest ? w.latest.slice(0, 10) : "—"}</span></p>
                          {w.lastLoaded && <p className="text-slate-400 text-[11px]">ETL nạp: {fmtTime(w.lastLoaded)}</p>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {db.products && (
                  <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40">
                    <p className="font-bold text-slate-700 text-xs">Sản phẩm (Supabase sku_catalog)</p>
                    {db.products.error ? <p className="text-rose-500 text-xs mt-1">{db.products.error}</p> : (
                      <p className="text-slate-500 text-xs mt-1">{(db.products.rows || 0).toLocaleString("vi-VN")} SKU · sync cuối: <span className="font-medium text-slate-700">{fmtTime(db.products.lastSynced)}</span></p>
                    )}
                  </div>
                )}
                {db.cache != null && (
                  <div className="border border-amber-100 rounded-lg p-3 bg-amber-50/40">
                    <p className="font-bold text-amber-700 text-xs">Query Cache (Supabase L2 · TTL 10 phút)</p>
                    <p className="text-slate-500 text-xs mt-1">
                      <span className="font-medium text-slate-700">{db.cache.entries ?? 0}</span> entries đang cache
                      {db.cache.oldest && <> · cũ nhất: <span className="font-medium text-slate-700">{fmtTime(db.cache.oldest)}</span></>}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {!db && <div className="px-6 py-4 text-xs text-slate-400">Bấm “Kiểm tra” để xem kho dữ liệu (gohub_dw) còn cập nhật không và lần sync sản phẩm gần nhất.</div>}
      </div>

      {/* Channel & Customer Tiers (Partner Tiers) — gộp từ Admin sang đây (s82) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#003B95]" />
            <div>
              <h2 className="font-bold text-slate-800">Channel &amp; Customer Tiers (Partner Tiers)</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Phân loại đối tác chiến lược. Mỗi nhóm hiển thị riêng trong báo cáo B2B / BOD / Dashboard / All-Time.</p>
            </div>
          </div>
          <button onClick={() => savePost("tiers", "/api/config/partner-tiers", tiers)} disabled={saving === "tiers" || !dirtyTiers} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50", dirtyTiers ? "bg-[#003B95] text-white hover:bg-[#002B70]" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
            {saving === "tiers" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
          </button>
        </div>

        <datalist id="channel-suggestions">
          {availablePartners.map(c => <option key={c} value={c} />)}
        </datalist>

        <div className="p-6 space-y-4">
          {/* Thêm nhóm mới */}
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tên nhóm mới</label>
              <input value={newTier} onChange={e => setNewTier(e.target.value)} onKeyDown={e => e.key === "Enter" && addTier()}
                placeholder="VD: Strategic, Preferred..."
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#003B95]" />
            </div>
            <button onClick={addTier} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg">
              <Plus size={14} /> Thêm nhóm
            </button>
          </div>

          {/* Các nhóm tier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(tiers).sort().map(tier => {
              const list = tiers[tier] || []
              return (
                <div key={tier} className="flex flex-col bg-slate-50 rounded-xl border border-slate-100">
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{tier}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500">{list.length} đối tác</span>
                      <button onClick={() => deleteTier(tier)} title="Xóa nhóm" className="text-slate-300 hover:text-rose-500"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="p-3 flex-1 space-y-1.5 max-h-56 overflow-y-auto">
                    {list.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-4">Chưa có đối tác nào</p>
                    ) : list.map(p => (
                      <div key={p} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-xs text-slate-600 truncate">{p}</span>
                        <button onClick={() => removePartner(tier, p)} className="text-slate-300 hover:text-rose-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                    <input list="channel-suggestions" value={addInputs[tier] || ""}
                      onChange={e => setAddInputs(prev => ({ ...prev, [tier]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && addPartner(tier, addInputs[tier] || "")}
                      placeholder="Thêm đối tác (gõ hoặc chọn kênh)..."
                      className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#003B95]" />
                    <button onClick={() => addPartner(tier, addInputs[tier] || "")} className="px-2.5 py-1.5 bg-[#003B95] hover:bg-[#002B70] text-white text-xs font-semibold rounded-lg shrink-0"><Plus size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Guardian — simplified */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#003B95]" />
          <h2 className="font-bold text-slate-800">Chatbot Guardian</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Hard block info */}
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl p-4">
            <Shield className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-700">Chặn cứng mọi role (không phân quyền được)</p>
              <p className="text-[11px] text-rose-600 mt-0.5">Câu hỏi về code / cách build hệ thống / credential / quy trình kỹ thuật nội bộ → chatbot từ chối, không tiết lộ.</p>
            </div>
          </div>
          {/* Open policy info */}
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <Shield className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-700">Mọi dữ liệu kinh doanh đều mở (mặc định)</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Revenue, CM1, COGS, HR, KH, KB… — tất cả vai trò đều được hỏi. Dùng Role Filters bên dưới nếu muốn giới hạn SQL theo role cụ thể.</p>
            </div>
          </div>
          {/* Custom rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hướng dẫn tùy chỉnh cho Chatbot (tùy chọn)</label>
              <button onClick={() => savePost("custom-rules", "/api/config/chatbot-rules", { rules: customRules })} disabled={saving === "custom-rules" || !dirtyCustomRules} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50", dirtyCustomRules ? "bg-[#003B95] text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
                {saving === "custom-rules" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Lưu
              </button>
            </div>
            <textarea
              value={customRules}
              onChange={e => setCustomRules(e.target.value)}
              rows={4}
              placeholder={"Nhập hướng dẫn bổ sung cho chatbot (tiếng Việt hoặc tiếng Anh).\nVí dụ: \"Staff chỉ được xem doanh thu của kênh họ phụ trách.\"\nĐể trống = chatbot chạy theo mặc định."}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">Text này được inject vào system prompt của chatbot BI — viết bằng ngôn ngữ tự nhiên, chatbot sẽ hiểu và áp dụng.</p>
          </div>
        </div>
      </div>

      {/* Role Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><Filter className="w-5 h-5 text-[#003B95]" /><h2 className="font-bold text-slate-800">Lọc dòng BI theo Role (Role Filters)</h2></div>
          <button onClick={() => savePost("filters", "/api/config/role-filters", filters)} disabled={saving === "filters" || !dirtyFilters} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50", dirtyFilters ? "bg-[#003B95] text-white hover:bg-[#002B70]" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
            {saving === "filters" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
          </button>
        </div>
        <div className="p-6 space-y-4">
          {FILTER_ROLES.map(role => (
            <div key={role}>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Role: {ROLE_LABELS[role] ?? role}</label>
              <textarea value={filters[role] || ""} onChange={e => setFilters(prev => ({ ...prev, [role]: e.target.value }))} rows={2} placeholder="Điều kiện SQL WHERE thêm cho role này (vd: f.company_code = 'VN'). Để trống = không lọc." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
            </div>
          ))}
          <p className="text-xs text-slate-400">Điều kiện này được AND thêm vào truy vấn BI cho role tương ứng (admin không bị lọc).</p>
        </div>
      </div>

      {/* SKU Destination Definition */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-[#003B95]" /><h2 className="font-bold text-slate-800">SKU Destination Definition</h2></div>
          <button onClick={() => savePost("sku-dest", "/api/config/sku-destination-rule", { rules: skuRules })} disabled={saving === "sku-dest" || !dirtySkuRules} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50", dirtySkuRules ? "bg-[#003B95] text-white hover:bg-[#002B70]" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
            {saving === "sku-dest" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">Quy tắc extract destination code từ SKU (áp theo thứ tự, khớp đầu tiên được dùng):</p>
            {skuRules.map((rule, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                  <input value={rule.startsWith} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, startsWith: e.target.value } : r))} placeholder="SKU startsWith (vd: GH)" className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input type="number" value={rule.codeLength} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, codeLength: parseInt(e.target.value) || 0 } : r))} placeholder="Độ dài" className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  <button onClick={() => setSkuRules(prev => prev.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
                </div>
                <input value={rule.description} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder="Mô tả quy tắc" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            ))}
            <button onClick={() => setSkuRules(prev => [...prev, { startsWith: "", codeLength: 3, description: "" }])} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200">
              <Plus className="w-3.5 h-3.5" />Thêm quy tắc
            </button>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-3">Bảng Country Codes ({countryCodes.length} quốc gia):</p>
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0"><tr><th className="px-3 py-2 text-left font-bold text-slate-500">Code</th><th className="px-3 py-2 text-left font-bold text-slate-500">Country</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {countryCodes.slice(0, 100).map(c => (
                    <tr key={c.code} className="hover:bg-slate-50/50">
                      <td className="px-3 py-1.5 font-mono text-slate-600">{c.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{c.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">⚠️ Lưu ý: destination hiện được tính theo <b>HỌ SKU</b> trong code (<code>getDestinationSQL</code>: digit→ký tự 3-5, E→2-4, 3-letter→1-3) rồi map tên nước qua bảng Country Codes. Quy tắc startsWith + codeLength ở đây là <b>tham chiếu/cấu hình dự phòng</b>, không trực tiếp điều khiển báo cáo hiện tại.</p>
      </div>

      {/* Item Type Classification */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#003B95]" />
            <div>
              <h2 className="font-bold text-slate-800">Phân loại Item Type theo Kênh</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Chatbot dùng danh sách prefix này để lọc giá bán đúng kênh B2C/B2B</p>
            </div>
          </div>
          <button
            onClick={() => savePost("item-channel", "/api/config/item-channel-types", itemChannelTypes)}
            disabled={saving === "item-channel" || !dirtyItemChannelTypes}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50",
              dirtyItemChannelTypes ? "bg-[#003B95] text-white hover:bg-[#002B70]" : "bg-slate-200 text-slate-400 cursor-not-allowed")}
          >
            {saving === "item-channel" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: editable channel → prefix config */}
          <div className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">Item type có prefix nào thuộc về kênh nào (chatbot lọc giá theo đây):</p>
            {Object.entries(itemChannelTypes).map(([channel, prefixes]) => (
              <div key={channel} className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-bold",
                    channel === "B2C" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"
                  )}>{channel}</span>
                  <span className="text-[11px] text-slate-400">{prefixes.length} prefix</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prefixes.map(p => (
                    <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-mono">
                      {p}
                      <button onClick={() => setItemChannelTypes(prev => ({ ...prev, [channel]: prev[channel].filter(x => x !== p) }))}
                        className="text-slate-300 hover:text-rose-500"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-1">
                  <input
                    value={newChannelPrefix[channel] || ""}
                    onChange={e => setNewChannelPrefix(prev => ({ ...prev, [channel]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const v = (newChannelPrefix[channel] || "").trim()
                        if (v && !prefixes.includes(v)) setItemChannelTypes(prev => ({ ...prev, [channel]: [...prev[channel], v] }))
                        setNewChannelPrefix(prev => ({ ...prev, [channel]: "" }))
                      }
                    }}
                    placeholder="Thêm prefix rồi Enter…"
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      const v = (newChannelPrefix[channel] || "").trim()
                      if (v && !prefixes.includes(v)) setItemChannelTypes(prev => ({ ...prev, [channel]: [...prev[channel], v] }))
                      setNewChannelPrefix(prev => ({ ...prev, [channel]: "" }))
                    }}
                    className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200"
                  ><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Right: read-only reference — all distinct item_type values tagged by channel */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-3">Tất cả Item Type hiện có ({allItemTypes.length}) — tagged theo prefix config:</p>
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Item Type</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500">Kênh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allItemTypes.map(t => {
                    const matchedChannel = Object.entries(itemChannelTypes).find(([, prefixes]) =>
                      prefixes.some(p => t.toLowerCase().includes(p.toLowerCase()))
                    )?.[0] ?? null
                    return (
                      <tr key={t} className="hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 text-slate-700 font-mono text-[11px]">{t}</td>
                        <td className="px-3 py-1.5 text-center">
                          {matchedChannel ? (
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                              matchedChannel === "B2C" ? "bg-sky-50 text-sky-600" : "bg-violet-50 text-violet-600"
                            )}>{matchedChannel}</span>
                          ) : <span className="text-slate-300 text-[10px]">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">
          Chatbot dùng prefix này để lọc giá bán: B2B thấy giá OD/WS/Strategic/Tier, B2C thấy giá B2C Website. COGS kiểm soát riêng qua Guardian.
        </p>
      </div>
    </div>
  )
}
