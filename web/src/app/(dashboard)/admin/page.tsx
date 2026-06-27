"use client"

import { Fragment, useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Users, Plus, Key, Trash2, Save, Shield, Settings, FileSpreadsheet, Search, ChevronLeft, ChevronRight, ChevronDown, Gift, Pencil, X, Check, Lock, Clock, Play, RefreshCw, CheckSquare, Square, BookOpen, Eye } from "lucide-react"
import { ALL_ROLES, CONFIGURABLE_ROLES, ROLE_LABELS } from "@/lib/agents/types"
import { ConfirmModal } from "@/components/confirm-modal"

interface User {
  username:           string
  name:               string
  email:              string
  role:               string
  department:         string
  allowed_analytics?: string | null
  allowed_tabs?:      string | null
  created_at:         string
  lark_open_id?:      string
}

// Analytics pages có thể giới hạn per-user (staff/bod) — thứ tự theo sidebar groups
const ANALYTICS_REPORTS = [
  { id: "dashboard",       label: "Dashboard" },
  { id: "bod",             label: "BOD Report" },
  { id: "all-time",        label: "All-Time Report" },
  { id: "channels",        label: "Kênh bán" },
  { id: "b2b",             label: "B2B" },
  { id: "b2c",             label: "B2C" },
  { id: "website",         label: "Website (GA4)" },
  { id: "staff",           label: "Nhân viên" },
  { id: "customers",       label: "Khách hàng" },
  { id: "vendors",         label: "Vendors" },
  { id: "orders",          label: "Đơn hàng" },
  { id: "fulfillment",     label: "Fulfillment" },
  { id: "3hk-usage",       label: "3HK Data Usage" },
  { id: "cs-troubleshoot", label: "CS Troubleshoot" },
  { id: "feedback",        label: "Feedback" },
  { id: "products",        label: "Sản phẩm (BI)" },
  { id: "targets",         label: "KPI / Target" },
  { id: "sql",             label: "SQL Explorer" },
] as const

type Tab = "list" | "add" | "password" | "settings" | "template" | "promotions" | "scheduled"

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin" && session?.user?.role !== "creator") router.push("/chatbot")
  }, [status, session, router])

  if (status !== "authenticated" || (session?.user?.role !== "admin" && session?.user?.role !== "creator")) return null

  return <AdminPanel currentUser={session.user.username} />
}

function roleBadgeClass(role: string): string {
  if (role === "admin")   return "bg-amber-100 text-amber-700"
  if (role === "manager") return "bg-purple-100 text-purple-700"
  if (role === "bod")     return "bg-blue-100 text-blue-700"
  if (role === "staff")   return "bg-teal-100 text-teal-700"
  return "bg-green-100 text-green-700"
}

const VALID_TABS: Tab[] = ["list", "add", "password", "settings", "template", "promotions", "scheduled"]

function AdminPanel({ currentUser }: { currentUser: string }) {
  const [tab, setTab]       = useState<Tab>("list")
  // Cho phép deep-link tab qua URL (?tab=settings) — Users/Settings là tab riêng ở sidebar.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t && VALID_TABS.includes(t as Tab)) setTab(t as Tab)
  }, [])
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

  const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
    list:        { label: "Người dùng & Phân quyền", icon: <Users     size={15} /> },
    add:         { label: "Thêm user",    icon: <Plus            size={15} /> },
    password:    { label: "Đổi password", icon: <Key             size={15} /> },
    settings:    { label: "Cài đặt",      icon: <Settings        size={15} /> },
    template:    { label: "Tạo template", icon: <FileSpreadsheet size={15} /> },
    promotions:  { label: "Khuyến mãi",   icon: <Gift            size={15} /> },
    scheduled:   { label: "Lịch Lark",    icon: <Clock           size={15} /> },
  }
  // Nhóm 3 cụm — mỗi tab vẫn 1-click, gọn + responsive (icon-only trên mobile)
  const TAB_GROUPS: { label: string; tabs: Tab[] }[] = [
    { label: "Người dùng", tabs: ["list", "add", "password"] },
    { label: "Hệ thống",   tabs: ["settings"] },
    { label: "Công cụ",    tabs: ["template", "promotions", "scheduled"] },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Quản Trị Hệ Thống</h1>
          <p className="text-xs text-gray-500 leading-tight">{TAB_META[tab].label}</p>
        </div>
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

      {/* Tab bar — 3 cụm segmented có nhãn (chunking), mỗi tab 1-click; icon-only trên mobile */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {TAB_GROUPS.map(group => (
          <div key={group.label} className="flex items-center gap-1.5">
            <span className="hidden lg:inline text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</span>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {group.tabs.map(id => (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={TAB_META[id].label}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  tab === id
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {TAB_META[id].icon}
                <span className="hidden md:inline">{TAB_META[id].label}</span>
              </button>
            ))}
            </div>
          </div>
        ))}
      </div>

      {tab === "list"       && <UserList users={users} loading={loading} currentUser={currentUser} onRefresh={fetchUsers} onNotify={notify} />}
      {tab === "add"        && <AddUser   onRefresh={fetchUsers} onNotify={notify} setTab={setTab} />}
      {tab === "password"   && <ChangePassword users={users} onNotify={notify} />}
      {tab === "settings"     && <SettingsTab     onNotify={notify} />}
      {tab === "template"     && <TemplateTab     onNotify={notify} />}
      {tab === "promotions" && <PromotionsTab onNotify={notify} />}
      {tab === "scheduled"  && <ScheduledTab  onNotify={notify} />}
    </div>
  )
}

const PM_TABS = [
  { key: "kb",   label: "Kiến Thức"   },
  { key: "skus", label: "SP Hệ Thống" },
  { key: "ncc",  label: "SP Vendor"   },
] as const

// Tab gộp: chọn account → phân role/phòng ban + tích trang Analytics & tab PM → Cập nhật.
// Ma trận phân quyền hệ thống giữ ở mục "nâng cao" bên dưới.
function UserList({ users, loading, currentUser, onRefresh, onNotify }: {
  users:       User[]
  loading:     boolean
  currentUser: string
  onRefresh:   () => void
  onNotify:    (type: "success" | "error", text: string) => void
}) {
  const [selected,     setSelected]     = useState<string>("")
  const [role,         setRole]         = useState<string>("staff")
  const [department,   setDepartment]   = useState<string>("none")
  const [tabs,         setTabs]         = useState<Set<string>>(new Set())
  const [saving,       setSaving]       = useState(false)
  const [confirmDel,   setConfirmDel]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [search,       setSearch]       = useState("")

  const filteredUsers = search
    ? users.filter(u => (u.name||"").toLowerCase().includes(search.toLowerCase()) || (u.email||"").toLowerCase().includes(search.toLowerCase()) || (u.role||"").toLowerCase().includes(search.toLowerCase()))
    : users

  const user = users.find(u => u.username === selected) || null

  // Nạp draft mỗi khi chọn account (hoặc data refresh)
  useEffect(() => {
    if (!user) return
    setRole(user.role)
    setDepartment(user.department ?? "none")
    setTabs(new Set(user.allowed_tabs != null
      ? user.allowed_tabs.split(",").filter(Boolean)
      : PM_TABS.map(t => t.key)))
  }, [selected, users]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTab = (key: string) =>
    setTabs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const save = async () => {
    if (!user) return
    setSaving(true)
    const tIds = PM_TABS.filter(t => tabs.has(t.key)).map(t => t.key)
    const allowed_tabs = tIds.join(",")
    const res = await fetch(`/api/admin/users/${user.username}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      // allowed_analytics không thay đổi từ đây — quản lý tại /analytics/users
      body:    JSON.stringify({ role, department, allowed_analytics: user.allowed_analytics || null, allowed_tabs }),
    })
    setSaving(false)
    if (res.ok) { onRefresh(); onNotify("success", `Đã cập nhật quyền cho ${user.username}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  const del = async () => {
    if (!user) return
    setDeleting(true)
    const res = await fetch(`/api/admin/users/${user.username}`, { method: "DELETE" })
    setDeleting(false); setConfirmDel(false)
    if (res.ok) { const u = user.username; setSelected(""); onRefresh(); onNotify("success", `Đã xóa user ${u}`) }
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Đang tải...</div>

  const selectCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
  const isFullTabs = tabs.size === PM_TABS.length

  const ToggleCell = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
        on ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {on ? <CheckSquare className="w-4 h-4 shrink-0 text-blue-600" /> : <Square className="w-4 h-4 shrink-0 text-slate-300" />}
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
  )

  return (
    <div className="space-y-5">
      <ConfirmModal
        open={confirmDel}
        loading={deleting}
        title="Xóa user"
        message={`Xóa tài khoản "${user?.username}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa user"
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />

      {/* Bước 1: chọn account */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex-1">Chọn tài khoản ({users.length})</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên / email…" className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none w-48" />
        </div>
        <div>
          <select value={selected} onChange={e => setSelected(e.target.value)} className={selectCls}>
            <option value="">— Chọn tài khoản để phân quyền —</option>
            {filteredUsers.map(u => (
              <option key={u.username} value={u.username}>
                {u.name || u.username}{u.username === currentUser ? " · bạn" : ""}
              </option>
            ))}
          </select>
        </div>

        {!user ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Chọn một tài khoản ở trên để bắt đầu phân quyền</p>
            <p className="text-xs text-slate-400 mt-1">Phân vai trò, phòng ban và tích chọn trang/tab được phép truy cập.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Role + phòng ban */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vai trò (Role)</label>
                <select value={role} onChange={e => setRole(e.target.value)} className={`mt-1.5 ${selectCls}`}>
                  {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phòng ban</label>
                <select value={department} onChange={e => setDepartment(e.target.value)} className={`mt-1.5 ${selectCls}`}>
                  <option value="none">Không phòng ban</option>
                  <option value="sales">Sales</option>
                  <option value="product">Product</option>
                  <option value="tech">Tech</option>
                  <option value="finance">Finance</option>
                </select>
              </div>
            </div>

            {/* Analytics → link sang /analytics/users */}
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50/60 border border-blue-100 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-700">Phân quyền Analytics & BI</p>
                <p className="text-xs text-slate-400">Cấp trang báo cáo + ma trận Role × Report tại trang quản lý người dùng Analytics</p>
              </div>
              <a href="/analytics/users" className="flex items-center gap-1.5 px-4 py-2 bg-[#003B95] text-white rounded-xl text-xs font-bold hover:bg-[#002B70] whitespace-nowrap">
                Quản lý Analytics →
              </a>
            </div>

            {/* Tab quản lý (PM) */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-700">Tab quản lý (PM)</p>
                  <p className="text-xs text-slate-400">Áp dụng cho Standard · tích tab nào thì user thấy đúng tab đó</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{tabs.size}/{PM_TABS.length}</span>
                  <button onClick={() => setTabs(new Set(PM_TABS.map(t => t.key)))} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold">Chọn tất cả</button>
                  <button onClick={() => setTabs(new Set())} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold">Bỏ chọn</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PM_TABS.map(t => (
                  <ToggleCell key={t.key} on={tabs.has(t.key)} label={t.label} onClick={() => toggleTab(t.key)} />
                ))}
              </div>
              {isFullTabs
                ? <p className="text-[11px] text-emerald-600 mt-1.5">Cấp đủ 3 tab quản lý cho user này.</p>
                : tabs.size === 0 && <p className="text-[11px] text-slate-400 mt-1.5">Không cấp tab quản lý nào (chỉ giữ các tab mặc định: GoHub AI, Promotions, Reference).</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              {user.username !== currentUser ? (
                <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:text-rose-600 px-2 py-2">
                  <Trash2 size={15} /> Xóa user
                </button>
              ) : <span className="text-xs text-slate-400">Tài khoản của bạn</span>}
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                <Save size={14} />{saving ? "Đang lưu..." : "Cập nhật"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nâng cao: ma trận phân quyền hệ thống */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <button onClick={() => setAdvancedOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Lock className="w-4 h-4" /></div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-700">Phân quyền hệ thống (nâng cao)</p>
              <p className="text-xs text-slate-400">Ma trận Role × Tính năng và Phòng ban × Tab — quy tắc chung</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
        {advancedOpen && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-5">
            <PermissionsTab onNotify={onNotify} />
          </div>
        )}
      </div>
    </div>
  )
}

function AddUser({ onRefresh, onNotify, setTab }: {
  onRefresh: () => void
  onNotify:  (type: "success" | "error", text: string) => void
  setTab:    (t: Tab) => void
}) {
  const [form, setForm]   = useState({ username: "", name: "", email: "", role: "staff", password: "", confirm: "" })
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
      setForm({ username: "", name: "", email: "", role: "staff", password: "", confirm: "" })
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
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
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

      {/* Partner Tiers */}
      <PartnerTiersSection onNotify={onNotify} />

      {/* SKU Destination rule */}
      <SkuDestinationSection onNotify={onNotify} />

      {/* Role data filters cho BI Analyst */}
      <RoleFiltersSection onNotify={onNotify} />

      {/* Guardian — kiểm soát quyền hạn câu hỏi chatbot theo role × loại thông tin */}
      <AccessPolicySection onNotify={onNotify} />

      {/* KPI Target B2C (theo tháng × VN/US/Total) */}
      <B2CKpiSection onNotify={onNotify} />

      {/* Ngân sách Marketing B2C (theo tháng) — tính spend pace */}
      <B2CBudgetSection onNotify={onNotify} />
    </div>
  )
}

// Ngân sách marketing B2C kế hoạch theo tháng (VND) — Section 5 dùng tính spend pace = spend / budget.
function B2CBudgetSection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const [budget, setBudget] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const now = new Date()
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `Thg ${parseInt(mo)}/${y}` }

  useEffect(() => {
    fetch("/api/config/b2c-budget")
      .then(r => r.json())
      .then(d => { setBudget(d || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    const cleaned: Record<string, number> = {}
    for (const [m, v] of Object.entries(budget)) if (v > 0) cleaned[m] = v
    const res = await fetch("/api/config/b2c-budget", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleaned),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu ngân sách B2C" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Ngân sách Marketing B2C</h3>
        <p className="text-xs text-gray-400 mt-0.5">Ngân sách kế hoạch theo tháng (VND). Hiển thị ở Section 5 /analytics/b2c — tính spend pace = chi phí thực tế ÷ ngân sách.</p>
      </div>
      {loading ? <div className="h-28 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {months.map(m => (
              <div key={m} className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 w-24">{monthLabel(m)}</label>
                <input
                  type="number" min={0} step="any"
                  value={budget[m] || ""}
                  onChange={e => setBudget(b => ({ ...b, [m]: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="flex-1 px-3 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu ngân sách"}
          </button>
        </>
      )}
    </div>
  )
}

// KPI target doanh thu B2C theo tháng × thị trường (VN / US / Total) — bind tab KPI ở /analytics/b2c.
// Lưu app_settings key b2c_kpi_targets = { "YYYY-MM": { vn, us, total } }.
function B2CKpiSection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  type Cell = { vn: number; us: number; total: number }
  const [targets, setTargets] = useState<Record<string, Cell>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // Cùng cửa sổ 6 tháng với dashboard B2C (5 tháng trước + tháng hiện tại) để admin nhập đúng tháng hiển thị.
  const now = new Date()
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `Thg ${parseInt(mo)}/${y}` }

  useEffect(() => {
    fetch("/api/config/b2c-kpi-targets")
      .then(r => r.json())
      .then(d => { setTargets(d || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const cell = (m: string): Cell => targets[m] ?? { vn: 0, us: 0, total: 0 }
  const setField = (m: string, k: keyof Cell, v: number) =>
    setTargets(t => ({ ...t, [m]: { ...cell(m), [k]: v } }))

  const save = async () => {
    setSaving(true)
    // Bỏ tháng toàn 0 cho gọn payload
    const cleaned: Record<string, Cell> = {}
    for (const [m, c] of Object.entries(targets)) {
      if ((c?.vn || 0) + (c?.us || 0) + (c?.total || 0) > 0) cleaned[m] = c
    }
    const res = await fetch("/api/config/b2c-kpi-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu KPI target B2C" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">KPI Target B2C</h3>
        <p className="text-xs text-gray-400 mt-0.5">Target doanh thu B2C theo tháng × thị trường (VND). Hiển thị ở tab KPI của /analytics/b2c — so MTD/Prorata vs target.</p>
      </div>
      {loading ? <div className="h-32 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-left font-semibold px-2 py-2 text-xs uppercase tracking-wider">Tháng</th>
                  <th className="text-right font-semibold px-2 py-2 text-xs">VN</th>
                  <th className="text-right font-semibold px-2 py-2 text-xs">US</th>
                  <th className="text-right font-semibold px-2 py-2 text-xs">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {months.map(m => {
                  const c = cell(m)
                  return (
                    <tr key={m}>
                      <td className="px-2 py-2 font-medium text-slate-700">{monthLabel(m)}</td>
                      {(["vn", "us", "total"] as const).map(k => (
                        <td key={k} className="px-2 py-2 text-right">
                          <input
                            type="number" min={0} step="any"
                            value={c[k] || ""}
                            onChange={e => setField(m, k, parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-32 px-2 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu KPI target"}
          </button>
        </>
      )}
    </div>
  )
}

// Giới hạn dữ liệu theo vai trò cho BI Analyst — inject "DATA ACCESS RESTRICTION" vào prompt.
// admin = toàn quyền (không cần nhập). Để trống = không giới hạn role đó.
function RoleFiltersSection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const ROLES: { key: string; label: string }[] = CONFIGURABLE_ROLES.map(r => ({ key: r, label: ROLE_LABELS[r] ?? r }))
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetch("/api/config/role-filters")
      .then(r => r.json())
      .then(d => { setFilters(d || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch("/api/config/role-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu giới hạn dữ liệu theo vai trò" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Giới hạn dữ liệu BI theo vai trò</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Điều kiện lọc (SQL hoặc mô tả) áp cho chatbot BI Analyst với từng role. Admin luôn toàn quyền. Để trống = không giới hạn.
        </p>
      </div>
      {loading ? <div className="h-32 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          <div className="space-y-3">
            {ROLES.map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <textarea
                  rows={2}
                  value={filters[key] ?? ""}
                  onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`VD: chỉ kênh B2C — UPPER(s.group_name)='B2C'  ·  hoặc mô tả: chỉ xem doanh thu kênh mình phụ trách`}
                  className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Điều kiện được chèn vào prompt BI dưới dạng "DATA ACCESS RESTRICTION" — AI bắt buộc thêm vào WHERE mọi câu SQL.
            Đây là lớp hướng dẫn ở prompt (mềm), nên viết điều kiện rõ ràng, dùng đúng cột schema gohub_dw.
          </p>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu giới hạn"}
          </button>
        </>
      )}
    </div>
  )
}

// Guardian — ma trận quyền hạn câu hỏi chatbot (role × loại thông tin).
// Click ô để xoay vòng trạng thái: Cho phép → Từ chối → Theo phòng ban → ...
// admin/manager luôn toàn quyền (không cấu hình ở đây).
function AccessPolicySection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  type Decision = "allow" | "deny" | "dept"
  const CATEGORIES: { key: string; label: string }[] = [
    { key: "product_catalog",        label: "Sản phẩm / Catalog NCC" },
    { key: "revenue_bi",             label: "Doanh thu / Đơn hàng (BI)" },
    { key: "margin_cogs",            label: "Giá vốn / Lợi nhuận" },
    { key: "staff_hr",               label: "Nhân sự / Hiệu suất NV" },
    { key: "customer_pii",           label: "Thông tin khách hàng (PII)" },
    { key: "internal_kb_other_dept", label: "Tài liệu phòng ban" },
    { key: "system_internal",        label: "Nội bộ hệ thống" },
    { key: "general",                label: "Chung / Chào hỏi" },
  ]
  const ROLES: { key: string; label: string }[] = CONFIGURABLE_ROLES.map(r => ({ key: r, label: ROLE_LABELS[r] ?? r }))
  // Khớp DEFAULT_POLICY trong guardian.ts (để admin thấy mặc định khi chưa cấu hình)
  const DEFAULTS: Record<string, Record<string, Decision>> = {
    product_catalog:        { bod: "allow", staff: "allow" },
    revenue_bi:             { bod: "allow", staff: "allow" },
    margin_cogs:            { bod: "allow", staff: "deny"  },
    staff_hr:               { bod: "allow", staff: "deny"  },
    customer_pii:           { bod: "allow", staff: "deny"  },
    internal_kb_other_dept: { bod: "allow", staff: "dept"  },
    system_internal:        { bod: "deny",  staff: "deny"  },
    general:                { bod: "allow", staff: "allow" },
  }
  // Điền mặc định role phòng/nhân viên = giống "staff" (hr ngoại lệ: staff_hr = allow). Khớp guardian.ts.
  for (const cat of Object.keys(DEFAULTS)) {
    const base = DEFAULTS[cat].staff
    for (const r of ["b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"]) DEFAULTS[cat][r] = base
    if (cat === "staff_hr") DEFAULTS[cat].hr = "allow"
  }

  const [policy, setPolicy] = useState<Record<string, Record<string, Decision>>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetch("/api/config/access-policy")
      .then(r => r.json())
      .then(d => {
        // Merge cấu hình đã lưu lên trên mặc định
        const merged: Record<string, Record<string, Decision>> = {}
        for (const { key } of CATEGORIES) merged[key] = { ...DEFAULTS[key], ...(d?.[key] ?? {}) }
        setPolicy(merged); setLoading(false)
      })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cycle = (cat: string, role: string) => {
    setPolicy(p => {
      const cur = p[cat]?.[role] ?? "allow"
      const next: Decision = cur === "allow" ? "deny" : cur === "deny" ? "dept" : "allow"
      return { ...p, [cat]: { ...p[cat], [role]: next } }
    })
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch("/api/config/access-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu chính sách quyền hạn chatbot" : "Hiếu đang fix, vui lòng đợi")
  }

  const cellStyle = (d: Decision) =>
    d === "allow" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : d === "deny" ? "bg-red-100 text-red-700 border-red-200"
    : "bg-blue-100 text-blue-700 border-blue-200"
  const cellLabel = (d: Decision) => d === "allow" ? "Cho phép" : d === "deny" ? "Từ chối" : "Theo phòng ban"

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Shield size={16} className="text-brand-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Quyền hạn câu hỏi Chatbot (Guardian)</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Chặn câu hỏi vượt quyền / khác phòng ban theo vai trò. Bấm ô để đổi trạng thái. Admin & Manager luôn toàn quyền.
          </p>
        </div>
      </div>
      {loading ? <div className="h-48 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Loại thông tin</th>
                  {ROLES.map(r => (
                    <th key={r.key} className="text-center py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(c => (
                  <tr key={c.key} className="border-t border-slate-100">
                    <td className="py-2 px-2 text-slate-700 font-medium">{c.label}</td>
                    {ROLES.map(r => {
                      const d = policy[c.key]?.[r.key] ?? "allow"
                      return (
                        <td key={r.key} className="py-1.5 px-2 text-center">
                          <button
                            onClick={() => cycle(c.key, r.key)}
                            className={`min-w-[96px] px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${cellStyle(d)}`}
                          >
                            {cellLabel(d)}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            <b>Cho phép</b>: trả lời bình thường · <b>Từ chối</b>: chặn lịch sự, không gọi agent ·
            <b> Theo phòng ban</b>: chỉ cho phép khi câu hỏi thuộc đúng phòng ban của user (dept "all" = xem tất cả).
            Câu hỏi không nhạy cảm hoặc không phân loại chắc chắn sẽ luôn được cho qua (nới, tránh chặn nhầm).
          </p>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu chính sách"}
          </button>
        </>
      )}
    </div>
  )
}

// Quy tắc trích mã vùng (region) từ SKU — dùng trong các report (Products, BOD...)
function SkuDestinationSection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const [rule, setRule]   = useState<{ prefix: string; codeLength: number; offset: number }>({ prefix: "E", codeLength: 3, offset: 3 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetch("/api/config/sku-destination-rule")
      .then(r => r.json())
      .then(d => { setRule({ prefix: d.prefix ?? "E", codeLength: d.codeLength ?? 3, offset: d.offset ?? 3 }); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch("/api/config/sku-destination-rule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu quy tắc mã vùng SKU" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Quy tắc trích mã vùng SKU</h3>
        <p className="text-xs text-gray-400 mt-0.5">Cách lấy mã quốc gia/vùng từ SKU để gom doanh thu theo điểm đến trong các báo cáo.</p>
      </div>
      {loading ? <div className="h-20 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ký tự đầu (prefix)</label>
              <input
                value={rule.prefix}
                maxLength={1}
                onChange={e => setRule(r => ({ ...r, prefix: e.target.value.toUpperCase() }))}
                className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vị trí bắt đầu (offset)</label>
              <input
                type="number" min={0} max={10}
                value={rule.offset}
                onChange={e => setRule(r => ({ ...r, offset: parseInt(e.target.value) || 0 }))}
                className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Số ký tự mã vùng</label>
              <input
                type="number" min={1} max={5}
                value={rule.codeLength}
                onChange={e => setRule(r => ({ ...r, codeLength: parseInt(e.target.value) || 1 }))}
                className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Quy tắc: SKU bắt đầu <b>1–6</b> (Gohub VN) hoặc <b>A–E</b> (Gohub Inc) → lấy 3 ký tự từ vị trí 4.
            Nếu bắt đầu bằng <b>{rule.prefix || "E"}</b> → lấy <b>{rule.codeLength}</b> ký tự từ vị trí <b>{rule.offset + 1}</b>.
            Còn lại → lấy 3 ký tự đầu.
          </p>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu quy tắc"}
          </button>
        </>
      )}
    </div>
  )
}

function PartnerTiersSection({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const [tiers, setTiers]       = useState<Record<string, string[]>>({})
  const [channels, setChannels] = useState<string[]>([])
  const [newTier, setNewTier]   = useState("")
  const [addInputs, setAddInputs] = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch("/api/config/partner-tiers")
      .then(r => r.json())
      .then(d => { setTiers(d && typeof d === "object" ? d : { Strategic: [] }); setLoading(false) })
      .catch(() => { setTiers({ Strategic: [] }); setLoading(false) })
    // gợi ý tên kênh khi thêm partner (datalist)
    fetch("/api/channels")
      .then(r => r.ok ? r.json() : [])
      .then((d: any) => {
        const list = Array.isArray(d) ? d : (d?.channels ?? [])
        const names = list.map((c: any) => typeof c === "string" ? c : (c.channel_name ?? c.channel ?? c.name)).filter(Boolean)
        setChannels(Array.from(new Set(names)) as string[])
      })
      .catch(() => {})
  }, [])

  const addTier = () => {
    const name = newTier.trim()
    if (!name) return
    if (tiers[name]) { onNotify("error", `Nhóm "${name}" đã tồn tại`); return }
    setTiers(prev => ({ ...prev, [name]: [] }))
    setNewTier("")
  }
  const deleteTier = (tier: string) =>
    setTiers(prev => { const n = { ...prev }; delete n[tier]; return n })
  const addPartner = (tier: string) => {
    const name = (addInputs[tier] || "").trim()
    if (!name) return
    setTiers(prev => prev[tier]?.includes(name) ? prev : { ...prev, [tier]: [...(prev[tier] || []), name] })
    setAddInputs(prev => ({ ...prev, [tier]: "" }))
  }
  const removePartner = (tier: string, name: string) =>
    setTiers(prev => ({ ...prev, [tier]: (prev[tier] || []).filter(p => p !== name) }))

  const save = async () => {
    setSaving(true)
    const res = await fetch("/api/config/partner-tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tiers),
    })
    setSaving(false)
    onNotify(res.ok ? "success" : "error", res.ok ? "Đã lưu Partner Tiers" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Channel &amp; Customer Tiers</h3>
        <p className="text-xs text-gray-400 mt-0.5">Phân loại đối tác chiến lược (Strategic Partners). Mỗi nhóm hiển thị riêng trong báo cáo B2B.</p>
      </div>

      <datalist id="channel-suggestions">
        {channels.map(c => <option key={c} value={c} />)}
      </datalist>

      {loading ? <div className="h-32 bg-gray-50 rounded-lg animate-pulse" /> : (
        <>
          {/* Thêm nhóm mới */}
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tên nhóm mới</label>
              <input
                value={newTier}
                onChange={e => setNewTier(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTier()}
                placeholder="VD: Strategic, Preferred..."
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button onClick={addTier} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg">
              <Plus size={14} /> Thêm nhóm
            </button>
          </div>

          {/* Các nhóm tier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(tiers).sort().map(tier => (
              <div key={tier} className="flex flex-col bg-slate-50 rounded-xl border border-slate-100">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">{tier}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500">{(tiers[tier] || []).length} đối tác</span>
                    <button onClick={() => deleteTier(tier)} title="Xóa nhóm" className="text-slate-300 hover:text-rose-500"><X className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-3 flex-1 space-y-1.5 max-h-56 overflow-y-auto">
                  {(tiers[tier] || []).length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-4">Chưa có đối tác nào</p>
                  ) : (tiers[tier] || []).map(p => (
                    <div key={p} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="text-xs text-slate-600 truncate">{p}</span>
                      <button onClick={() => removePartner(tier, p)} className="text-slate-300 hover:text-rose-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                  <input
                    list="channel-suggestions"
                    value={addInputs[tier] || ""}
                    onChange={e => setAddInputs(prev => ({ ...prev, [tier]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addPartner(tier)}
                    placeholder="Thêm đối tác (gõ hoặc chọn kênh)..."
                    className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button onClick={() => addPartner(tier)} className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shrink-0"><Plus size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? "Đang lưu..." : "Lưu Partner Tiers"}
          </button>
        </>
      )}
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

// ─── 3HK types & helpers ──────────────────────────────────────────────────────

interface ThreeHKZone {
  zone:             string
  country:          string
  network?:         string
  price_per_gb_hkd: number
  is_kyc?:          boolean
}

interface ZoneGroup {
  zone:        string
  countries:   string[]
  price_per_gb: number
}

interface ThreeHKCombo {
  combo_type:       "daily" | "fixed" | "unlimited"
  data_gb:          number | null
  days:             number
  throttle_mbps:    number | null
  data_policy_code: string
  vendor_sku:       string
  cogs_usd:         number
  cogs_vnd:         number
}

const DAILY_DATA_OPTIONS = [1, 2, 3]
const FIXED_DATA_OPTIONS = [5, 10, 20]
const DAY_OPTIONS        = [3, 5, 7, 10, 15, 30]

function get3HKDataPolicyCode(
  combo_type: "daily" | "fixed" | "unlimited",
  throttle_mbps: number | null
): string {
  if (combo_type === "fixed")     return "F"
  if (combo_type === "daily")     return "P"
  if (combo_type === "unlimited") return throttle_mbps === 10 ? "B" : "A"
  return "P"
}

function compute3HKCogs(
  combo_type:       "daily" | "fixed" | "unlimited",
  data_gb:          number | null,
  days:             number,
  throttle_mbps:    number | null,
  price_per_gb_hkd: number,
  fx_hkd_usd:       number,
  fx_usd_vnd:       number
): { cogs_usd: number; cogs_vnd: number } {
  let cogs_hkd: number
  if (combo_type === "fixed") {
    cogs_hkd = (data_gb ?? 0) * price_per_gb_hkd * 0.55
  } else if (combo_type === "daily") {
    cogs_hkd = (data_gb ?? 0) * days * price_per_gb_hkd * 0.40
  } else {
    const daily_util = throttle_mbps === 10 ? 1.8 : 1.6
    cogs_hkd = daily_util * days * price_per_gb_hkd * 0.40
  }
  const cogs_usd = Math.ceil(cogs_hkd * fx_hkd_usd * 100) / 100
  const cogs_vnd = Math.ceil(cogs_usd * fx_usd_vnd)
  return { cogs_usd, cogs_vnd }
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [fxSettings, setFxSettings] = useState({ fx_usd_vnd: 26394, fx_twd_usd: 0.03165, fx_hkd_usd: 0.1282 })
  const [previewRows, setPreviewRows] = useState<{ us: PreviewRow[]; vn: PreviewRow[]; pcUS: string; pcVN: string } | null>(null)
  const [previewTab, setPreviewTab]   = useState<"us" | "vn" | "prod">("us")
  const previewRef = useRef<HTMLDivElement>(null)

  // 3HK state
  const [zoneGroups,       setZoneGroups]       = useState<ZoneGroup[]>([])
  const [loadingZones,     setLoadingZones]      = useState(false)
  const [selectedZone,     setSelectedZone]      = useState<ZoneGroup | null>(null)
  const [dailyGB,          setDailyGB]           = useState<Set<number>>(new Set([1, 2, 3]))
  const [fixedGB,          setFixedGB]           = useState<Set<number>>(new Set([5, 10, 20]))
  const [unlimitedEnabled, setUnlimitedEnabled]  = useState(true)
  const [selectedDays,     setSelectedDays]      = useState<Set<number>>(new Set([3, 5, 7, 10, 15, 30]))
  const [unlimThrottle,    setUnlimThrottle]     = useState<10 | 5>(5)
  const [includeSIM,       setIncludeSIM]        = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        const rows: AppSetting[] = d.settings ?? []
        const usd_vnd = rows.find(s => s.key === "fx.usd_vnd")
        const twd_usd = rows.find(s => s.key === "fx.twd_usd")
        const hkd_usd = rows.find(s => s.key === "fx.hkd_usd")
        setFxSettings({
          fx_usd_vnd: usd_vnd ? parseFloat(usd_vnd.value) : 26394,
          fx_twd_usd: twd_usd ? parseFloat(twd_usd.value) : 0.03165,
          fx_hkd_usd: hkd_usd ? parseFloat(hkd_usd.value) : 0.1282,
        })
      })
  }, [])

  const fetchProducts = useCallback(async (pg: number) => {
    setLoadingP(true)
    // Tạo mới: mặc định chỉ show sản phẩm chưa có trong hệ thống
    const params = new URLSearchParams({ page: String(pg), gap: "not_in_system" })
    if (searchQ)      params.set("search",       searchQ)
    if (filterSim)    params.set("sim_type",      filterSim)
    if (filterUnlim)  params.set("data_type", filterUnlim)
    const res = await fetch(`/api/ncc/worldmove?${params}`)
    const d   = await res.json()
    setProducts(d.data ?? [])
    setTotal(d.total ?? 0)
    setLoadingP(false)
  }, [searchQ, filterSim, filterUnlim])

  useEffect(() => { fetchProducts(page) }, [page]) // eslint-disable-line

  // Fetch 3HK zones khi switch sang 3H
  useEffect(() => {
    if (selectedNCC !== "3H" || zoneGroups.length > 0) return
    setLoadingZones(true)
    fetch("/api/ncc/3hk-zones")
      .then(r => r.json())
      .then(d => {
        const raw: ThreeHKZone[] = d.data ?? []
        const map = new Map<string, ZoneGroup>()
        for (const z of raw) {
          if (!map.has(z.zone))
            map.set(z.zone, { zone: z.zone, countries: [], price_per_gb: z.price_per_gb_hkd })
          map.get(z.zone)!.countries.push(z.country)
        }
        setZoneGroups(Array.from(map.values()))
      })
      .catch(() => {})
      .finally(() => setLoadingZones(false))
  }, [selectedNCC]) // eslint-disable-line

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

  // ─── 3HK helpers ──────────────────────────────────────────────────────────

  function build3HKCombos(): ThreeHKCombo[] {
    if (!selectedZone) return []
    const { fx_hkd_usd, fx_usd_vnd } = fxSettings
    const sortedDays = Array.from(selectedDays).sort((a, b) => a - b)
    const combos: ThreeHKCombo[] = []

    for (const gb of Array.from(dailyGB).sort((a, b) => a - b)) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("daily", null)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("daily", gb, d, null, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "daily", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-D${gb}GB-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    for (const gb of Array.from(fixedGB).sort((a, b) => a - b)) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("fixed", null)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("fixed", gb, d, null, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "fixed", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-F${gb}GB-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    if (unlimitedEnabled) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("unlimited", unlimThrottle)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("unlimited", null, d, unlimThrottle, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "unlimited", data_gb: null, days: d, throttle_mbps: unlimThrottle, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-UNL${unlimThrottle}M-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    return combos
  }

  function build3HKPreview() {
    if (!selectedZone)              { onNotify("error", "Chưa chọn zone"); return }
    if (!config.supportCountryCode) { onNotify("error", "Nhập Country Code (3 ký tự)"); return }
    if (dailyGB.size === 0 && fixedGB.size === 0 && !unlimitedEnabled) { onNotify("error", "Chưa chọn loại data"); return }
    if (selectedDays.size === 0)    { onNotify("error", "Chưa chọn số ngày"); return }

    const combos = build3HKCombos()
    const typeOfSim = config.typeOfSim || "eSIM"
    const vnName = config.countryNameVn
    const enName = config.countryNameEn

    const toRow = (c: ThreeHKCombo, tenant: "US" | "VN"): PreviewRow => {
      const pc = (tenant === "US" ? config.purchaseType_US : config.purchaseType_VN)
        + config.productType + config.supportCountryCode + "3D" + c.data_policy_code
      const suffix = _dataAmountCode(c.data_gb, c.combo_type === "unlimited") + _zeroPad(c.days, 2)
      const dStr   = _zeroPad(c.days, 2)
      const nameVn = c.combo_type === "unlimited" ? `${typeOfSim} ${vnName} Unlimited ${dStr} Ngày`
                   : c.combo_type === "daily"     ? `${typeOfSim} ${vnName} ${c.data_gb}GB/Ngày ${dStr} Ngày`
                   :                                `${typeOfSim} ${vnName} ${c.data_gb}GB ${dStr} Ngày`
      const nameEn = c.combo_type === "unlimited" ? `${typeOfSim} ${enName} Unlimited ${dStr} Days`
                   : c.combo_type === "daily"     ? `${typeOfSim} ${enName} ${c.data_gb}GB/Day ${dStr} Days`
                   :                                `${typeOfSim} ${enName} ${c.data_gb}GB ${dStr} Days`
      const pcUS = config.purchaseType_US + config.productType + config.supportCountryCode + "3D" + c.data_policy_code
      return {
        sku:        pc + suffix,
        name_vn:    nameVn,
        name_en:    nameEn,
        cogs:       tenant === "US" ? c.cogs_usd.toLocaleString() : c.cogs_vnd.toLocaleString(),
        currency:   tenant === "US" ? "USD" : "VND",
        throttle:   c.throttle_mbps ? `${c.throttle_mbps} Mbps` : "",
        days:       c.days,
        data:       c.combo_type === "unlimited" ? "UNL" : c.combo_type === "daily" ? `${c.data_gb}GB/ngày` : `${c.data_gb}GB`,
        vendor_sku: tenant === "VN" ? pcUS + suffix : c.vendor_sku,
      }
    }

    setPreviewRows({
      us:  combos.map(c => toRow(c, "US")),
      vn:  combos.map(c => toRow(c, "VN")),
      pcUS: `${config.purchaseType_US}${config.productType}${config.supportCountryCode}3D[F/P/A/B]`,
      pcVN: `${config.purchaseType_VN}${config.productType}${config.supportCountryCode}3D[F/P/A/B]`,
    })
    setPreviewTab("us")
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  // ──────────────────────────────────────────────────────────────────────────

  async function downloadExcel() {
    setGenerating(true)
    try {
      let body: object
      let successMsg: string

      if (selectedNCC === "3H") {
        const combos = build3HKCombos()
        if (!combos.length) { onNotify("error", "Chưa có combo để tải"); setGenerating(false); return }
        body = {
          vendor:          "3HK",
          threeHKProducts: combos,
          config:          { ...config, vendorCode: "3D", operatorCode: "3HK" },
          settings:        fxSettings,
          includeSIM,
        }
        successMsg = `Đã tải template 3HK ${combos.length} combo`
      } else {
        if (selObjs.size === 0) { onNotify("error", "Chưa có sản phẩm để tải"); setGenerating(false); return }
        body = {
          vendor:   "WM",
          products: [...selObjs.values()],
          config:   { ...config },
          settings: fxSettings,
        }
        successMsg = `Đã tải template ${selObjs.size} sản phẩm`
      }

      const res = await fetch("/api/admin/template", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
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
      a.download = `template_${selectedNCC}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onNotify("success", successMsg)
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
            { code: "3H",  name: "3HK",             available: true  },
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

      {/* ─── Step 1: 3HK — Chọn zone ──────────────────────────── */}
      {selectedNCC === "3H" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">1. Chọn Zone 3HK</h3>
          {loadingZones ? (
            <p className="text-sm text-gray-400">Đang tải zones...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">Zone</th>
                    <th className="px-3 py-2">Nước cover</th>
                    <th className="px-3 py-2 text-right">Giá/GB (HKD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {zoneGroups.map(z => (
                    <tr key={z.zone}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedZone?.zone === z.zone ? "bg-brand-50" : ""}`}
                      onClick={() => setSelectedZone(z)}
                    >
                      <td className="px-3 py-2">
                        <input type="radio" readOnly checked={selectedZone?.zone === z.zone} />
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-brand-700">{z.zone}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{z.countries.slice(0, 8).join(", ")}{z.countries.length > 8 ? ` +${z.countries.length - 8}` : ""}</td>
                      <td className="px-3 py-2 text-right font-mono">{z.price_per_gb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedZone && (
            <p className="text-xs text-brand-600 font-medium">
              Zone <strong>{selectedZone.zone}</strong> đã chọn · {selectedZone.countries.length} nước · {selectedZone.price_per_gb} HKD/GB
            </p>
          )}
        </div>
      )}

      {/* ─── Step 1: WM — Chọn sản phẩm ────────────────────────── */}
      {selectedNCC === "WM" && (
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
            <option value="unlimited">Unlimited</option>
            <option value="fixed">Fixed</option>
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
      )} {/* end WM Step 1 */}

      {/* ─── Step 2: 3HK — Combo builder ──────────────────────── */}
      {selectedNCC === "3H" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">2. Cấu hình Combo 3HK</h3>

          {/* Country config */}
          <div>
            <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-2">Thông tin nước / pháp nhân</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-brand-50/40 border border-brand-100 rounded-lg">
              <TemplField label="Purchase Type US *" value={config.purchaseType_US} onChange={v => setC("purchaseType_US", v)} placeholder="D" />
              <TemplField label="Purchase Type VN *" value={config.purchaseType_VN} onChange={v => setC("purchaseType_VN", v)} placeholder="3" />
              <TemplField label="Country Code (3 ký tự) *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="JPN" />
              <TemplField label="Tên nước (VN)" value={config.countryNameVn} onChange={v => setC("countryNameVn", v)} placeholder="Nhật Bản" />
              <TemplField label="Tên nước (EN)" value={config.countryNameEn} onChange={v => setC("countryNameEn", v)} placeholder="Japan" />
              <TemplField label="ISO Codes" value={config.isoCodes} onChange={v => setC("isoCodes", v)} placeholder="JP" />
            </div>
          </div>

          {/* Data types */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Loại data</p>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-700 w-20">Daily</span>
                {DAILY_DATA_OPTIONS.map(gb => (
                  <label key={gb} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={dailyGB.has(gb)}
                      onChange={() => setDailyGB(prev => { const s = new Set(prev); s.has(gb) ? s.delete(gb) : s.add(gb); return s })} />
                    <span className="text-sm text-gray-700">{gb}GB/ngày</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-700 w-20">Fixed</span>
                {FIXED_DATA_OPTIONS.map(gb => (
                  <label key={gb} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={fixedGB.has(gb)}
                      onChange={() => setFixedGB(prev => { const s = new Set(prev); s.has(gb) ? s.delete(gb) : s.add(gb); return s })} />
                    <span className="text-sm text-gray-700">{gb}GB</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={unlimitedEnabled} onChange={e => setUnlimitedEnabled(e.target.checked)} />
                  <span className="text-sm font-medium text-gray-700 w-20">Unlimited</span>
                </label>
                {unlimitedEnabled && (
                  <div className="flex items-center gap-3 ml-2">
                    <span className="text-xs text-gray-500">Throttle:</span>
                    {([10, 5] as const).map(m => (
                      <label key={m} className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="radio" checked={unlimThrottle === m} onChange={() => setUnlimThrottle(m)} />
                        <span className="text-sm text-gray-700">{m} Mbps</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Days */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Số ngày</p>
            <div className="flex flex-wrap gap-4">
              {DAY_OPTIONS.map(d => (
                <label key={d} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={selectedDays.has(d)}
                    onChange={() => setSelectedDays(prev => { const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s })} />
                  <span className="text-sm text-gray-700">{d} ngày</span>
                </label>
              ))}
            </div>
          </div>

          {/* SIM type option — Bug #32 */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Loại SIM xuất ra</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked disabled />
                <span className="text-sm text-gray-700 font-medium">eSIM (luôn có)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={includeSIM}
                  onChange={e => setIncludeSIM(e.target.checked)} />
                <span className="text-sm text-gray-700">
                  Top-up SIM (SIM vật lý)
                  <span className="text-xs text-gray-400 ml-1">— mỗi combo sẽ tạo thêm 1 hàng SIM</span>
                </span>
              </label>
            </div>
          </div>

          {selectedZone && (
            <p className="text-xs text-gray-400 pt-1">
              Zone {selectedZone.zone} · {selectedZone.price_per_gb} HKD/GB · 1 HKD = {fxSettings.fx_hkd_usd} USD · 1 USD = {fxSettings.fx_usd_vnd} VND
            </p>
          )}
        </div>
      )}

      {/* ─── Step 2: WM — Cấu hình ─────────────────────────────── */}
      {selectedNCC === "WM" && (
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
          <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-1">Bắt buộc nhập thủ công</p>
          <p className="text-[10px] text-gray-400 mb-2">Admin phải nhập — không thể tự động điền từ sản phẩm NCC</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-brand-50/40 border border-brand-100 rounded-lg">
            <TemplField label="Purchase Type US *" value={config.purchaseType_US} onChange={v => setC("purchaseType_US", v)} placeholder="D" />
            <TemplField label="Purchase Type VN *" value={config.purchaseType_VN} onChange={v => setC("purchaseType_VN", v)} placeholder="3" />
            <TemplField label="Country Code (3 ký tự) *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="TWN" />
            <TemplField label="Tên nước (VN)" value={config.countryNameVn} onChange={v => setC("countryNameVn", v)} placeholder="Đài Loan" />
            <TemplField label="Tên nước (EN)" value={config.countryNameEn} onChange={v => setC("countryNameEn", v)} placeholder="Taiwan" />
          </div>
        </div>

        {/* Auto-fillable fields */}
        <div>
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Auto-fill từ SP đã chọn (có thể chỉnh)</p>
          <p className="text-[10px] text-gray-400 mb-2">Nhấn ⚡ Auto-fill để điền tự động từ sản phẩm đầu tiên đã chọn ở trên</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <TemplField label="Type of SIM" value={config.typeOfSim} onChange={v => setC("typeOfSim", v)} placeholder="eSIM" />
            <TemplField label="Data Policy Code" value={config.dataPolicyCode} onChange={v => setC("dataPolicyCode", v)} placeholder="P" />
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
      )} {/* end WM Step 2 */}

      {/* ─── Step 3: Xem trước ─────────────────────────────────── */}
      <button
        onClick={selectedNCC === "3H" ? build3HKPreview : buildPreview}
        disabled={
          selectedNCC === "3H"
            ? !selectedZone || selectedDays.size === 0
            : selected.size === 0
        }
        className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <FileSpreadsheet size={16} />
        {selectedNCC === "3H"
          ? (!selectedZone ? "Xem trước (chưa chọn zone)" : `3. Xem trước combos`)
          : (selected.size === 0 ? "Xem trước (chưa chọn SP)" : `3. Xem trước ${selected.size} sản phẩm`)}
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
  { key: "perm_kb_upload",    icon: FileSpreadsheet, label: "KB — Upload tài liệu",   desc: "Ai có thể upload PDF/DOCX vào Knowledge Base" },
  { key: "perm_kb_wiki_view", icon: Eye,             label: "KB — Xem tab Wiki",       desc: "Ai thấy tab Wiki trong trang Kiến Thức" },
  { key: "perm_kb_wiki_edit", icon: Pencil,          label: "KB — Tạo / Sửa Wiki",    desc: "Ai có thể tạo và chỉnh sửa wiki pages" },
  { key: "perm_ncc_import",   icon: BookOpen,        label: "NCC — Import dữ liệu",   desc: "Ai có thể upload file NCC để cập nhật giá" },
] as const

const PERM_ROLES = CONFIGURABLE_ROLES

const PERM_DEFAULTS: Record<string, string[]> = {
  perm_kb_upload:    [],
  perm_kb_wiki_view: ["staff"],
  perm_kb_wiki_edit: [],
  perm_ncc_import:   [],
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

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tính năng / Báo cáo</th>
                {PERM_ROLES.map(role => (
                  <th key={role} className="text-center py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {PERM_FEATURES.map(f => (
                <tr key={f.key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                        <f.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{f.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                      </div>
                    </div>
                  </td>
                  {PERM_ROLES.map(role => (
                    <td key={`${role}-${f.key}`} className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(f.key, role)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          perms[f.key]?.has(role)
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-100 text-slate-300 hover:text-slate-400"
                        }`}
                      >
                        {perms[f.key]?.has(role) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <Save size={14}/>{saving ? "Đang lưu..." : "Lưu thay đổi"}
      </button>

      {/* ─── Role × Báo cáo Analytics (quyền nền theo role — y hệt gohub-intel) ─── */}
      <RolePermissionsMatrix onNotify={onNotify} />

      {/* ─── Dept × Tab matrix ─── */}
      <DeptTabMatrix onNotify={onNotify} />
    </div>
  )
}

// Quyền nền Analytics theo role (Role × Báo cáo). admin/manager luôn toàn quyền nên không liệt kê.
const ROLE_PERM_ROLES = CONFIGURABLE_ROLES

function RolePermissionsMatrix({ onNotify }: { onNotify: (type: "success" | "error", text: string) => void }) {
  const [matrix,  setMatrix]  = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch("/api/config/role-permissions")
      .then(r => r.ok ? r.json() : {})
      .then((d: Record<string, string[]>) => {
        const m: Record<string, Set<string>> = {}
        for (const role of ROLE_PERM_ROLES) m[role] = new Set(d[role] ?? [])
        setMatrix(m); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (role: string, id: string) =>
    setMatrix(prev => {
      const n = { ...prev, [role]: new Set(prev[role]) }
      n[role].has(id) ? n[role].delete(id) : n[role].add(id)
      return n
    })

  const save = async () => {
    setSaving(true)
    const body: Record<string, string[]> = {}
    for (const role of ROLE_PERM_ROLES) body[role] = Array.from(matrix[role] ?? [])
    const res = await fetch("/api/config/role-permissions", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) onNotify("success", "Đã lưu quyền nền theo Role")
    else onNotify("error", "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return null

  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      <div>
        <h4 className="text-sm font-semibold text-gray-700">Quyền nền Analytics theo Role</h4>
        <p className="text-xs text-gray-400 mt-0.5">Trang nào mỗi Role mặc định được xem. Admin/Manager luôn toàn quyền · cấp thêm per-user ở phần trên (cộng dồn).</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Báo cáo</th>
                {ROLE_PERM_ROLES.map(role => (
                  <th key={role} className="text-center py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{role}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ANALYTICS_REPORTS.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">{r.label}</td>
                  {ROLE_PERM_ROLES.map(role => (
                    <td key={`${role}-${r.id}`} className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(role, r.id)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          matrix[role]?.has(r.id) ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-300 hover:text-slate-400"
                        }`}
                      >
                        {matrix[role]?.has(r.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <Save size={14}/>{saving ? "Đang lưu..." : "Lưu quyền Role"}
      </button>
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Phòng ban</th>
                {DEPT_UNLOCKABLE_TABS.map(t => (
                  <th key={t.key} className="text-center py-4 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {DEPARTMENTS.map(dept => (
                <tr key={dept.key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-4 text-sm font-medium text-slate-700">{dept.label}</td>
                  {DEPT_UNLOCKABLE_TABS.map(tab => (
                    <td key={tab.key} className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(dept.key, tab.key)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          matrix[dept.key]?.has(tab.key)
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-100 text-slate-300 hover:text-slate-400"
                        }`}
                      >
                        {matrix[dept.key]?.has(tab.key) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Feature: Scheduled Lark Messages Tab
// ─────────────────────────────────────────────────────────────────────────────

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

function ScheduledTab({ onNotify }: { onNotify: (t: "success" | "error", m: string) => void }) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
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

  const del = async (id: string) => {
    if (!confirm("Xóa lịch này?")) return
    await fetch(`/api/admin/scheduled-messages/${id}`, { method: "DELETE" })
    onNotify("success", "Đã xóa"); fetchMessages()
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
          <h3 className="font-semibold text-gray-800">Lịch gửi Lark tự động</h3>
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
          <h4 className="font-semibold text-sm text-gray-800">{editId ? "Sửa lịch" : "Thêm lịch mới"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Tên lịch *</label>
              <input type="text" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Báo cáo doanh thu thứ Hai"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Prompt Gemini *</label>
              <textarea rows={3} value={form.prompt || ""} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="VD: Tóm tắt hiệu suất kinh doanh tuần này trong 3 câu ngắn bằng tiếng Việt"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Lịch gửi (UTC)</label>
              <div className="flex gap-2 flex-wrap">
                {["daily","weekly","monthly","custom"].map(m => (
                  <button key={m} onClick={() => setSchedMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      schedMode === m ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
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
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                )}
                {schedMode === "weekly" && (
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Thứ</label>
                    <select value={schedDow} onChange={e => setSchedDow(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none">
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {schedMode === "monthly" && (
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Ngày</label>
                    <input type="number" min={1} max={28} value={schedDom} onChange={e => setSchedDom(e.target.value)}
                      className="w-16 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                )}
                {schedMode === "custom" && (
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Cron expression (UTC)</label>
                    <input type="text" value={customCron} onChange={e => setCustomCron(e.target.value)}
                      placeholder="0 9 * * 1"
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none font-mono" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-300 mt-1 font-mono">
                Cron: {buildCron(schedMode, schedTime, schedDow, schedDom, customCron) || "—"}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Lark Webhook URL (optional)</label>
              <input type="text" value={form.lark_webhook_url || ""} onChange={e => setForm(f => ({ ...f, lark_webhook_url: e.target.value }))}
                placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Keyword prefix (optional)</label>
              <input type="text" value={form.lark_keyword || ""} onChange={e => setForm(f => ({ ...f, lark_keyword: e.target.value }))}
                placeholder="VD: 📊 Báo cáo:"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button onClick={save}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
              <Save size={14} className="inline mr-1.5" />{editId ? "Cập nhật" : "Lưu lịch"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-xl transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {messages.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          Chưa có lịch gửi nào
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            <div key={msg.id} className={`bg-white border rounded-xl p-4 transition-all ${msg.is_active ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${msg.is_active ? "bg-emerald-400" : "bg-gray-300"}`} />
                    <span className="font-semibold text-sm text-gray-800 truncate">{msg.name}</span>
                    <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 shrink-0">
                      {msg.cron_expression}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 truncate pl-4">{msg.prompt.slice(0, 100)}{msg.prompt.length > 100 ? "..." : ""}</p>
                  {msg.last_run_at && (
                    <p className="text-[10px] text-gray-300 mt-0.5 pl-4">
                      Lần cuối: {new Date(msg.last_run_at).toLocaleString("vi-VN")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => testRun(msg)} disabled={testingId === msg.id} title="Gửi test ngay"
                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                    {testingId === msg.id ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                  <button onClick={() => toggle(msg)} title={msg.is_active ? "Tắt" : "Bật"}
                    className={`p-1.5 rounded-lg transition-colors ${msg.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-50"}`}>
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={() => openEdit(msg)} title="Sửa"
                    className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => del(msg.id)} title="Xóa"
                    className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
