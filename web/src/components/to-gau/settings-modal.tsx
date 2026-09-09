"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import React, { useState, useEffect, useRef } from "react"
import { Settings, UserPlus, X, Trash2, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { Avatar } from "@/components/to-gau/avatar"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { EMOJI_OPTIONS, AI_SCOPE_PRESETS } from "@/lib/to-gau-types"
import type { Member, GroupInfo } from "@/lib/to-gau-types"

export function SettingsModal({
  group, onClose, onSaved, onMemberRemoved, isCreator, isManager,
}: {
  group:           GroupInfo
  onClose:         () => void
  onSaved:         (updated: Partial<GroupInfo>) => void
  onMemberRemoved: (email: string) => void
  isCreator:       boolean
  isManager:       boolean
}) {
  const toast = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
  const [name, setName]           = useState(group.name)
  const [desc, setDesc]           = useState(group.description ?? "")
  const [emoji, setEmoji]         = useState(group.avatar_emoji || "🐻")
  const [saving, setSaving]       = useState(false)
  const [addEmail, setAddEmail]   = useState("") // ô tìm kiếm (theo tên/email/username) — không gửi thẳng lên API
  const [addingMember, setAddingMember] = useState(false)
  const [members, setMembers]     = useState<Member[]>(group.members)

  // User search autocomplete — bắt buộc chọn 1 gợi ý (username, không phải email) mới thêm được,
  // vì nhiều tài khoản Lark không có email để gõ trực tiếp.
  const [userSuggestions, setUserSuggestions]   = useState<{username: string; email: string | null; name: string}[]>([])
  const [selectedUser, setSelectedUser]         = useState<{username: string; name: string} | null>(null)
  const [showSuggestions, setShowSuggestions]   = useState(false)
  const searchDebounce                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI config state
  const [aiEnabled, setAiEnabled] = useState<boolean>(group.ai_enabled ?? false)
  const [aiScope, setAiScope]     = useState<string>(group.ai_scope ?? "")
  const [savingAI, setSavingAI]   = useState(false)

  // User search effect (#3) — tìm theo tên/email/username, lọc bỏ user đã là member (so username)
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (!addEmail) { setUserSuggestions([]); setShowSuggestions(false); return }
    searchDebounce.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/to-gau/user-search?q=${encodeURIComponent(addEmail)}`)
        const json = await res.json()
        const filtered = (json.data ?? []).filter((u: { username: string }) =>
          !members.some(m => m.user_email === u.username)
        )
        setUserSuggestions(filtered)
        setShowSuggestions(filtered.length > 0)
      } catch { setUserSuggestions([]) }
    }, 300)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [addEmail, members])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, avatar_emoji: emoji }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Đã lưu cài đặt nhóm")
      onSaved({ name: name.trim(), description: desc.trim() || null, avatar_emoji: emoji })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAI(e: React.FormEvent) {
    e.preventDefault()
    setSavingAI(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_enabled: aiEnabled, ai_scope: aiScope.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Đã lưu cài đặt AI")
      onSaved({ ai_enabled: aiEnabled, ai_scope: aiScope.trim() || null })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setSavingAI(false)
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return
    setAddingMember(true)
    setShowSuggestions(false)
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedUser.username, user_name: selectedUser.name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Đã thêm ${selectedUser.name || selectedUser.username}`)
      setMembers(prev => [...prev, json.data])
      setAddEmail("")
      setSelectedUser(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(username: string) {
    if (!await confirmDialog(`Xóa ${username} khỏi nhóm?`)) return
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}/members?username=${encodeURIComponent(username)}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setMembers(prev => prev.filter(m => m.user_email !== username))
      onMemberRemoved(username)
      toast.success("Đã xóa thành viên")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  // Đổi role thành viên (#2)
  async function handleRoleChange(username: string, newRole: string) {
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setMembers(prev => prev.map(m => m.user_email === username ? { ...m, role: newRole } : m))
      toast.success("Đã cập nhật quyền")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  const roleLabel: Record<string, string> = { admin: "Admin", manager: "Manager", member: "Thành viên" }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 text-[16px] flex items-center gap-2"><Settings size={16} /> Cài đặt nhóm</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Basic info — creator only */}
          {isCreator && (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-slate-600 block mb-2">Biểu tượng</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} type="button" onClick={() => setEmoji(e)}
                      className={cn("w-9 h-9 rounded-lg text-xl flex items-center justify-center border-2 transition-all",
                        emoji === e ? "border-brand-600 bg-brand-50 scale-110" : "border-slate-200 hover:border-slate-400")}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-600 block mb-1">Tên nhóm</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-brand-600" required />
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-600 block mb-1">Mô tả</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-brand-600 resize-none" />
              </div>
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </form>
          )}

          {/* Members — creator + manager (#2) */}
          {(isCreator || isManager) && (
            <div className={cn(!isCreator && "pt-0")}>
              <h3 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-2"><UserPlus size={14} /> Thành viên ({members.length})</h3>
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
                    <Avatar name={m.user_name} email={m.user_email} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-700 truncate">{m.user_name || m.user_email}</p>
                      <p className="text-[11px] text-slate-400 truncate">{m.user_email}</p>
                    </div>
                    {/* Role badge / dropdown (#2) */}
                    {isCreator && m.role !== "admin" ? (
                      <select
                        value={m.role || "member"}
                        onChange={e => handleRoleChange(m.user_email, e.target.value)}
                        className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-600 focus:outline-none focus:border-brand-600 flex-shrink-0"
                      >
                        <option value="manager">Manager</option>
                        <option value="member">Thành viên</option>
                      </select>
                    ) : (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0",
                        m.role === "admin" ? "bg-amber-50 text-amber-600" :
                        m.role === "manager" ? "bg-blue-50 text-blue-600" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {roleLabel[m.role] || "Thành viên"}
                      </span>
                    )}
                    {m.role !== "admin" && (
                      <button onClick={() => handleRemoveMember(m.user_email)}
                        className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0 ml-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add member form with autocomplete (#3) */}
              <form onSubmit={handleAddMember} className="space-y-2">
                <div className="relative">
                  <input
                    value={addEmail}
                    onChange={e => { setAddEmail(e.target.value); setSelectedUser(null); setShowSuggestions(false) }}
                    onFocus={() => userSuggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Tìm theo tên hoặc email — bấm chọn từ danh sách *"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-brand-600"
                  />
                  {showSuggestions && (
                    <div className="absolute top-full left-0 right-0 z-10 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 overflow-hidden">
                      {userSuggestions.map(u => (
                        <button
                          key={u.username}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); setSelectedUser({ username: u.username, name: u.name }); setAddEmail(u.name || u.email || u.username); setShowSuggestions(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-brand-50 text-left"
                        >
                          <Avatar name={u.name} email={u.email || u.username} size="sm" />
                          <div>
                            <p className="text-[13px] font-medium text-slate-700">{u.name || u.username}</p>
                            <p className="text-[11px] text-slate-400">{u.email || u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={addingMember || !selectedUser}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <UserPlus size={14} />
                  {addingMember ? "Đang thêm..." : "Thêm thành viên"}
                </button>
              </form>
            </div>
          )}

          {/* AI config — creator only */}
          {isCreator && (
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-[13px] font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Bot size={14} className="text-indigo-500" /> Trợ lý AI
              </h3>
              <form onSubmit={handleSaveAI} className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-slate-600">Bật Gấu Tổ AI</label>
                  <button
                    type="button"
                    onClick={() => setAiEnabled(v => !v)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      aiEnabled ? "bg-indigo-600" : "bg-slate-200"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                      aiEnabled ? "translate-x-6" : "translate-x-1"
                    )} />
                  </button>
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1">Phạm vi AI được phép trả lời</label>
                  <textarea
                    value={aiScope}
                    onChange={e => setAiScope(e.target.value)}
                    rows={3}
                    placeholder="Để trống = không giới hạn"
                    disabled={!aiEnabled}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-indigo-400 resize-none disabled:opacity-50 disabled:bg-slate-50"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {AI_SCOPE_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!aiEnabled}
                        onClick={() => setAiScope(preset.value)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-40",
                          aiScope === preset.value
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={savingAI}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {savingAI ? "Đang lưu..." : "Lưu cài đặt AI"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
    {ConfirmDialog}
    </>
  )
}
