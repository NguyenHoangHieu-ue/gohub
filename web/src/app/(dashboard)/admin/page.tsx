"use client"

import { useEffect, useState, useCallback, useRef } from "react"
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
    const params = new URLSearchParams({ page: String(pg), gap: "all" })
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

      {/* ─── Step 1: Chọn sản phẩm ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
            1. Chọn sản phẩm WM
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
