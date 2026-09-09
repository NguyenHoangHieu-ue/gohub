"use client"

// Các thành phần quản lý user dùng chung cho trang gộp /analytics/users.
// Trước đây nằm rải trong /admin (AddUser, ChangePassword, PermissionsTab, DeptTabMatrix) — gộp về 1 nơi.

import { useEffect, useState } from "react"
import { Save, CheckSquare, Square, BookOpen } from "lucide-react"
import { ALL_ROLES, CONFIGURABLE_ROLES, ROLE_LABELS } from "@/lib/agents/types"

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

// ── Phân quyền hệ thống (nâng cao): Role × Tính năng + Phòng ban × Tab ────────
const PERM_FEATURES = [
  { key: "perm_ncc_import",   icon: BookOpen,        label: "NCC — Import dữ liệu",  desc: "Ai có thể upload file NCC để cập nhật giá" },
] as const
const PERM_ROLES = CONFIGURABLE_ROLES
const PERM_DEFAULTS: Record<string, string[]> = {
  perm_ncc_import: [],
}

const DEPT_UNLOCKABLE_TABS = [
  { key: "skus", label: "SP Hệ Thống" }, { key: "ncc", label: "SP Vendor" },
] as const
const DEPARTMENTS = [
  { key: "sales", label: "Sales" }, { key: "product", label: "Product" }, { key: "tech", label: "Tech" }, { key: "finance", label: "Finance" },
] as const
const DEPT_DEFAULTS: Record<string, string[]> = {
  sales: [], product: ["skus", "ncc"], tech: ["skus", "ncc"], finance: ["skus"],
}

function ToggleBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${on ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-300 hover:text-slate-400"}`}>
      {on ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
    </button>
  )
}

// Serialize Record<string,Set> ổn định để so sánh dirty (JSON.stringify không đọc được Set)
const serializeSetMap = (m: Record<string, Set<string>>) =>
  JSON.stringify(Object.keys(m).sort().map(k => [k, Array.from(m[k]).sort()]))

export function SystemPermissionsMatrix({ onNotify }: { onNotify: Notify }) {
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [savedSnap, setSavedSnap] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = serializeSetMap(perms) !== savedSnap

  useEffect(() => {
    fetch("/api/permissions").then(r => r.json()).then(d => {
      const p: Record<string, Set<string>> = {}
      for (const f of PERM_FEATURES) p[f.key] = new Set(((d.perms?.[f.key] ?? PERM_DEFAULTS[f.key] ?? []) as string[]).filter(r => r !== "admin"))
      setPerms(p); setSavedSnap(serializeSetMap(p)); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const toggle = (key: string, role: string) => setPerms(prev => {
    const next = { ...prev, [key]: new Set(prev[key]) }
    next[key].has(role) ? next[key].delete(role) : next[key].add(role)
    return next
  })
  const save = async () => {
    setSaving(true)
    const updates = PERM_FEATURES.map(f => ({ key: f.key, value: ["admin", ...Array.from(perms[f.key] ?? [])].join(",") }))
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) })
    if (res.ok) setSavedSnap(serializeSetMap(perms))
    setSaving(false)
    onNotify(res.ok, res.ok ? "Đã lưu cài đặt phân quyền" : "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return <div className="text-sm text-slate-400 py-4">Đang tải...</div>

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        <strong>Admin</strong> luôn có toàn quyền và không thể bị giới hạn. Bảng này chỉ áp dụng cho <strong>Manager</strong> và <strong>Standard</strong>.
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50"><p className="text-sm font-bold text-slate-700">Role × Tính năng</p></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              <th className="text-left py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tính năng</th>
              {PERM_ROLES.map(role => <th key={role} className="text-center py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{role}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {PERM_FEATURES.map(f => (
                <tr key={f.key} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500"><f.icon className="w-4 h-4" /></div>
                      <div><p className="text-sm font-medium text-slate-700">{f.label}</p><p className="text-xs text-slate-400 mt-0.5">{f.desc}</p></div>
                    </div>
                  </td>
                  {PERM_ROLES.map(role => <td key={`${role}-${f.key}`} className="py-3.5 px-4 text-center"><ToggleBtn on={!!perms[f.key]?.has(role)} onClick={() => toggle(f.key, role)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100">
          <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={14} />{saving ? "Đang lưu..." : "Lưu Role × Tính năng"}
          </button>
        </div>
      </div>

      <DeptTabMatrix onNotify={onNotify} />
    </div>
  )
}

function DeptTabMatrix({ onNotify }: { onNotify: Notify }) {
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({})
  const [savedSnap, setSavedSnap] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = serializeSetMap(matrix) !== savedSnap

  useEffect(() => {
    fetch("/api/permissions").then(r => r.json()).then(d => {
      const m: Record<string, Set<string>> = {}
      for (const dept of DEPARTMENTS) m[dept.key] = new Set((d.perms?.[`perm_dept_${dept.key}_tabs`] ?? DEPT_DEFAULTS[dept.key] ?? []) as string[])
      setMatrix(m); setSavedSnap(serializeSetMap(m)); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const toggle = (dept: string, tab: string) => setMatrix(prev => {
    const next = { ...prev, [dept]: new Set(prev[dept]) }
    next[dept].has(tab) ? next[dept].delete(tab) : next[dept].add(tab)
    return next
  })
  const save = async () => {
    setSaving(true)
    const updates = DEPARTMENTS.map(d => ({ key: `perm_dept_${d.key}_tabs`, value: Array.from(matrix[d.key] ?? []).join(",") }))
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) })
    if (res.ok) setSavedSnap(serializeSetMap(matrix))
    setSaving(false)
    onNotify(res.ok, res.ok ? "Đã lưu phân quyền phòng ban" : "Hiếu đang fix, vui lòng đợi")
  }

  if (loading) return null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <p className="text-sm font-bold text-slate-700">Phòng ban × Tab</p>
        <p className="text-xs text-slate-400 mt-0.5">Tab nào Standard user được xem khi thuộc phòng ban này (ngoài Bé Gấu, Khuyến Mãi, Note)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            <th className="text-left py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Phòng ban</th>
            {DEPT_UNLOCKABLE_TABS.map(t => <th key={t.key} className="text-center py-3.5 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {DEPARTMENTS.map(dept => (
              <tr key={dept.key} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3.5 px-4 text-sm font-medium text-slate-700">{dept.label}</td>
                {DEPT_UNLOCKABLE_TABS.map(tab => <td key={tab.key} className="py-3.5 px-4 text-center"><ToggleBtn on={!!matrix[dept.key]?.has(tab.key)} onClick={() => toggle(dept.key, tab.key)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-slate-100">
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Save size={14} />{saving ? "Đang lưu..." : "Lưu phòng ban"}
        </button>
      </div>
    </div>
  )
}
