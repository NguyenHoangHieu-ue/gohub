"use client"

// Các thành phần quản lý user dùng chung cho trang gộp /analytics/users.
// Trước đây nằm rải trong /admin (AddUser, ChangePassword, PermissionsTab, DeptTabMatrix) — gộp về 1 nơi.

import { useEffect, useState } from "react"
import { ALL_ROLES, ROLE_LABELS } from "@/lib/agents/types"

export interface AdminUser {
  username:           string
  name:               string
  email:              string
  role:               string
  department:         string
  allowed_analytics?: string | null
  allowed_tabs?:      string | null
  lark_open_id?:      string | null
}

type Notify = (ok: boolean, text: string) => void

const inputCls = "w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        required={label.includes("*")} className={inputCls} />
    </div>
  )
}

// ── Thêm user ────────────────────────────────────────────────────────────────
export function AddUserForm({ onNotify, onAdded }: { onNotify: Notify; onAdded: () => void }) {
  const [form, setForm] = useState({ username: "", name: "", email: "", role: "staff", password: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { onNotify(false, "Password không khớp"); return }
    setLoading(true)
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.username, name: form.name, email: form.email, role: form.role, password: form.password || null }),
    })
    setLoading(false)
    if (res.ok) {
      onNotify(true, `Đã thêm user ${form.username}`)
      setForm({ username: "", name: "", email: "", role: "staff", password: "", confirm: "" })
      onAdded()
    } else onNotify(false, "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Username *"     value={form.username} onChange={v => set("username", v)} placeholder="username" />
        <Field label="Tên hiển thị *" value={form.name}     onChange={v => set("name", v)}     placeholder="Nguyễn Văn A" />
        <Field label="Email"          value={form.email}    onChange={v => set("email", v)}    placeholder="email@gohub.vn" type="email" />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
          <select value={form.role} onChange={e => set("role", e.target.value)} className={inputCls}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select>
        </div>
        <Field label="Password"    value={form.password} onChange={v => set("password", v)} type="password" placeholder="••••••••" />
        <Field label="Nhập lại PW" value={form.confirm}  onChange={v => set("confirm", v)}  type="password" placeholder="••••••••" />
      </div>
      <p className="text-xs text-slate-400">Password có thể để trống nếu user sẽ đăng nhập bằng Lark.</p>
      <button type="submit" disabled={loading} className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60">
        {loading ? "Đang thêm..." : "Thêm user"}
      </button>
    </form>
  )
}

// ── Đổi mật khẩu ─────────────────────────────────────────────────────────────
export function ChangePasswordForm({ users, onNotify }: { users: AdminUser[]; onNotify: Notify }) {
  const [target, setTarget] = useState(users[0]?.username || "")
  const [pw, setPw]   = useState("")
  const [pw2, setPw2] = useState("")
  const [loading, setLoading] = useState(false)
  useEffect(() => { if (!target && users[0]) setTarget(users[0].username) }, [users, target])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { onNotify(false, "Password không khớp"); return }
    setLoading(true)
    const res = await fetch(`/api/admin/users/${target}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }),
    })
    setLoading(false)
    if (res.ok) { onNotify(true, `Đã đổi password cho ${target}`); setPw(""); setPw2("") }
    else onNotify(false, "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Tài khoản</label>
        <select value={target} onChange={e => setTarget(e.target.value)} className={inputCls}>
          {users.map(u => <option key={u.username} value={u.username}>{u.name || u.username} ({u.username})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Password mới *" value={pw}  onChange={setPw}  type="password" placeholder="••••••••" />
        <Field label="Nhập lại *"     value={pw2} onChange={setPw2} type="password" placeholder="••••••••" />
      </div>
      <button type="submit" disabled={loading || !pw} className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60">
        {loading ? "Đang lưu..." : "Đổi password"}
      </button>
    </form>
  )
}
