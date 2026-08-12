"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { ExternalLink, Link2, Plus, Trash2, UserPlus, Shield } from "lucide-react"
import { useToast } from "@/components/toast"

interface PortalDef {
  id:          string
  name:        string
  description: string
  url:         string
  tag:         string
}

const PORTALS: PortalDef[] = [
  {
    id:          "commission",
    name:        "Commission Analytics",
    description: "Báo cáo hoa hồng affiliate theo sản phẩm, đơn hàng, thời gian.",
    url:         "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics",
    tag:         "Shopee Affiliate",
  },
  {
    id:          "affiliate",
    name:        "Affiliate Analytics",
    description: "Tổng quan hiệu suất affiliate: clicks, conversions, revenue.",
    url:         "https://banhang.shopee.vn/portal/web-seller-affiliate/affiliate_analytics",
    tag:         "Shopee Affiliate",
  },
]

interface PortalUser { username: string; name: string | null; email: string | null }

export default function PortalPage() {
  const { data: session } = useSession()
  const toast = useToast()
  const role = (session?.user as any)?.role ?? session?.user?.role ?? ""
  const isCreator = role === "creator"

  const [users, setUsers]         = useState<PortalUser[]>([])
  const [usersLoading, setUL]     = useState(true)
  const [addInput, setAddInput]   = useState("")
  const [adding, setAdding]       = useState(false)

  useEffect(() => {
    if (!isCreator) { setUL(false); return }
    fetch("/api/admin/portal-users")
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setUL(false))
  }, [isCreator])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addInput.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/admin/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: addInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setUsers(prev => prev.some(u => u.username === json.user.username) ? prev : [...prev, json.user])
      setAddInput("")
      toast.success(`Đã cấp quyền cho ${json.user.name || json.user.username}`)
    } catch (err: any) {
      toast.error(err.message || "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(username: string) {
    try {
      const res = await fetch(`/api/admin/portal-users?username=${encodeURIComponent(username)}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Xóa thất bại")
      setUsers(prev => prev.filter(u => u.username !== username))
      toast.success("Đã thu hồi quyền")
    } catch (err: any) {
      toast.error(err.message || "Hiếu đang fix, vui lòng đợi")
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#003B95]/10 flex items-center justify-center">
          <Link2 size={20} className="text-[#003B95]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Portal Access</h1>
          <p className="text-slate-500 text-[13px]">Truy cập nhanh các portal bên ngoài</p>
        </div>
      </div>

      {/* Portal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PORTALS.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-2">
                  {p.tag}
                </span>
                <h3 className="font-semibold text-slate-800 text-[15px] leading-tight">{p.name}</h3>
              </div>
            </div>
            <p className="text-slate-500 text-[13px] leading-relaxed flex-1">{p.description}</p>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors"
            >
              <ExternalLink size={14} />
              Mở Portal
            </a>
          </div>
        ))}
      </div>

      {/* Access management — chỉ creator */}
      {isCreator && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-[#003B95]" />
            <h2 className="font-semibold text-slate-700 text-[15px]">Quản lý quyền truy cập</h2>
          </div>
          <p className="text-slate-400 text-[12px]">
            Chỉ creator thấy mục này. User được thêm vào có thể truy cập Portal Access trong sidebar.
          </p>

          {/* Add user */}
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              placeholder="Username (vd: hieunh862)"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]"
            />
            <button
              type="submit"
              disabled={adding || !addInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <UserPlus size={14} />
              {adding ? "Đang thêm..." : "Thêm"}
            </button>
          </form>

          {/* User list */}
          {usersLoading ? (
            <p className="text-slate-400 text-[13px]">Đang tải...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-400 text-[13px]">Chưa có user nào được cấp quyền (ngoài creator).</p>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.username} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div>
                    <p className="text-[13px] font-medium text-slate-700">{u.name || u.username}</p>
                    <p className="text-[11px] text-slate-400">{u.username}{u.email ? ` · ${u.email}` : ""}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(u.username)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Thu hồi quyền"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
