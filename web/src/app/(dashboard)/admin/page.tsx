"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Users, Plus, Key, Trash2, Save, Shield, Settings, FileSpreadsheet, Search, ChevronLeft, ChevronRight } from "lucide-react"

interface User {
  username:      string
  name:          string
  email:         string
  role:          string
  created_at:    string
  lark_open_id?: string
}

type Tab = "list" | "add" | "password" | "settings" | "template"

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/chatbot")
  }, [status, session, router])

  if (status !== "authenticated" || session?.user?.role !== "admin") return null

  return <AdminPanel currentUser={session.user.username} />
}

function roleBadgeClass(role: string): string {
  if (role === "admin")   return "bg-amber-100 text-amber-700"
  if (role === "manager") return "bg-purple-100 text-purple-700"
  return "bg-green-100 text-green-700"
}

function AdminPanel({ currentUser }: { currentUser: string }) {
  const [tab, setTab]       = useState<Tab>("list")
  const [users, setUsers]   = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    const res  = await fetch("/api/admin/users")
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "list",     label: "Danh sách",    icon: <Users          size={15} /> },
    { id: "add",      label: "Thêm user",    icon: <Plus           size={15} /> },
    { id: "password", label: "Đổi password", icon: <Key            size={15} /> },
    { id: "settings", label: "Cài đặt",      icon: <Settings       size={15} /> },
    { id: "template", label: "Tạo template", icon: <FileSpreadsheet size={15} /> },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <Shield size={20} className="text-brand-600 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900">Quản lý Users</h1>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t.id
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "list"     && <UserList users={users} loading={loading} currentUser={currentUser} onRefresh={fetchUsers} onNotify={notify} />}
      {tab === "add"      && <AddUser   onRefresh={fetchUsers} onNotify={notify} setTab={setTab} />}
      {tab === "password" && <ChangePassword users={users} onNotify={notify} />}
      {tab === "settings" && <SettingsTab onNotify={notify} />}
      {tab === "template" && <TemplateTab onNotify={notify} />}
    </div>
  )
}

function UserList({ users, loading, currentUser, onRefresh, onNotify }: {
  users:       User[]
  loading:     boolean
  currentUser: string
  onRefresh:   () => void
  onNotify:    (type: "success" | "error", text: string) => void
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const changeRole = async (username: string, role: string) => {
    setSaving(username)
    const res = await fetch(`/api/admin/users/${username}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role }),
    })
    setSaving(null)
    if (res.ok) { onRefresh(); onNotify("success", `Đã đổi role ${username} → ${role}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  const deleteUser = async (username: string) => {
    if (pendingDelete !== username) { setPendingDelete(username); return }
    const res = await fetch(`/api/admin/users/${username}`, { method: "DELETE" })
    setPendingDelete(null)
    if (res.ok) { onRefresh(); onNotify("success", `Đã xóa user ${username}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  return (
    <div className="space-y-2">
      {users.map(u => (
        <div key={u.username} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          {pendingDelete === u.username && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-3">
              Bấm 🗑 lần nữa để xác nhận xóa <strong>{u.username}</strong>, hoặc click nơi khác để hủy.
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900">{u.username}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${roleBadgeClass(u.role)}`}>
                  {u.role === "standard" ? "Standard" : u.role}
                </span>
                {/* Auth provider badge */}
                {u.lark_open_id ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
                    Lark
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500">
                    PW
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">{u.name} {u.email ? `· ${u.email}` : ""}</div>
            </div>

            <div className="flex items-center gap-2">
              <select
                defaultValue={u.role}
                onChange={e => changeRole(u.username, e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="standard">Standard</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>

              {saving === u.username && (
                <span className="text-xs text-gray-400">Đang lưu...</span>
              )}

              {u.username !== currentUser && (
                <button
                  onClick={() => deleteUser(u.username)}
                  title="Xóa user"
                  className={`p-1.5 rounded-lg transition-colors ${
                    pendingDelete === u.username
                      ? "bg-red-100 text-red-600"
                      : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                  }`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AddUser({ onRefresh, onNotify, setTab }: {
  onRefresh: () => void
  onNotify:  (type: "success" | "error", text: string) => void
  setTab:    (t: Tab) => void
}) {
  const [form, setForm]   = useState({ username: "", name: "", email: "", role: "standard", password: "", confirm: "" })
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { onNotify("error", "Password không khớp"); return }
    setLoading(true)
    const res = await fetch("/api/admin/users", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username: form.username, name: form.name, email: form.email, role: form.role, password: form.password || null }),
    })
    setLoading(false)
    if (res.ok) {
      onRefresh()
      onNotify("success", `Đã thêm user ${form.username}`)
      setForm({ username: "", name: "", email: "", role: "standard", password: "", confirm: "" })
      setTab("list")
    } else {
      const { error } = await res.json()
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Username *"      value={form.username}  onChange={v => set("username", v)} placeholder="username" />
        <Field label="Tên hiển thị *"  value={form.name}      onChange={v => set("name",     v)} placeholder="Nguyễn Văn A" />
        <Field label="Email"           value={form.email}     onChange={v => set("email",    v)} placeholder="email@gohub.vn" type="email" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
          <select
            value={form.role}
            onChange={e => set("role", e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="standard">Standard</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Field label="Password"        value={form.password}  onChange={v => set("password", v)} type="password" placeholder="••••••••" />
        <Field label="Nhập lại PW"     value={form.confirm}   onChange={v => set("confirm",  v)} type="password" placeholder="••••••••" />
      </div>
      <p className="text-xs text-gray-400">Password có thể để trống nếu user sẽ đăng nhập bằng Lark.</p>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
      >
        {loading ? "Đang thêm..." : "Thêm user"}
      </button>
    </form>
  )
}

function ChangePassword({ users, onNotify }: {
  users:    User[]
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [target, setTarget]   = useState(users[0]?.username || "")
  const [pw,  setPw]          = useState("")
  const [pw2, setPw2]         = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { onNotify("error", "Password không khớp"); return }
    setLoading(true)
    const res = await fetch(`/api/admin/users/${target}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password: pw }),
    })
    setLoading(false)
    if (res.ok) { onNotify("success", `Đã đổi password cho ${target}`); setPw(""); setPw2("") }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {users.map(u => <option key={u.username} value={u.username}>{u.username} ({u.name})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Password mới *"  value={pw}  onChange={setPw}  type="password" placeholder="••••••••" />
        <Field label="Nhập lại *"      value={pw2} onChange={setPw2} type="password" placeholder="••••••••" />
      </div>
      <button
        type="submit"
        disabled={loading || !pw}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
      >
        {loading ? "Đang lưu..." : "Đổi password"}
      </button>
    </form>
  )
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  type?:       string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={label.includes("*")}
        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature A: Settings Tab
// ─────────────────────────────────────────────────────────────────────────────

interface AppSetting {
  key:        string
  value:      string
  label:      string
  category:   string
  updated_at: string | null
}

const SETTING_UNITS: Record<string, string> = {
  "fx.usd_vnd":              "VND per 1 USD",
  "fx.hkd_usd":              "USD per 1 HKD",
  "fx.twd_usd":              "USD per 1 TWD",
  "3hk.fixed_factor":        "(0 – 1)",
  "3hk.daily_factor":        "(0 – 1)",
  "3hk.unlim_10mbps_gb_day": "GB/day",
  "3hk.unlim_5mbps_gb_day":  "GB/day",
}

function SettingsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [settings, setSettings]   = useState<AppSetting[]>([])
  const [changed, setChanged]     = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(true)
  const [saving,  setSaving]      = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => { setSettings(d.settings ?? []); setLoading(false) })
      .catch(() => { onNotify("error", "Hiếu đang fix, vui lòng đợi"); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (key: string, val: string) => {
    setChanged(prev => ({ ...prev, [key]: val }))
  }

  const getCurrentValue = (s: AppSetting) =>
    changed[s.key] !== undefined ? changed[s.key] : s.value

  const save = async () => {
    const updates = Object.entries(changed).map(([key, value]) => ({ key, value }))
    if (updates.length === 0) { onNotify("error", "Chưa có thay đổi nào"); return }
    setSaving(true)
    const res = await fetch("/api/admin/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates }),
    })
    setSaving(false)
    if (res.ok) {
      // Reflect saved values back
      setSettings(prev => prev.map(s =>
        changed[s.key] !== undefined
          ? { ...s, value: changed[s.key], updated_at: new Date().toISOString() }
          : s
      ))
      setChanged({})
      onNotify("success", `Đã lưu ${updates.length} cài đặt`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  const fxSettings      = settings.filter(s => s.category === "fx_rate")
  const formulaSettings = settings.filter(s => s.category === "formula")

  const renderSection = (title: string, rows: AppSetting[]) => (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{title}</h3>
      <div className="divide-y divide-gray-100">
        {rows.map(s => (
          <div key={s.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700">{s.label}</div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">{s.key}</div>
              {s.updated_at && (
                <div className="text-xs text-gray-300 mt-0.5">
                  Cập nhật: {new Date(s.updated_at).toLocaleString("vi-VN")}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                step="any"
                value={getCurrentValue(s)}
                onChange={e => setValue(s.key, e.target.value)}
                className={`w-28 px-3 py-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition ${
                  changed[s.key] !== undefined ? "border-amber-400 bg-amber-50" : "border-gray-300"
                }`}
              />
              {SETTING_UNITS[s.key] && (
                <span className="text-xs text-gray-400 w-28">{SETTING_UNITS[s.key]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      {renderSection("Tỷ Giá Nội Bộ", fxSettings)}
      {renderSection("Công Thức 3HK Datapool", formulaSettings)}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || Object.keys(changed).length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? "Đang lưu..." : "Lưu tất cả"}
        </button>
        {Object.keys(changed).length > 0 && (
          <span className="text-sm text-amber-600">{Object.keys(changed).length} thay đổi chưa lưu</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature B: Template Generator Tab
// ─────────────────────────────────────────────────────────────────────────────

interface WMProduct {
  vendor_product_id: string
  product_name:      string | null
  region:            string | null
  sim_type:          string | null
  days:              number | null
  data_gb:           number | null
  is_daily:          boolean
  is_unlimited:      boolean
  throttle_kbps:     number | null
  cogs:              number | null
  cogs_currency:     string | null
}

const DEFAULT_CONFIG = {
  // Country / Vendor
  supportCountryCode: "",     // 3-char, e.g. "TWN"
  isoCodes:           "",     // ISO codes, e.g. "TW"
  vendorCode:         "WM",   // 2-char
  countryNameVn:      "",     // e.g. "Đài Loan"
  countryNameEn:      "",     // e.g. "Taiwan"
  // SKU Code Components
  purchaseType_US:    "D",    // letter for US entity
  purchaseType_VN:    "3",    // digit for VN entity
  productType:        "C",    // 1-char
  dataPolicyCode:     "P",    // 1-char data policy
  // Product Fields
  operatorCode:       "",     // e.g. "WORLDMOVE"
  purchaseMethod:     "API Purchase",
  skuType:            "Base + Datapack",
  importType:         "Official",
  typeOfSim:          "eSIM",
  // Network
  networkType:        "",
  apn:                "",
  onsiteCarrier:      "",
  // Misc
  kycNeeded:          "No",
  kycCode:            1,
  hotspot:            "Yes",
  dailyResetTime:     "",
  activationTime:     "",
  expirationDays:     90,
  call:               "No",
  // Notes
  cogsDescription:    "",
  cogsFormula:        "",
}

function fmtWMData(p: WMProduct): string {
  if (p.is_unlimited) return "UNL/Day"
  if (p.data_gb == null) return "—"
  if (p.data_gb < 1) return `${Math.round(p.data_gb * 1000)}MB${p.is_daily ? "/day" : ""}`
  return `${p.data_gb}GB${p.is_daily ? "/day" : ""}`
}

const WM_PAGE_SIZE = 50

function TemplateTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [config, setConfig]           = useState(DEFAULT_CONFIG)
  const [products, setProducts]       = useState<WMProduct[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loadingP, setLoadingP]       = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [searchRegion, setSearchRegion] = useState("")
  const [filterSim, setFilterSim]     = useState("")
  const [filterUnlim, setFilterUnlim] = useState("")
  const [fxSettings, setFxSettings]   = useState({ fx_usd_vnd: 26394, fx_twd_usd: 0.03165 })

  // Load fx settings once
  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        const rows: AppSetting[] = d.settings ?? []
        const usd_vnd = rows.find(s => s.key === "fx.usd_vnd")
        const twd_usd = rows.find(s => s.key === "fx.twd_usd")
        setFxSettings({
          fx_usd_vnd: usd_vnd ? parseFloat(usd_vnd.value) : 26394,
          fx_twd_usd: twd_usd ? parseFloat(twd_usd.value) : 0.03165,
        })
      })
  }, [])

  const fetchProducts = useCallback(async (pg: number) => {
    setLoadingP(true)
    const params = new URLSearchParams({
      page:         String(pg),
      gap:          "all",
    })
    if (searchRegion) params.set("region", searchRegion)
    if (filterSim)    params.set("sim_type", filterSim)
    if (filterUnlim)  params.set("is_unlimited", filterUnlim)

    const res = await fetch(`/api/ncc/worldmove?${params}`)
    const d   = await res.json()
    setProducts(d.data ?? [])
    setTotal(d.total ?? 0)
    setLoadingP(false)
  }, [searchRegion, filterSim, filterUnlim])

  useEffect(() => { fetchProducts(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => { setPage(1); fetchProducts(1) }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const selectAll = () => {
    setSelected(prev => {
      const s = new Set(prev)
      products.forEach(p => s.add(p.vendor_product_id))
      return s
    })
  }

  const clearAll = () => setSelected(new Set())

  const generate = async () => {
    if (selected.size === 0) { onNotify("error", "Chưa chọn sản phẩm nào"); return }
    if (!config.supportCountryCode) { onNotify("error", "Nhập Support Country Code (3 chars)"); return }
    if (!config.purchaseType_US) { onNotify("error", "Nhập Purchase Type US (1 ký tự)"); return }
    if (!config.purchaseType_VN) { onNotify("error", "Nhập Purchase Type VN (1 số)"); return }

    // We need the full product objects for selected IDs
    // For simplicity, collect from current page; in production you'd want all pages
    const selectedProducts = products.filter(p => selected.has(p.vendor_product_id))

    setGenerating(true)
    try {
      const res = await fetch("/api/admin/template", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          products: selectedProducts,
          config:   { ...config },
          settings: fxSettings,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }))
        onNotify("error", err.error ?? "Hiếu đang fix, vui lòng đợi")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")
      a.href     = url
      a.download = `template_${date}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onNotify("success", `Đã tạo template với ${selectedProducts.length} sản phẩm`)
    } catch {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    } finally {
      setGenerating(false)
    }
  }

  const setC = (k: keyof typeof DEFAULT_CONFIG, v: string | number) =>
    setConfig(prev => ({ ...prev, [k]: v }))

  const totalPages = Math.ceil(total / WM_PAGE_SIZE)

  return (
    <div className="space-y-5">
      {/* ── Config inputs ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Cấu hình Template</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* ─ SKU Code Components ─ */}
          <TemplField label="Purchase Type US *"    value={config.purchaseType_US}     onChange={v => setC("purchaseType_US", v)}     placeholder="D (letter)" />
          <TemplField label="Purchase Type VN *"    value={config.purchaseType_VN}     onChange={v => setC("purchaseType_VN", v)}     placeholder="3 (digit)" />
          <TemplField label="Product Type"          value={config.productType}         onChange={v => setC("productType", v)}         placeholder="C" />
          <TemplField label="Support Country Code *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="TWN" />
          <TemplField label="Vendor Code"           value={config.vendorCode}          onChange={v => setC("vendorCode", v)}          placeholder="WM" />
          <TemplField label="Data Policy Code"      value={config.dataPolicyCode}      onChange={v => setC("dataPolicyCode", v)}      placeholder="P" />
          {/* ─ Country Names ─ */}
          <TemplField label="Country Name VN"       value={config.countryNameVn}       onChange={v => setC("countryNameVn", v)}       placeholder="Đài Loan" />
          <TemplField label="Country Name EN"       value={config.countryNameEn}       onChange={v => setC("countryNameEn", v)}       placeholder="Taiwan" />
          <TemplField label="ISO Country Codes"     value={config.isoCodes}            onChange={v => setC("isoCodes", v)}            placeholder="TW" />
          {/* ─ Product Info ─ */}
          <TemplField label="Operator Code"         value={config.operatorCode}        onChange={v => setC("operatorCode", v)}        placeholder="WORLDMOVE" />
          <TemplField label="Type of SIM"           value={config.typeOfSim}           onChange={v => setC("typeOfSim", v)}           placeholder="eSIM" />
          <TemplField label="Purchase Method"       value={config.purchaseMethod}      onChange={v => setC("purchaseMethod", v)}      placeholder="API Purchase" />
          <TemplField label="SKU Type"              value={config.skuType}             onChange={v => setC("skuType", v)}             placeholder="Base + Datapack" />
          <TemplField label="Import Type"           value={config.importType}          onChange={v => setC("importType", v)}          placeholder="Official" />
          {/* ─ Network ─ */}
          <TemplField label="Network Type"          value={config.networkType}         onChange={v => setC("networkType", v)}         placeholder="4G" />
          <TemplField label="APN"                   value={config.apn}                 onChange={v => setC("apn", v)}                 placeholder="mobile.three.com.hk" />
          <TemplField label="Onsite Carrier"        value={config.onsiteCarrier}       onChange={v => setC("onsiteCarrier", v)}       placeholder="Chunghwa Telecom" />
          {/* ─ Timing ─ */}
          <TemplField label="Daily Reset Time"      value={config.dailyResetTime}      onChange={v => setC("dailyResetTime", v)}      placeholder="UTC+8" />
          <TemplField label="Activation Time"       value={config.activationTime}      onChange={v => setC("activationTime", v)}      placeholder="24h" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expiration (days)</label>
            <input
              type="number"
              value={config.expirationDays}
              onChange={e => setC("expirationDays", parseInt(e.target.value) || 90)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <TemplField label="Call"    value={config.call}    onChange={v => setC("call", v)}    placeholder="No" />
          <TemplField label="Hotspot" value={config.hotspot} onChange={v => setC("hotspot", v)} placeholder="Yes" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">KYC Needed</label>
            <select
              value={config.kycNeeded}
              onChange={e => setC("kycNeeded", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
        </div>
        {/* COGS description & formula */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả COGS (Sheet 2)</label>
            <textarea
              rows={2}
              value={config.cogsDescription}
              onChange={e => setC("cogsDescription", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Mô tả cấu trúc giá..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Công thức COGS (Sheet 2)</label>
            <textarea
              rows={2}
              value={config.cogsFormula}
              onChange={e => setC("cogsFormula", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="COGS = ..."
            />
          </div>
        </div>
        <div className="text-xs text-gray-400">
          Tỷ giá đang dùng: 1 TWD = {fxSettings.fx_twd_usd} USD · 1 USD = {fxSettings.fx_usd_vnd} VND
          &nbsp;(lấy từ tab Cài đặt)
        </div>
      </div>

      {/* ── Product selection ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Chọn sản phẩm WM</h3>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-40">
            <Search size={14} className="text-gray-400" />
            <input
              value={searchRegion}
              onChange={e => setSearchRegion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Lọc theo region / tên..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={filterSim}
            onChange={e => { setFilterSim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Tất cả loại SIM</option>
            <option value="eSIM">eSIM</option>
            <option value="SIM">SIM</option>
          </select>
          <select
            value={filterUnlim}
            onChange={e => { setFilterUnlim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Tất cả gói</option>
            <option value="true">Unlimited</option>
            <option value="false">Fixed</option>
          </select>
          <button
            onClick={search}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
          >
            Tìm
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && products.every(p => selected.has(p.vendor_product_id))}
                    onChange={e => e.target.checked ? selectAll() : clearAll()}
                  />
                </th>
                <th className="px-3 py-2">Vendor ID</th>
                <th className="px-3 py-2">Tên sản phẩm</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Loại</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Data</th>
                <th className="px-3 py-2 text-right">COGS (TWD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingP ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Đang tải...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Không có dữ liệu</td></tr>
              ) : products.map(p => (
                <tr
                  key={p.vendor_product_id}
                  className={`cursor-pointer hover:bg-gray-50 ${selected.has(p.vendor_product_id) ? "bg-brand-50" : ""}`}
                  onClick={() => toggleSelect(p.vendor_product_id)}
                >
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.vendor_product_id)}
                      onChange={() => toggleSelect(p.vendor_product_id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.vendor_product_id}</td>
                  <td className="px-3 py-2">{p.product_name}</td>
                  <td className="px-3 py-2 text-gray-600">{p.region}</td>
                  <td className="px-3 py-2 text-gray-600">{p.sim_type}</td>
                  <td className="px-3 py-2 text-right">{p.days}</td>
                  <td className="px-3 py-2 text-right">{fmtWMData(p)}</td>
                  <td className="px-3 py-2 text-right">{p.cogs ? p.cogs.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{total.toLocaleString()} sản phẩm · Trang {page}/{totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <span className="text-sm text-gray-500">
            {selected.size} sản phẩm được chọn
          </span>
          <button
            onClick={selectAll}
            className="text-xs text-brand-600 hover:underline"
          >
            Chọn tất cả trang này
          </button>
          {selected.size > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-400 hover:underline"
            >
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      </div>

      {/* ── Generate button ── */}
      <button
        onClick={generate}
        disabled={generating || selected.size === 0}
        className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <FileSpreadsheet size={16} />
        {generating ? "Đang tạo..." : `Tạo Excel (${selected.size} sản phẩm)`}
      </button>
    </div>
  )
}

function TemplField({ label, value, onChange, placeholder }: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
