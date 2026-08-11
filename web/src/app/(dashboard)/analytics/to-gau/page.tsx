"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Users, Plus, X, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"

interface ChatGroup {
  id: string
  name: string
  description: string | null
  avatar_emoji: string
  created_by: string
  is_archived: boolean
  created_at: string
  member_count: number
  last_message: { content: string; sender_name: string; created_at: string } | null
}

const EMOJI_OPTIONS = ["🐻", "🦊", "🐼", "🐨", "🦁", "🐯", "🦋", "🌟", "🎯", "🚀", "💡", "🎉"]

function fmtRelative(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return "vừa xong"
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return d.toLocaleDateString("vi-VN")
}

function GroupCard({ group, isCreator }: { group: ChatGroup; isCreator: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#003B95]/40 hover:shadow-md transition-all group">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0 border border-blue-100">
          {group.avatar_emoji || "🐻"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-[15px] leading-tight truncate">{group.name}</h3>
          {group.description && (
            <p className="text-slate-500 text-[13px] mt-0.5 line-clamp-2 leading-relaxed">{group.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[12px] text-slate-400 mb-4">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {group.member_count} thành viên
        </span>
        {group.last_message && (
          <span className="truncate">· {fmtRelative(group.last_message.created_at)}</span>
        )}
      </div>

      {group.last_message ? (
        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-4 border border-slate-100">
          <p className="text-[12px] text-slate-500 truncate">
            <span className="font-medium text-slate-700">{group.last_message.sender_name}: </span>
            {group.last_message.content}
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-4 border border-slate-100">
          <p className="text-[12px] text-slate-400 italic">Chưa có tin nhắn nào</p>
        </div>
      )}

      <Link
        href={`/analytics/to-gau/${group.id}`}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors"
      >
        <MessageCircle size={14} />
        Vào nhóm
      </Link>
    </div>
  )
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]       = useState("")
  const [desc, setDesc]       = useState("")
  const [emoji, setEmoji]     = useState("🐻")
  const [saving, setSaving]   = useState(false)
  const toast = useToast()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/to-gau/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, avatar_emoji: emoji }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Lỗi tạo nhóm")
      toast.success(`Đã tạo nhóm "${name.trim()}"`)
      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-[16px]">Tạo nhóm mới</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-[13px] font-medium text-slate-600 block mb-2">Biểu tượng nhóm</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "w-10 h-10 rounded-lg text-xl flex items-center justify-center border-2 transition-all",
                    emoji === e ? "border-[#003B95] bg-blue-50 scale-110" : "border-slate-200 hover:border-slate-400"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[13px] font-medium text-slate-600 block mb-1.5">Tên nhóm *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Team B2C, Dev Group..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#003B95] focus:ring-2 focus:ring-[#003B95]/20"
              required
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-slate-600 block mb-1.5">Mô tả (tùy chọn)</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Mô tả ngắn về nhóm..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#003B95] focus:ring-2 focus:ring-[#003B95]/20 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Đang tạo..." : "Tạo nhóm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ToGauPage() {
  const { data: session } = useSession()
  const [groups, setGroups]         = useState<ChatGroup[]>([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const role      = session?.user?.role || ""
  const isCreator = role === "creator" || role === "admin"

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/to-gau/groups")
      const json = await res.json()
      setGroups(json.data ?? [])
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Tổ Gấu 🐻
          </h1>
          <p className="text-slate-500 text-[14px] mt-1">Group chat nội bộ — chia sẻ, trao đổi trong nhóm</p>
        </div>
        {isCreator && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors shadow-sm"
          >
            <Plus size={16} />
            Tạo nhóm
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded w-1/3 mb-4" />
              <div className="h-10 bg-slate-100 rounded mb-4" />
              <div className="h-9 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">🐻</div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Chưa có nhóm nào</h3>
          <p className="text-slate-400 text-[14px] max-w-sm">
            {isCreator
              ? "Bắt đầu bằng cách tạo nhóm đầu tiên để nhóm nội bộ có thể chat với nhau."
              : "Bạn chưa được thêm vào nhóm nào. Liên hệ admin để được thêm vào nhóm."}
          </p>
          {isCreator && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#003B95] text-white text-[14px] font-medium hover:bg-[#002d73] transition-colors"
            >
              <Plus size={16} />
              Tạo nhóm đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <GroupCard key={g.id} group={g} isCreator={isCreator} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={loadGroups} />
      )}
    </div>
  )
}
