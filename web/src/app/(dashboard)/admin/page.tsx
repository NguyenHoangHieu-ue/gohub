"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Users, Plus, Key, Trash2, Save, Shield, Settings, FileSpreadsheet, Search, ChevronLeft, ChevronRight, Gift, Pencil, X, Check, Lock } from "lucide-react"
import { ConfirmModal } from "@/components/confirm-modal"

interface User {
  username:      string
  name:          string
  email:         string
  role:          string
  department:    string
  created_at:    string
  lark_open_id?: string
}

type Tab = "list" | "add" | "password" | "settings" | "permissions" | "template" | "promotions"

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
    { id: "list",       label: "Danh sách",    icon: <Users           size={15} /> },
    { id: "add",        label: "Thêm user",    icon: <Plus            size={15} /> },
    { id: "password",   label: "Đổi password", icon: <Key             size={15} /> },
    { id: "settings",     label: "Cài đặt",      icon: <Settings        size={15} /> },
    { id: "permissions",  label: "Phân quyền",   icon: <Lock            size={15} /> },
    { id: "template",     label: "Tạo template", icon: <FileSpreadsheet size={15} /> },
    { id: "promotions", label: "Khuyến mãi",   icon: <Gift            size={15} /> },
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

      {tab === "list"       && <UserList users={users} loading={loading} currentUser={currentUser} onRefresh={fetchUsers} onNotify={notify} />}
      {tab === "add"        && <AddUser   onRefresh={fetchUsers} onNotify={notify} setTab={setTab} />}
      {tab === "password"   && <ChangePassword users={users} onNotify={notify} />}
      {tab === "settings"     && <SettingsTab     onNotify={notify} />}
      {tab === "permissions"  && <PermissionsTab  onNotify={notify} />}
      {tab === "template"     && <TemplateTab     onNotify={notify} />}
      {tab === "promotions" && <PromotionsTab onNotify={notify} />}
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
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState(false)

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

  const changeDept = async (username: string, department: string) => {
    const res = await fetch(`/api/admin/users/${username}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ department }),
    })
    if (res.ok) { onRefresh(); onNotify("success", `Đã đổi phòng ban ${username} → ${department}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  const deleteUser = async (username: string) => {
    setDeleting(true)
    const res = await fetch(`/api/admin/users/${username}`, { method: "DELETE" })
    setDeleting(false)
    setConfirmDel(null)
    if (res.ok) { onRefresh(); onNotify("success", `Đã xóa user ${username}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  return (
    <div className="space-y-2">
      <ConfirmModal
        open={!!confirmDel}
        loading={deleting}
        title="Xóa user"
        message={`Xóa tài khoản "${confirmDel}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa user"
        onConfirm={() => confirmDel && deleteUser(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
      {users.map(u => (
        <div key={u.username} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
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
              <select
                defaultValue={u.department ?? "all"}
                onChange={e => changeDept(u.username, e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                title="Phòng ban"
              >
                <option value="all">Tất cả</option>
                <option value="sales">Sales</option>
                <option value="product">Product</option>
                <option value="tech">Tech</option>
                <option value="finance">Finance</option>
              </select>

              {saving === u.username && (
                <span className="text-xs text-gray-400">Đang lưu...</span>
              )}

              {u.username !== currentUser && (
                <button
                  onClick={() => setConfirmDel(u.username)}
                  title="Xóa user"
                  className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50"
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
  // Tỷ giá — Gohub JSC (VND)
  "fx.usd_vnd":              "VND / 1 USD",
  "fx.vnd_cny":              "VND / 1 CNY (JSC)",
  "fx.vnd_gbp":              "VND / 1 GBP (JSC)",
  // Tỷ giá — Gohub Inc (1 USD = X)
  "fx.hkd_usd":              "USD / 1 HKD  (= 1 / HKD/USD)",
  "fx.twd_usd":              "USD / 1 TWD  (= 1 / TWD/USD)",
  "fx.usd_jpy":              "JPY / 1 USD",
  "fx.usd_thb":              "THB / 1 USD",
  "fx.usd_cny":              "CNY / 1 USD (Inc)",
  "fx.usd_eur":              "EUR / 1 USD",
  "fx.usd_gbp":              "GBP / 1 USD (Inc)",
  "fx.usd_sgd":              "SGD / 1 USD",
  // 3HK formula
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
  vendor_product_id:    string
  product_name:         string | null
  region:               string | null
  sim_type:             string | null
  days:                 number | null
  data_gb:              number | null
  is_daily:             boolean
  is_unlimited:         boolean
  throttle_kbps:        number | null
  cogs:                 number | null
  cogs_currency:        string | null
  // APN fields
  apn:                  string | null
  apn_network_type:     string | null
  apn_roaming_carrier:  string | null
  apn_telecom_providers:string | null
}

const DEFAULT_CONFIG = {
  supportCountryCode: "",
  isoCodes:           "",
  vendorCode:         "WM",
  countryNameVn:      "",
  countryNameEn:      "",
  purchaseType_US:    "D",
  purchaseType_VN:    "3",
  productType:        "C",
  dataPolicyCode:     "P",
  operatorCode:       "WORLDMOVE",
  purchaseMethod:     "API Purchase",
  skuType:            "Base + Datapack",
  importType:         "Official",
  typeOfSim:          "eSIM",
  networkType:        "",
  apn:                "",
  onsiteCarrier:      "",
  kycNeeded:          "No",
  kycCode:            1,
  hotspot:            "Yes",
  dailyResetTime:     "",
  activationTime:     "",
  expirationDays:     90,
  call:               "No",
  cogsDescription:    "",
  cogsFormula:        "",
}

// ─── Client-side compute helpers (mirror API logic) ────────────────────────

function _zeroPad(n: number, len: number) { return String(Math.round(n)).padStart(len, "0") }
function _roundUp(val: number, dec: number) { const f = 10 ** dec; return Math.ceil(val * f) / f }

function _dataAmountCode(data_gb: number | null, is_unlimited: boolean): string {
  if (is_unlimited || data_gb == null) return "UNL"
  if (data_gb >= 1) return _zeroPad(Math.round(data_gb), 3)
  return _zeroPad(Math.round(data_gb * 1000), 3)
}

function _skuSuffix(p: WMProduct): string {
  return _dataAmountCode(p.data_gb, p.is_unlimited) + _zeroPad(p.days ?? 0, 2)
}

function _buildPC(pt: string, cfg: typeof DEFAULT_CONFIG): string {
  return pt + cfg.productType + cfg.supportCountryCode + cfg.vendorCode + cfg.dataPolicyCode
}

function _fmtThrottle(kbps: number | null): string {
  if (kbps == null) return ""
  if (kbps >= 1000) return `${kbps / 1000} Mbps`
  return `${kbps} kbps`
}

function _fmtData(p: WMProduct): string {
  if (p.is_unlimited) return "Unlimited"
  if (p.data_gb == null) return ""
  if (p.data_gb < 1) return `${Math.round(p.data_gb * 1000)}MB`
  return `${p.data_gb}GB`
}

function _nameVn(p: WMProduct, cfg: typeof DEFAULT_CONFIG): string {
  const d = _zeroPad(p.days ?? 0, 2)
  return `${cfg.typeOfSim} ${cfg.countryNameVn} ${p.is_unlimited ? "Unlimited" : _fmtData(p)} ${d} Ngày`
}

function _nameEn(p: WMProduct, cfg: typeof DEFAULT_CONFIG): string {
  const d = _zeroPad(p.days ?? 0, 2)
  const dl = `${d} Day${(p.days ?? 1) !== 1 ? "s" : ""}`
  return `${cfg.typeOfSim} ${cfg.countryNameEn} ${p.is_unlimited ? "Unlimited" : _fmtData(p)} ${dl}`
}

function _deriveDataPolicy(p: WMProduct): string {
  if (p.is_unlimited) {
    if (!p.throttle_kbps) return "D"
    if (p.throttle_kbps >= 10000) return "A"
    if (p.throttle_kbps >= 5000)  return "B"
    return "P"
  }
  return p.is_daily ? "P" : "F"
}

interface PreviewRow {
  sku:        string
  name_vn:    string
  name_en:    string
  cogs:       string
  currency:   string
  throttle:   string
  days:       number | null
  data:       string
  vendor_sku: string
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
  const [subTab, setSubTab]         = useState<"create" | "customize">("create")
  const [selectedNCC, setSelectedNCC] = useState("WM")
  const [config, setConfig]         = useState(DEFAULT_CONFIG)
  const [products, setProducts]     = useState<WMProduct[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loadingP, setLoadingP]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [selObjs, setSelObjs]       = useState<Map<string, WMProduct>>(new Map())
  const [searchQ, setSearchQ]       = useState("")
  const [filterSim, setFilterSim]   = useState("")
  const [filterUnlim, setFilterUnlim] = useState("")
  const [fxSettings, setFxSettings] = useState({ fx_usd_vnd: 26394, fx_twd_usd: 0.03165 })
  const [previewRows, setPreviewRows] = useState<{ us: PreviewRow[]; vn: PreviewRow[]; pcUS: string; pcVN: string } | null>(null)
  const [previewTab, setPreviewTab]   = useState<"us" | "vn" | "prod">("us")
  const previewRef = useRef<HTMLDivElement>(null)

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
    // Tạo mới: mặc định chỉ show sản phẩm chưa có trong hệ thống
    const params = new URLSearchParams({ page: String(pg), gap: "not_in_system" })
    if (searchQ)      params.set("search",       searchQ)
    if (filterSim)    params.set("sim_type",      filterSim)
    if (filterUnlim)  params.set("is_unlimited",  filterUnlim)
    const res = await fetch(`/api/ncc/worldmove?${params}`)
    const d   = await res.json()
    setProducts(d.data ?? [])
    setTotal(d.total ?? 0)
    setLoadingP(false)
  }, [searchQ, filterSim, filterUnlim])

  useEffect(() => { fetchProducts(page) }, [page]) // eslint-disable-line

  const doSearch = () => { setPage(1); fetchProducts(1) }

  const toggleSelect = (p: WMProduct) => {
    const id = p.vendor_product_id
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    setSelObjs(prev => { const m = new Map(prev); m.has(id) ? m.delete(id) : m.set(id, p); return m })
  }
  const selectAll = () => {
    setSelected(prev => { const s = new Set(prev); products.forEach(p => s.add(p.vendor_product_id)); return s })
    setSelObjs(prev => { const m = new Map(prev); products.forEach(p => m.set(p.vendor_product_id, p)); return m })
  }
  const clearAll  = () => { setSelected(new Set()); setSelObjs(new Map()) }

  const setC = (k: keyof typeof DEFAULT_CONFIG, v: string | number) =>
    setConfig(prev => ({ ...prev, [k]: v }))

  function autoFill() {
    const prods = [...selObjs.values()]
    if (!prods.length) { onNotify("error", "Chưa chọn sản phẩm"); return }
    const f = prods[0]
    setConfig(prev => ({
      ...prev,
      typeOfSim:      f.sim_type      ?? prev.typeOfSim,
      operatorCode:   "WORLDMOVE",
      networkType:    f.apn_network_type     ?? prev.networkType,
      apn:            f.apn                  ?? prev.apn,
      onsiteCarrier:  f.apn_telecom_providers?.split("\n")[0].trim() ?? f.apn_roaming_carrier ?? prev.onsiteCarrier,
      dataPolicyCode: _deriveDataPolicy(f),
    }))
    onNotify("success", "Đã auto-fill từ sản phẩm đã chọn")
  }

  function buildPreview() {
    if (selObjs.size === 0) { onNotify("error", "Chưa chọn sản phẩm"); return }
    if (!config.supportCountryCode) { onNotify("error", "Nhập Support Country Code (3 ký tự)"); return }
    if (!config.purchaseType_US)    { onNotify("error", "Nhập Purchase Type US"); return }
    if (!config.purchaseType_VN)    { onNotify("error", "Nhập Purchase Type VN"); return }

    const sorted = [...selObjs.values()].sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    const pcUS   = _buildPC(config.purchaseType_US, config)
    const pcVN   = _buildPC(config.purchaseType_VN, config)
    const { fx_twd_usd, fx_usd_vnd } = fxSettings

    const us: PreviewRow[] = sorted.map(p => {
      const cogsUSD = p.cogs != null ? _roundUp(p.cogs * fx_twd_usd, 2) : null
      return {
        sku:        pcUS + _skuSuffix(p),
        name_vn:    _nameVn(p, config),
        name_en:    _nameEn(p, config),
        cogs:       cogsUSD != null ? cogsUSD.toLocaleString() : "—",
        currency:   "USD",
        throttle:   _fmtThrottle(p.throttle_kbps),
        days:       p.days,
        data:       _fmtData(p),
        vendor_sku: p.vendor_product_id,
      }
    })

    const vn: PreviewRow[] = sorted.map(p => {
      const cogsUSD = p.cogs != null ? _roundUp(p.cogs * fx_twd_usd, 2) : null
      const cogsVND = cogsUSD != null ? _roundUp(cogsUSD * fx_usd_vnd, 0) : null
      return {
        sku:        pcVN + _skuSuffix(p),
        name_vn:    _nameVn(p, config),
        name_en:    _nameEn(p, config),
        cogs:       cogsVND != null ? cogsVND.toLocaleString() : "—",
        currency:   "VND",
        throttle:   _fmtThrottle(p.throttle_kbps),
        days:       p.days,
        data:       _fmtData(p),
        vendor_sku: pcUS + _skuSuffix(p),
      }
    })

    setPreviewRows({ us, vn, pcUS, pcVN })
    setPreviewTab("us")
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  async function downloadExcel() {
    if (selObjs.size === 0) { onNotify("error", "Chưa có sản phẩm để tải"); return }
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/template", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          products: [...selObjs.values()],
          config:   { ...config },
          settings: fxSettings,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        onNotify("error", err.error ?? "Hiếu đang fix, vui lòng đợi")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `template_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onNotify("success", `Đã tải template ${selObjs.size} sản phẩm`)
    } catch {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    } finally {
      setGenerating(false)
    }
  }

  const totalPages = Math.ceil(total / WM_PAGE_SIZE)

  return (
    <div className="space-y-5">

      {/* ─── Sub-tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([["create", "Tạo mới"], ["customize", "Tùy chỉnh template"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              subTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>{label}</button>
        ))}
      </div>

      {/* ─── Tùy chỉnh template (placeholder) ─────────────────────── */}
      {subTab === "customize" && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-gray-500 font-medium">Tùy chỉnh cấu trúc template</p>
          <p className="text-sm text-gray-400">Tính năng đang phát triển — cho phép chỉnh sửa format cột, tên sheet, công thức giá trong file Excel xuất ra.</p>
        </div>
      )}

      {subTab === "create" && <>

      {/* ─── NCC Selector ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-700">Nhà cung cấp (NCC):</span>
          {[
            { code: "WM",  name: "WORLDMOVE",      available: true  },
            { code: "3H",  name: "3HK",             available: false },
            { code: "BC",  name: "BILLIONCONNECT",  available: false },
            { code: "SS",  name: "SIMSTORE",        available: false },
          ].map(ncc => (
            <button key={ncc.code}
              onClick={() => ncc.available && setSelectedNCC(ncc.code)}
              disabled={!ncc.available}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                selectedNCC === ncc.code
                  ? "bg-brand-600 text-white border-brand-600"
                  : ncc.available
                  ? "border-gray-200 text-gray-700 hover:border-brand-400"
                  : "border-gray-100 text-gray-300 cursor-not-allowed"
              }`}>
              {ncc.name}
              {!ncc.available && <span className="ml-1.5 text-[10px]">soon</span>}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-2">Hiển thị sản phẩm chưa có trong hệ thống</span>
        </div>
      </div>

      {/* ─── Step 1: Chọn sản phẩm ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
            1. Chọn sản phẩm {selectedNCC}
          </h3>
          {selected.size > 0 && (
            <span className="text-sm font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
              {selected.size} đã chọn
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Tìm product name, ID, region..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select value={filterSim} onChange={e => { setFilterSim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả SIM</option>
            <option value="eSIM">eSIM</option>
            <option value="SIM">SIM</option>
          </select>
          <select value={filterUnlim} onChange={e => { setFilterUnlim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả gói</option>
            <option value="true">Unlimited</option>
            <option value="false">Fixed</option>
          </select>
          <button onClick={doSearch}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors">
            Tìm
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 w-8">
                  <input type="checkbox"
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
                <tr key={p.vendor_product_id}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${selected.has(p.vendor_product_id) ? "bg-brand-50" : ""}`}
                  onClick={() => toggleSelect(p)}
                >
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={selected.has(p.vendor_product_id)}
                      onChange={() => toggleSelect(p)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.vendor_product_id}</td>
                  <td className="px-3 py-2 text-gray-800">{p.product_name}</td>
                  <td className="px-3 py-2 text-gray-500">{p.region}</td>
                  <td className="px-3 py-2 text-gray-500">{p.sim_type}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{p.days}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtWMData(p)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">{p.cogs ? p.cogs.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{selected.size} sản phẩm đã chọn</span>
            <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">Chọn trang này</button>
            {selected.size > 0 && (
              <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Bỏ hết</button>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Trang {page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={15} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Step 2: Cấu hình ──────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">2. Cấu hình Template</h3>
          <button
            onClick={autoFill}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-40"
          >
            ⚡ Auto-fill từ SP đã chọn
          </button>
        </div>

        {/* Required fields */}
        <div>
          <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-2">Bắt buộc nhập</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-brand-50/40 border border-brand-100 rounded-lg">
            <TemplField label="Purchase Type US *" value={config.purchaseType_US} onChange={v => setC("purchaseType_US", v)} placeholder="D" />
            <TemplField label="Purchase Type VN *" value={config.purchaseType_VN} onChange={v => setC("purchaseType_VN", v)} placeholder="3" />
            <TemplField label="Country Code (3 ký tự) *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="TWN" />
            <TemplField label="Data Policy Code *" value={config.dataPolicyCode} onChange={v => setC("dataPolicyCode", v)} placeholder="P" />
            <TemplField label="Tên nước (VN)" value={config.countryNameVn} onChange={v => setC("countryNameVn", v)} placeholder="Đài Loan" />
            <TemplField label="Tên nước (EN)" value={config.countryNameEn} onChange={v => setC("countryNameEn", v)} placeholder="Taiwan" />
          </div>
        </div>

        {/* Auto-fillable fields */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Auto-fill (có thể chỉnh)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <TemplField label="Type of SIM" value={config.typeOfSim} onChange={v => setC("typeOfSim", v)} placeholder="eSIM" />
            <TemplField label="Operator Code" value={config.operatorCode} onChange={v => setC("operatorCode", v)} placeholder="WORLDMOVE" />
            <TemplField label="Network Type" value={config.networkType} onChange={v => setC("networkType", v)} placeholder="4G" />
            <TemplField label="APN" value={config.apn} onChange={v => setC("apn", v)} placeholder="mobile.three.com.hk" />
            <TemplField label="Onsite Carrier" value={config.onsiteCarrier} onChange={v => setC("onsiteCarrier", v)} placeholder="Chunghwa Telecom" />
            <TemplField label="ISO Codes" value={config.isoCodes} onChange={v => setC("isoCodes", v)} placeholder="TW" />
          </div>
        </div>

        {/* Advanced defaults */}
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            ▸ Tuỳ chỉnh nâng cao (ít thay đổi)
          </summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <TemplField label="Product Type" value={config.productType} onChange={v => setC("productType", v)} placeholder="C" />
            <TemplField label="Vendor Code" value={config.vendorCode} onChange={v => setC("vendorCode", v)} placeholder="WM" />
            <TemplField label="Purchase Method" value={config.purchaseMethod} onChange={v => setC("purchaseMethod", v)} placeholder="API Purchase" />
            <TemplField label="SKU Type" value={config.skuType} onChange={v => setC("skuType", v)} placeholder="Base + Datapack" />
            <TemplField label="Import Type" value={config.importType} onChange={v => setC("importType", v)} placeholder="Official" />
            <TemplField label="Daily Reset Time" value={config.dailyResetTime} onChange={v => setC("dailyResetTime", v)} placeholder="UTC+8" />
            <TemplField label="Activation Time" value={config.activationTime} onChange={v => setC("activationTime", v)} placeholder="24h" />
            <TemplField label="Call" value={config.call} onChange={v => setC("call", v)} placeholder="No" />
            <TemplField label="Hotspot" value={config.hotspot} onChange={v => setC("hotspot", v)} placeholder="Yes" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">KYC Needed</label>
              <select value={config.kycNeeded} onChange={e => setC("kycNeeded", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expiration (days)</label>
              <input type="number" value={config.expirationDays}
                onChange={e => setC("expirationDays", parseInt(e.target.value) || 90)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </details>

        <div className="text-xs text-gray-400 pt-1">
          Tỷ giá: 1 TWD = {fxSettings.fx_twd_usd} USD · 1 USD = {fxSettings.fx_usd_vnd} VND
          &nbsp;(từ tab Cài đặt)
        </div>
      </div>

      {/* ─── Step 3: Xem trước ─────────────────────────────────── */}
      <button
        onClick={buildPreview}
        disabled={selected.size === 0}
        className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <FileSpreadsheet size={16} />
        {selected.size === 0 ? "Xem trước (chưa chọn SP)" : `3. Xem trước ${selected.size} sản phẩm`}
      </button>

      {/* ─── Step 4: Preview panel ─────────────────────────────── */}
      {previewRows && (
        <div ref={previewRef} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 flex-wrap gap-3">
            <div className="flex gap-1">
              {([
                { id: "us",   label: `SKU US (${previewRows.us.length})` },
                { id: "vn",   label: `SKU VN (${previewRows.vn.length})` },
                { id: "prod", label: "Product row" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setPreviewTab(t.id)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    previewTab === t.id ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={downloadExcel}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet size={15} />
              {generating ? "Đang tạo..." : "Tải Excel"}
            </button>
          </div>

          <div className="overflow-x-auto p-1">
            {previewTab !== "prod" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["SKU Code","Name VN","Name EN","COGS","Curr.","Days","Data","Throttle","Vendor SKU"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(previewTab === "us" ? previewRows.us : previewRows.vn).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-brand-700 whitespace-nowrap">{r.sku}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.name_vn}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{r.name_en}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.cogs}</td>
                      <td className="px-3 py-2 text-gray-400">{r.currency}</td>
                      <td className="px-3 py-2 text-center">{r.days}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.data}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{r.throttle || "—"}</td>
                      <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">{r.vendor_sku}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {previewTab === "prod" && (
              <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {[
                    ["productCode US", previewRows.pcUS],
                    ["productCode VN", previewRows.pcVN],
                    ["supportCountryCode", config.supportCountryCode],
                    ["supportedCountries (ISO)", config.isoCodes],
                    ["vendorCode", config.vendorCode],
                    ["dataPolicyCode", config.dataPolicyCode],
                    ["typeOfSim", config.typeOfSim],
                    ["operatorCode", config.operatorCode],
                    ["purchaseMethod", config.purchaseMethod],
                    ["skuType", config.skuType],
                    ["importType", config.importType],
                    ["networkType", config.networkType],
                    ["APN", config.apn],
                    ["onsiteCarrier", config.onsiteCarrier],
                    ["dailyResetTime", config.dailyResetTime],
                    ["activationTime", config.activationTime],
                    ["kycNeeded", config.kycNeeded],
                    ["hotspot", config.hotspot],
                    ["call", config.call],
                    ["expirationDays", String(config.expirationDays)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-gray-400 min-w-[160px]">{k}</span>
                      <span className="font-medium text-gray-800">{v || <span className="text-red-400">chưa nhập</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </> /* end subTab === "create" */}
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

// ─────────────────────────────────────────────────────────────────────────────
// Feature C: Promotions Tab (admin CRUD cho telco_perks)
// ─────────────────────────────────────────────────────────────────────────────

interface PromoProduct {
  product_code:        string
  vendor_code:         string | null
  type_of_sim:         string | null
  supported_countries: string | null
  telco_perks:         string | null
  telco_perks_start:   string | null
  telco_perks_end:     string | null
  status:              string | null
  sku_codes:           string[]
}

const PROMO_PAGE_SIZE = 50

function PromotionsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [items,    setItems]    = useState<PromoProduct[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [onlyHas,  setOnlyHas]  = useState(false)
  const [editing,    setEditing]    = useState<string | null>(null)
  const [editVal,    setEditVal]    = useState("")
  const [editStart,  setEditStart]  = useState("")
  const [editEnd,    setEditEnd]    = useState("")
  const [saving,     setSaving]     = useState(false)

  const fetchItems = useCallback(async (pg: number, q: string, has: boolean) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg) })
    if (q)   params.set("search",   q)
    if (has) params.set("only_has", "1")
    const res  = await fetch(`/api/admin/promotions?${params}`)
    const data = await res.json()
    setItems(data.data ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems(page, search, onlyHas) }, [page]) // eslint-disable-line

  const doSearch = () => { setPage(1); fetchItems(1, search, onlyHas) }
  const toggleFilter = () => { const next = !onlyHas; setOnlyHas(next); setPage(1); fetchItems(1, search, next) }

  const startEdit = (p: PromoProduct) => {
    setEditing(p.product_code)
    setEditVal(p.telco_perks ?? "")
    setEditStart(p.telco_perks_start ?? "")
    setEditEnd(p.telco_perks_end ?? "")
  }
  const cancelEdit = () => { setEditing(null); setEditVal(""); setEditStart(""); setEditEnd("") }

  const saveEdit = async (product_code: string) => {
    setSaving(true)
    const res = await fetch("/api/admin/promotions", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        product_code,
        telco_perks:       editVal,
        telco_perks_start: editStart || null,
        telco_perks_end:   editEnd   || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setItems(prev => prev.map(p =>
        p.product_code === product_code
          ? { ...p, telco_perks: editVal.trim() || null, telco_perks_start: editStart || null, telco_perks_end: editEnd || null }
          : p
      ))
      setEditing(null)
      onNotify("success", `Đã lưu khuyến mãi cho ${product_code}`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  const clearPerk = async (product_code: string) => {
    setSaving(true)
    const res = await fetch("/api/admin/promotions", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ product_code, telco_perks: "" }),
    })
    setSaving(false)
    if (res.ok) {
      setItems(prev => prev.map(p =>
        p.product_code === product_code ? { ...p, telco_perks: null } : p
      ))
      onNotify("success", `Đã xóa khuyến mãi cho ${product_code}`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  const totalPages = Math.ceil(total / PROMO_PAGE_SIZE)
  const hasCount   = items.filter(p => p.telco_perks).length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Tìm mã SP hoặc vendor..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button onClick={doSearch}
          className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors">
          Tìm
        </button>
        <button
          onClick={toggleFilter}
          className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
            onlyHas
              ? "bg-brand-50 border-brand-300 text-brand-700"
              : "border-gray-300 text-gray-600 hover:border-gray-400"
          }`}
        >
          {onlyHas ? "Có khuyến mãi" : "Tất cả SP"}
        </button>
        <span className="text-sm text-gray-400">{total} sản phẩm</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">Mã SP</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">SKUs</th>
              <th className="px-4 py-3 font-medium w-1/3">Nội dung + Ngày</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : items.map(p => (
              <tr key={p.product_code} className={`hover:bg-gray-50 transition-colors ${editing === p.product_code ? "bg-brand-50/40" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-brand-700 whitespace-nowrap">{p.product_code}</td>
                <td className="px-4 py-3">
                  {p.vendor_code && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
                      {p.vendor_code}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.type_of_sim}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{(p.sku_codes ?? []).length} SKUs</span>
                </td>
                <td className="px-4 py-3">
                  {editing === p.product_code ? (
                    <div className="space-y-2">
                      <textarea
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Nhập nội dung khuyến mãi..."
                        className="w-full px-3 py-2 text-sm border border-brand-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Từ ngày</label>
                          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Đến ngày</label>
                          <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className={`text-sm whitespace-pre-wrap ${p.telco_perks ? "text-gray-800" : "text-gray-300 italic"}`}>
                        {p.telco_perks || "Chưa có"}
                      </span>
                      {(p.telco_perks_start || p.telco_perks_end) && (
                        <div className="text-[10px] text-gray-400">
                          {p.telco_perks_start ?? "?"} → {p.telco_perks_end ?? "?"}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {editing === p.product_code ? (
                      <>
                        <button
                          onClick={() => saveEdit(p.product_code)}
                          disabled={saving}
                          title="Lưu"
                          className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Hủy"
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(p)}
                          title="Sửa"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        {p.telco_perks && (
                          <button
                            onClick={() => clearPerk(p.product_code)}
                            title="Xóa khuyến mãi"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────
const PERM_FEATURES = [
  { key: "perm_kb_upload",    label: "KB — Upload tài liệu",   desc: "Ai có thể upload PDF/DOCX vào Knowledge Base" },
  { key: "perm_kb_wiki_view", label: "KB — Xem tab Wiki",       desc: "Ai thấy tab Wiki trong trang Kiến Thức" },
  { key: "perm_kb_wiki_edit", label: "KB — Tạo / Sửa Wiki",    desc: "Ai có thể tạo và chỉnh sửa wiki pages" },
  { key: "perm_ncc_import",   label: "NCC — Import dữ liệu",   desc: "Ai có thể upload file NCC để cập nhật giá" },
] as const

const PERM_ROLES = ["manager", "standard"] as const

const PERM_DEFAULTS: Record<string, string[]> = {
  perm_kb_upload:    ["manager"],
  perm_kb_wiki_view: ["manager"],
  perm_kb_wiki_edit: ["manager"],
  perm_ncc_import:   ["manager"],
}

function PermissionsTab({ onNotify }: { onNotify: (type:"success"|"error", text:string) => void }) {
  // perms[key] = set of roles that have this permission (admin always has all)
  const [perms,   setPerms]   = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch("/api/permissions")
      .then(r => r.json())
      .then(d => {
        const p: Record<string, Set<string>> = {}
        for (const f of PERM_FEATURES) {
          const allowed = (d.perms?.[f.key] ?? PERM_DEFAULTS[f.key] ?? []) as string[]
          // Không include "admin" vào Set — admin luôn được prepend khi save
          p[f.key] = new Set(allowed.filter(r => r !== "admin"))
        }
        setPerms(p)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (key: string, role: string) => {
    setPerms(prev => {
      const next = { ...prev, [key]: new Set(prev[key]) }
      if (next[key].has(role)) next[key].delete(role)
      else next[key].add(role)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    const updates = PERM_FEATURES.map(f => ({
      key:   f.key,
      value: ["admin", ...Array.from(perms[f.key] ?? [])].join(","),
    }))
    const res = await fetch("/api/admin/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates }),
    })
    setSaving(false)
    if (res.ok) onNotify("success", "Đã lưu cài đặt phân quyền")
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        <strong>Admin</strong> luôn có toàn quyền và không thể bị giới hạn.
        Bảng này chỉ áp dụng cho <strong>Manager</strong> và <strong>Standard</strong>.
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium w-1/2">Tính năng</th>
              <th className="px-4 py-3 text-center font-medium">Manager</th>
              <th className="px-4 py-3 text-center font-medium">Standard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PERM_FEATURES.map(f => (
              <tr key={f.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-800">{f.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
                </td>
                {PERM_ROLES.map(role => (
                  <td key={role} className="px-4 py-4 text-center">
                    <button
                      onClick={() => toggle(f.key, role)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        perms[f.key]?.has(role)
                          ? "bg-brand-600"
                          : "bg-gray-200"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                        perms[f.key]?.has(role) ? "left-[18px]" : "left-0.5"
                      }`}/>
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <Save size={14}/>{saving ? "Đang lưu..." : "Lưu thay đổi"}
      </button>

      {/* ─── Dept × Tab matrix ─── */}
      <DeptTabMatrix onNotify={onNotify} />
    </div>
  )
}

// Tabs có thể unlock thêm cho standard users theo phòng ban
const DEPT_UNLOCKABLE_TABS = [
  { key: "kb",   label: "Kiến Thức"   },
  { key: "skus", label: "SP Hệ Thống" },
  { key: "ncc",  label: "SP Vendor"   },
] as const

const DEPARTMENTS = [
  { key: "sales",   label: "Sales"   },
  { key: "product", label: "Product" },
  { key: "tech",    label: "Tech"    },
  { key: "finance", label: "Finance" },
] as const

function DeptTabMatrix({ onNotify }: { onNotify: (type: "success"|"error", text: string) => void }) {
  const [matrix, setMatrix]   = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const DEPT_DEFAULTS: Record<string, string[]> = {
    sales:   ["kb"],
    product: ["kb", "skus", "ncc"],
    tech:    ["kb", "skus", "ncc"],
    finance: ["skus"],
  }

  useEffect(() => {
    fetch("/api/permissions")
      .then(r => r.json())
      .then(d => {
        const m: Record<string, Set<string>> = {}
        for (const dept of DEPARTMENTS) {
          const key = `perm_dept_${dept.key}_tabs`
          const tabs = (d.perms?.[key] ?? DEPT_DEFAULTS[dept.key] ?? []) as string[]
          m[dept.key] = new Set(tabs)
        }
        setMatrix(m)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (dept: string, tab: string) => {
    setMatrix(prev => {
      const next = { ...prev, [dept]: new Set(prev[dept]) }
      if (next[dept].has(tab)) next[dept].delete(tab)
      else next[dept].add(tab)
      return next
    })
  }

  const saveDeptMatrix = async () => {
    setSaving(true)
    const updates = DEPARTMENTS.map(d => ({
      key:   `perm_dept_${d.key}_tabs`,
      value: Array.from(matrix[d.key] ?? []).join(","),
    }))
    const res = await fetch("/api/admin/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates }),
    })
    setSaving(false)
    if (res.ok) onNotify("success", "Đã lưu phân quyền phòng ban")
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return null

  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      <div>
        <h4 className="text-sm font-semibold text-gray-700">Phân quyền theo phòng ban</h4>
        <p className="text-xs text-gray-400 mt-0.5">Tabs nào Standard user được xem khi thuộc phòng ban này (ngoài Chatbot, Khuyến Mãi, Thông tin)</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">Phòng ban</th>
              {DEPT_UNLOCKABLE_TABS.map(t => (
                <th key={t.key} className="px-4 py-3 text-center font-medium">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {DEPARTMENTS.map(dept => (
              <tr key={dept.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-700">{dept.label}</td>
                {DEPT_UNLOCKABLE_TABS.map(tab => (
                  <td key={tab.key} className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggle(dept.key, tab.key)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        matrix[dept.key]?.has(tab.key) ? "bg-brand-600" : "bg-gray-200"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
                        matrix[dept.key]?.has(tab.key) ? "left-[18px]" : "left-0.5"
                      }`}/>
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={saveDeptMatrix}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <Save size={14}/>{saving ? "Đang lưu..." : "Lưu phòng ban"}
      </button>
    </div>
  )
}
