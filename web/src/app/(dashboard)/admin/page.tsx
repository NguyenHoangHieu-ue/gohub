"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Users, Plus, Key, Trash2, Save, Shield } from "lucide-react"

interface User {
  username:      string
  name:          string
  email:         string
  role:          string
  created_at:    string
  lark_open_id?: string
}

type Tab = "list" | "add" | "password"

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
    { id: "list",     label: "Danh sách",    icon: <Users size={15} /> },
    { id: "add",      label: "Thêm user",    icon: <Plus  size={15} /> },
    { id: "password", label: "Đổi password", icon: <Key   size={15} /> },
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
                  {u.role}
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
                <option value="sale">Sale</option>
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
  const [form, setForm]   = useState({ username: "", name: "", email: "", role: "sale", password: "", confirm: "" })
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
      setForm({ username: "", name: "", email: "", role: "sale", password: "", confirm: "" })
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
            <option value="sale">Sale</option>
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
