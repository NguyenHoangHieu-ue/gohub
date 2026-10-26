"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

// Bảng "Quyền theo người": hàng = người dùng, cột = 5 quyền Creator cấp riêng. Gộp 5 khối rời ở Creator Settings
// (mỗi khối tự tìm người rồi thêm). Vẫn gọi đúng 5 API cũ (GET {users}, POST {action: add|remove, username}) nên
// nhật ký cấp/thu hồi (access_audit_log) và logic phân quyền phía server không đổi. Chỉ Creator gọi được các API này.

type Key = "gp" | "my" | "market" | "pricing" | "create" | "argon"
const GRANTS: { key: Key; label: string; endpoint: string; hint: string }[] = [
  { key: "gp",      label: "Gấu Pro",        endpoint: "/api/creator-ai/gp-access",             hint: "Dùng trợ lý Gấu Pro" },
  { key: "my",      label: "My Metrics",     endpoint: "/api/creator/my-metrics-access",        hint: "Xem tab My Metrics" },
  { key: "market",  label: "Thị trường",     endpoint: "/api/creator/market-access",            hint: "Xem tab Thị trường & Báo giá (gồm báo giá nhà cung cấp)" },
  { key: "pricing", label: "Tính giá",       endpoint: "/api/creator/pricing-access",           hint: "Dùng chức năng Tính giá (chỉ tên gói và giá vốn)" },
  { key: "create",  label: "Tạo sản phẩm",   endpoint: "/api/creator/product-create-access",    hint: "Tạo sản phẩm (mã SKU/Product, xuất file import). Đã gồm Tính giá" },
  { key: "argon",   label: "Trợ lý (Argon)", endpoint: "/api/creator/argon-access",             hint: "Dùng Trợ lý Argon ở mức thành viên: Hỏi + Kho + Việc cần duyệt của CHÍNH HỌ (không số liệu công ty/SQL/code, không chạy nền, có hạn mức mỗi ngày)" },
]

interface UserRow { username: string; name: string; role: string; email?: string; lark_open_id?: string | null }

export function UserGrantsMatrix({ onNotify }: { onNotify: (ok: boolean, text: string) => void }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [granted, setGranted] = useState<Record<Key, Set<string>>>({ gp: new Set(), my: new Set(), market: new Set(), pricing: new Set(), create: new Set(), argon: new Set() })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, ...lists] = await Promise.all([fetch("/api/admin/users"), ...GRANTS.map(g => fetch(g.endpoint, { cache: "no-store" }))])
      const uData = await uRes.json().catch(() => ({}))
      setUsers((uData.users ?? []).filter((u: UserRow) => u.email || u.lark_open_id))
      const next = { gp: new Set<string>(), my: new Set<string>(), market: new Set<string>(), pricing: new Set<string>(), create: new Set<string>() } as Record<Key, Set<string>>
      for (let i = 0; i < GRANTS.length; i++) {
        const d = lists[i].ok ? await lists[i].json().catch(() => null) : null
        next[GRANTS[i].key] = new Set<string>((d?.users ?? []).map((x: { username: string }) => x.username))
      }
      setGranted(next)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (key: Key, username: string, on: boolean) => {
    const g = GRANTS.find(x => x.key === key)!
    const r = await fetch(g.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: on ? "add" : "remove", username }) })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Lỗi")
  }

  const toggle = async (u: UserRow, key: Key, on: boolean) => {
    // Quy tắc sẵn có: Tạo sản phẩm đã gồm Tính giá → bật Tạo sản phẩm thì bật luôn Tính giá; tắt Tính giá thì tắt luôn Tạo sản phẩm.
    const ops: [Key, boolean][] = [[key, on]]
    if (key === "create" && on && !granted.pricing.has(u.username)) ops.push(["pricing", true])
    if (key === "pricing" && !on && granted.create.has(u.username)) ops.push(["create", false])
    const before = granted
    const apply = (state: Record<Key, Set<string>>) => {
      const next = { ...state }
      for (const [k, v] of ops) { const s = new Set(next[k]); if (v) s.add(u.username); else s.delete(u.username); next[k] = s }
      return next
    }
    setGranted(apply)
    setBusy(`${u.username}:${key}`)
    try {
      for (const [k, v] of ops) await post(k, u.username, v)
      onNotify(true, `${on ? "Đã cấp" : "Đã thu hồi"} ${GRANTS.find(g => g.key === key)!.label} cho ${u.name || u.username}`)
    } catch (e: any) {
      setGranted(before)
      onNotify(false, e?.message || "Lưu thất bại")
    } finally { setBusy(null) }
  }

  const roles = useMemo(() => [...new Set(users.map(u => u.role))].sort(), [users])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return users
      .filter(u => (!roleFilter || u.role === roleFilter) && (!s || `${u.name} ${u.username}`.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.role === "creator") - Number(a.role === "creator") || (a.name || a.username).localeCompare(b.name || b.username, "vi"))
  }, [users, q, roleFilter])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-bold text-slate-800">Quyền theo người</h2>
          <p className="text-[13px] text-slate-500">Bật hoặc tắt từng quyền, lưu ngay. Creator luôn có đủ quyền. Mỗi lần đổi đều ghi vào nhật ký cấp/thu hồi.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên hoặc tài khoản" aria-label="Tìm người dùng"
            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl w-56 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Lọc vai trò"
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white">
          <option value="">Mọi vai trò</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-[13px] text-slate-500 tabular-nums">{rows.length} người</span>
      </div>
      {loading ? <div className="p-8 text-sm text-slate-400 text-center">Đang tải…</div> : (
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[760px] text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 bg-slate-100 text-left px-4 py-3 text-[12.5px] font-bold text-slate-600 border-b border-slate-200">Người dùng</th>
                <th className="sticky top-0 z-10 bg-slate-100 text-left px-3 py-3 text-[12.5px] font-bold text-slate-600 border-b border-slate-200">Vai trò</th>
                {GRANTS.map(g => (
                  <th key={g.key} title={g.hint} className="sticky top-0 z-10 bg-slate-100 text-center px-3 py-3 text-[12.5px] font-bold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                    {g.label}<span className="block text-[11.5px] font-normal text-slate-400 tabular-nums">{granted[g.key].size} người</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const isCreator = u.role === "creator"
                return (
                  <tr key={u.username} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 border-b border-slate-100">
                      <div className="font-medium text-slate-800">{u.name || u.username}</div>
                      <div className="text-[12.5px] text-slate-400">@{u.username}</div>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100"><span className="text-[12px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{u.role}</span></td>
                    {GRANTS.map(g => {
                      const on = isCreator || granted[g.key].has(u.username)
                      return (
                        <td key={g.key} className="px-3 py-2.5 border-b border-slate-100 text-center">
                          <button role="switch" aria-checked={on} aria-label={`${g.label} cho ${u.name || u.username}`}
                            disabled={isCreator || busy === `${u.username}:${g.key}`} onClick={() => toggle(u, g.key, !on)}
                            className={cn("relative inline-block w-10 h-[22px] rounded-full transition-colors align-middle disabled:cursor-not-allowed",
                              on ? (isCreator ? "bg-emerald-300" : "bg-emerald-600") : "bg-slate-200 hover:bg-slate-300")}>
                            <span className={cn("absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform", on && "translate-x-[18px]")} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={2 + GRANTS.length} className="p-8 text-center text-slate-400">Không có người dùng phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
