"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Send, Settings, UserPlus, X, Trash2, Crown, Paperclip, Bot,
  FileText, Pin, Upload, Tag, Edit2, Search, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"

// Supabase realtime client (anon key đủ để subscribe)
const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface Attachment {
  url:     string
  name:    string
  size:    number
  type:    string
}

interface ChatMessage {
  id:           string
  group_id:     string
  sender_email: string
  sender_name:  string
  content:      string
  msg_type:     string
  created_at:   string
  is_pinned?:   boolean
  attachments?: Attachment[]
}

interface Member {
  id:         string
  user_email: string
  user_name:  string | null
  role:       string
  added_at:   string
}

interface GroupInfo {
  id:                  string
  name:                string
  description:         string | null
  avatar_emoji:        string
  created_by:          string
  is_archived:         boolean
  members:             Member[]
  ai_enabled?:         boolean
  ai_scope?:           string | null
}

// Phase 3 interfaces
interface DocItem {
  id:            string
  group_id:      string
  title:         string
  description:   string | null
  file_url:      string | null
  file_name:     string | null
  file_size:     number | null
  file_type:     string | null
  tags:          string[]
  uploaded_by:   string
  uploader_name: string | null
  created_at:    string
}

interface NoteItem {
  id:           string
  group_id:     string
  content:      string
  created_by:   string
  creator_name: string | null
  is_pinned:    boolean
  created_at:   string
  updated_at:   string
}

// Tạo màu avatar từ hash email
function emailColor(email: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500",
    "bg-amber-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500",
  ]
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(name: string | null | undefined, email: string): string {
  const n = name || email
  const parts = n.split(/[\s@.]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

function Avatar({ name, email, size = "md" }: { name?: string | null; email: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[11px]" : size === "lg" ? "w-10 h-10 text-[14px]" : "w-8 h-8 text-[12px]"
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0", sz, emailColor(email))}>
      {initials(name, email)}
    </div>
  )
}

function fmtTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const EMOJI_OPTIONS = ["🐻", "🦊", "🐼", "🐨", "🦁", "🐯", "🦋", "🌟", "🎯", "🚀", "💡", "🎉"]

const AI_SCOPE_PRESETS = [
  {
    label: "Sale",
    value: "Chỉ trả lời về giá bán, tình trạng SP, SKU code, so sánh gói. KHÔNG tiết lộ COGS/margin.",
  },
  {
    label: "BD",
    value: "Trả lời về specs kỹ thuật, thông tin thị trường, báo giá so sánh. KHÔNG tiết lộ chiến lược.",
  },
  {
    label: "Ops",
    value: "Trả lời về quy trình nhập hàng, tracking, trạng thái kho. KHÔNG tiết lộ chi phí vận hành.",
  },
  { label: "Full", value: "" },
]

// File icon by type
function fileIcon(fileType: string | null): { icon: string; color: string } {
  if (!fileType) return { icon: "📄", color: "text-slate-500" }
  if (fileType.includes("pdf"))                                          return { icon: "📕", color: "text-red-500" }
  if (fileType.includes("sheet") || fileType.includes("excel") || fileType.includes("xlsx") || fileType.includes("csv"))
    return { icon: "📗", color: "text-emerald-600" }
  if (fileType.includes("word") || fileType.includes("docx") || fileType.includes("msword"))
    return { icon: "📘", color: "text-blue-600" }
  if (fileType.startsWith("image/"))                                    return { icon: "🖼️", color: "text-violet-500" }
  return { icon: "📄", color: "text-slate-500" }
}

// ── Render content with @mention highlight ──
function renderContent(
  content: string,
  myEmail: string,
  members: Member[],
): React.ReactNode {
  if (!content) return null
  // Match @word (letters, digits, dot, dash, underscore)
  const parts = content.split(/(@[\w.\-]+)/g)
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return part
    const handle = part.slice(1).toLowerCase()
    const myPrefix = myEmail.split("@")[0].toLowerCase()
    const myName   = members.find(m => m.user_email === myEmail)?.user_name?.toLowerCase()

    const isMe = handle === myPrefix || (myName && handle === myName.replace(/\s+/g, "").toLowerCase())
    if (isMe) {
      return (
        <span key={i} className="bg-yellow-100 text-yellow-800 font-semibold px-0.5 rounded">
          {part}
        </span>
      )
    }
    // Check if it matches any member
    const matchedMember = members.find(m => {
      const prefix = m.user_email.split("@")[0].toLowerCase()
      const uname  = (m.user_name || "").toLowerCase().replace(/\s+/g, "")
      return handle === prefix || handle === uname
    })
    if (matchedMember) {
      return (
        <span key={i} className="text-[#003B95] font-medium">
          {part}
        </span>
      )
    }
    return part
  })
}

// ── Settings Modal ──
function SettingsModal({
  group, onClose, onSaved, onMemberRemoved, isCreator,
}: {
  group:           GroupInfo
  onClose:         () => void
  onSaved:         (updated: Partial<GroupInfo>) => void
  onMemberRemoved: (email: string) => void
  isCreator:       boolean
}) {
  const toast = useToast()
  const [name, setName]           = useState(group.name)
  const [desc, setDesc]           = useState(group.description ?? "")
  const [emoji, setEmoji]         = useState(group.avatar_emoji || "🐻")
  const [saving, setSaving]       = useState(false)
  const [addEmail, setAddEmail]   = useState("")
  const [addName, setAddName]     = useState("")
  const [addingMember, setAddingMember] = useState(false)
  const [members, setMembers]     = useState<Member[]>(group.members)

  // AI config state
  const [aiEnabled, setAiEnabled] = useState<boolean>(group.ai_enabled ?? false)
  const [aiScope, setAiScope]     = useState<string>(group.ai_scope ?? "")
  const [savingAI, setSavingAI]   = useState(false)

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
    if (!addEmail.trim()) return
    setAddingMember(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: addEmail.trim(), user_name: addName.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Đã thêm ${addEmail.trim()}`)
      setMembers(prev => [...prev, json.data])
      setAddEmail("")
      setAddName("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(email: string) {
    try {
      const res = await fetch(`/api/to-gau/groups/${group.id}/members?email=${encodeURIComponent(email)}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setMembers(prev => prev.filter(m => m.user_email !== email))
      onMemberRemoved(email)
      toast.success("Đã xóa thành viên")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 text-[16px] flex items-center gap-2"><Settings size={16} /> Cài đặt nhóm</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Basic info */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-[13px] font-medium text-slate-600 block mb-2">Biểu tượng</label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)}
                    className={cn("w-9 h-9 rounded-lg text-xl flex items-center justify-center border-2 transition-all",
                      emoji === e ? "border-[#003B95] bg-blue-50 scale-110" : "border-slate-200 hover:border-slate-400")}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] font-medium text-slate-600 block mb-1">Tên nhóm</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#003B95]" required />
            </div>
            <div>
              <label className="text-[13px] font-medium text-slate-600 block mb-1">Mô tả</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#003B95] resize-none" />
            </div>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors">
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </form>

          {/* Members */}
          <div>
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3 flex items-center gap-2"><UserPlus size={14} /> Thành viên ({members.length})</h3>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar name={m.user_name} email={m.user_email} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{m.user_name || m.user_email}</p>
                    <p className="text-[11px] text-slate-400 truncate">{m.user_email}</p>
                  </div>
                  {m.role === "admin" && <Crown size={12} className="text-amber-500 flex-shrink-0" />}
                  {m.role !== "admin" && (
                    <button onClick={() => handleRemoveMember(m.user_email)}
                      className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add member form */}
            <form onSubmit={handleAddMember} className="space-y-2">
              <input value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="Email người dùng *"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]" type="email" />
              <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Tên hiển thị (tùy chọn)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]" />
              <button type="submit" disabled={addingMember || !addEmail.trim()}
                className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                <UserPlus size={14} />
                {addingMember ? "Đang thêm..." : "Thêm thành viên"}
              </button>
            </form>
          </div>

          {/* AI config — creator only */}
          {isCreator && (
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-[13px] font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Bot size={14} className="text-indigo-500" /> Trợ lý AI
              </h3>
              <form onSubmit={handleSaveAI} className="space-y-4">
                {/* Toggle */}
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

                {/* Scope */}
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
                  {/* Quick preset buttons */}
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
  )
}

// ── File Preview (before send) ──
function FilePreviewItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/")
  const [objUrl, setObjUrl] = useState<string>("")

  useEffect(() => {
    if (!isImage) return
    const url = URL.createObjectURL(file)
    setObjUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <div className="relative flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1.5 text-[12px] text-slate-700 max-w-[160px]">
      {isImage && objUrl ? (
        <img src={objUrl} alt={file.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
      ) : (
        <span className="text-lg flex-shrink-0">📄</span>
      )}
      <span className="truncate flex-1 min-w-0">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 text-slate-400 hover:text-rose-500"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Message Attachment Display ──
function AttachmentDisplay({ attachment }: { attachment: Attachment }) {
  const [lightbox, setLightbox] = useState(false)
  const isImage = attachment.type.startsWith("image/")

  if (isImage) {
    return (
      <>
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 rounded-lg cursor-pointer object-contain mt-1"
          onClick={() => setLightbox(true)}
        />
        {lightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <img src={attachment.url} alt={attachment.name} className="max-w-full max-h-full rounded-xl" />
          </div>
        )}
      </>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-3 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors text-[13px] text-slate-700 max-w-[240px]"
    >
      <span className="text-lg flex-shrink-0">📄</span>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{attachment.name}</p>
        <p className="text-[11px] text-slate-400">{fmtFileSize(attachment.size)}</p>
      </div>
      <span className="text-[11px] text-[#003B95] font-medium flex-shrink-0">Tải về</span>
    </a>
  )
}

// ── Docs Panel ──
function DocsPanel({
  groupId, myEmail, isPrivileged,
}: {
  groupId: string
  myEmail: string
  isPrivileged: boolean
}) {
  const toast = useToast()
  const [docs, setDocs]           = useState<DocItem[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [showUpload, setShowUpload]   = useState(false)

  // Upload form state
  const [docTitle, setDocTitle]     = useState("")
  const [docDesc, setDocDesc]       = useState("")
  const [docFile, setDocFile]       = useState<File | null>(null)
  const [docTags, setDocTags]       = useState<string[]>([])
  const [tagInput, setTagInput]     = useState("")
  const [uploading, setUploading]   = useState(false)
  const docFileRef                  = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    setDocsLoading(true)
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/docs`)
      if (!res.ok) return
      const json = await res.json()
      setDocs(json.data ?? [])
    } catch {
      // ignore
    } finally {
      setDocsLoading(false)
    }
  }, [groupId])

  useEffect(() => { loadDocs() }, [loadDocs])

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const tag = tagInput.trim()
      if (tag && !docTags.includes(tag)) setDocTags(prev => [...prev, tag])
      setTagInput("")
    }
  }

  function removeTag(tag: string) {
    setDocTags(prev => prev.filter(t => t !== tag))
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!docTitle.trim()) return
    setUploading(true)
    try {
      let fileUrl: string | null   = null
      let fileName: string | null  = null
      let fileSize: number | null  = null
      let fileType: string | null  = null

      if (docFile) {
        const fd = new FormData()
        fd.append("file", docFile)
        fd.append("group_id", groupId)
        const upRes = await fetch("/api/to-gau/upload", { method: "POST", body: fd })
        if (!upRes.ok) { const j = await upRes.json(); throw new Error(j.error ?? "Upload lỗi") }
        const upJson = await upRes.json()
        fileUrl  = upJson.url
        fileName = upJson.name
        fileSize = upJson.size
        fileType = upJson.type
      }

      const res = await fetch(`/api/to-gau/groups/${groupId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle.trim(),
          description: docDesc.trim() || null,
          file_url:  fileUrl,
          file_name: fileName,
          file_size: fileSize,
          file_type: fileType,
          tags: docTags,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success("Đã thêm tài liệu")
      setDocs(prev => [json.data, ...prev])
      // Reset form
      setDocTitle("")
      setDocDesc("")
      setDocFile(null)
      setDocTags([])
      setTagInput("")
      setShowUpload(false)
      if (docFileRef.current) docFileRef.current.value = ""
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Xóa tài liệu này?")) return
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/docs?doc_id=${docId}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setDocs(prev => prev.filter(d => d.id !== docId))
      toast.success("Đã xóa tài liệu")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-700 text-[15px] flex items-center gap-2">
          <FileText size={16} className="text-[#003B95]" /> Tài liệu nhóm
        </h2>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] transition-colors"
        >
          <Upload size={13} /> Tải lên
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="mb-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <form onSubmit={handleUpload} className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1">Tiêu đề *</label>
              <input
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                placeholder="Tên tài liệu"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1">Mô tả</label>
              <textarea
                value={docDesc}
                onChange={e => setDocDesc(e.target.value)}
                rows={2}
                placeholder="Mô tả ngắn (tùy chọn)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95] resize-none"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1">File đính kèm</label>
              <div className="flex items-center gap-2">
                <input
                  ref={docFileRef}
                  type="file"
                  accept="image/*,.pdf,.xlsx,.docx,.txt,.csv"
                  className="hidden"
                  onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => docFileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50 transition-colors"
                >
                  <Paperclip size={12} /> Chọn file
                </button>
                {docFile && (
                  <span className="text-[12px] text-slate-600 truncate max-w-[160px]">
                    {docFile.name}
                    <button type="button" onClick={() => { setDocFile(null); if (docFileRef.current) docFileRef.current.value = "" }} className="ml-1 text-slate-400 hover:text-rose-500">
                      <X size={11} className="inline" />
                    </button>
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1">
                <Tag size={11} className="inline mr-1" />Tags (Enter để thêm)
              </label>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Nhập tag rồi Enter..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95]"
              />
              {docTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {docTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="text-blue-400 hover:text-rose-500">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || !docTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Upload size={13} />}
                {uploading ? "Đang tải lên..." : "Lưu tài liệu"}
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Docs list */}
      {docsLoading ? (
        <div className="flex items-center justify-center h-32">
          <span className="text-slate-400 text-[14px]">Đang tải...</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={36} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Chưa có tài liệu nào</p>
          <p className="text-slate-400 text-[13px] mt-1">Tải lên tài liệu đầu tiên!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map(doc => {
            const fi       = fileIcon(doc.file_type)
            const canDelete = doc.uploaded_by === myEmail || isPrivileged
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2">
                {/* Icon + title */}
                <div className="flex items-start gap-3">
                  <span className={cn("text-2xl flex-shrink-0 mt-0.5", fi.color)}>{fi.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-[14px] leading-tight line-clamp-2">{doc.title}</p>
                    {doc.description && (
                      <p className="text-slate-500 text-[12px] mt-0.5 line-clamp-1">{doc.description}</p>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 truncate">{doc.uploader_name || doc.uploaded_by}</p>
                    <p className="text-[10px] text-slate-400">{fmtDate(doc.created_at)}{doc.file_size ? ` · ${fmtFileSize(doc.file_size)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg border border-slate-200 text-[#003B95] hover:bg-blue-50 transition-colors"
                        title="Tải về"
                      >
                        <Upload size={12} className="rotate-180" />
                      </a>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Notes Panel ──
function NotesPanel({
  groupId, myEmail, isPrivileged,
}: {
  groupId: string
  myEmail: string
  isPrivileged: boolean
}) {
  const toast = useToast()
  const [notes, setNotes]           = useState<NoteItem[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [newNoteContent, setNewNoteContent] = useState("")
  const [addingNote, setAddingNote]   = useState(false)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/notes`)
      if (!res.ok) return
      const json = await res.json()
      setNotes(json.data ?? [])
    } catch {
      // ignore
    } finally {
      setNotesLoading(false)
    }
  }, [groupId])

  useEffect(() => { loadNotes() }, [loadNotes])

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNoteContent.trim()) return
    setAddingNote(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setNotes(prev => [json.data, ...prev])
      setNewNoteContent("")
      toast.success("Đã thêm ghi chú")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAddingNote(false)
    }
  }

  async function handleSaveEdit(noteId: string) {
    if (!editContent.trim()) return
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/notes?note_id=${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setNotes(prev => prev.map(n => n.id === noteId ? json.data : n))
      setEditingNote(null)
      setEditContent("")
      toast.success("Đã cập nhật ghi chú")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm("Xóa ghi chú này?")) return
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/notes?note_id=${noteId}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setNotes(prev => prev.filter(n => n.id !== noteId))
      toast.success("Đã xóa ghi chú")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50">
      <div className="flex items-center gap-2 mb-4">
        <Pin size={16} className="text-[#003B95]" />
        <h2 className="font-semibold text-slate-700 text-[15px]">Ghi chú dùng chung</h2>
      </div>

      {/* Add note form */}
      <form onSubmit={handleAddNote} className="mb-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <textarea
          value={newNoteContent}
          onChange={e => setNewNoteContent(e.target.value)}
          placeholder="Nhập ghi chú mới..."
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#003B95] resize-none"
        />
        <button
          type="submit"
          disabled={addingNote || !newNoteContent.trim()}
          className="px-4 py-2 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <Pin size={13} />
          {addingNote ? "Đang thêm..." : "Thêm ghi chú"}
        </button>
      </form>

      {/* Notes list */}
      {notesLoading ? (
        <div className="flex items-center justify-center h-32">
          <span className="text-slate-400 text-[14px]">Đang tải...</span>
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Pin size={36} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Chưa có ghi chú nào</p>
          <p className="text-slate-400 text-[13px] mt-1">Thêm ghi chú đầu tiên!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const canEdit   = note.created_by === myEmail || isPrivileged
            const isEditing = editingNote === note.id
            return (
              <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={4}
                      autoFocus
                      className="w-full border border-[#003B95] rounded-lg px-3 py-2 text-[13px] focus:outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={!editContent.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[#003B95] text-white text-[12px] font-medium hover:bg-[#002d73] disabled:opacity-50 transition-colors"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={() => { setEditingNote(null); setEditContent("") }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50 transition-colors"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[14px] text-slate-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-slate-500">{note.creator_name || note.created_by}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(note.created_at)}{note.updated_at !== note.created_at ? " (đã sửa)" : ""}</p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditingNote(note.id); setEditContent(note.content) }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-[#003B95] hover:border-blue-200 transition-colors"
                            title="Sửa"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Chat Room ──
export default function ToGauRoomPage() {
  const { data: session } = useSession()
  const params  = useParams()
  const router  = useRouter()
  const toast   = useToast()
  const groupId = params.id as string

  const [group, setGroup]         = useState<GroupInfo | null>(null)
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [loading, setLoading]     = useState(true)
  const [msgLoading, setMsgLoading] = useState(true)
  const [content, setContent]     = useState("")
  const [sending, setSending]     = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  // Phase 2: file upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading]         = useState(false)
  const fileInputRef                      = useRef<HTMLInputElement>(null)

  // Phase 2: AI states
  const [askingAI, setAskingAI] = useState(false)

  // Phase 3: tabs
  const [activeTab, setActiveTab] = useState<"chat" | "docs" | "notes">("chat")

  // Phase 4: @mention
  const [mentionQuery, setMentionQuery]   = useState<string | null>(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionCursorPos, setMentionCursorPos] = useState(0)

  // Phase 4: search
  const [searchOpen, setSearchOpen]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState("")
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchDebounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phase 4: pinned messages
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])
  const [pinnedExpanded, setPinnedExpanded] = useState(false)

  // Phase 4: scroll-to-bottom
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesAreaRef = useRef<HTMLDivElement>(null)

  // Pinned message hover
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const myEmail   = session?.user?.email || ""
  const myName    = session?.user?.name  || ""
  const myRole    = session?.user?.role  || ""
  const isPrivileged = myRole === "creator" || myRole === "admin"

  // Load group info
  useEffect(() => {
    if (!groupId) return
    fetch(`/api/to-gau/groups/${groupId}`)
      .then(r => {
        if (r.status === 403) { setForbidden(true); return null }
        return r.json()
      })
      .then(json => {
        if (!json) return
        setGroup(json.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [groupId])

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!groupId) return
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/messages?limit=50`)
      if (!res.ok) return
      const json = await res.json()
      setMessages(json.data ?? [])
    } catch {
      // ignore
    } finally {
      setMsgLoading(false)
    }
  }, [groupId])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Load pinned messages
  const loadPinned = useCallback(async () => {
    if (!groupId) return
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/messages?pinned=true&limit=20`)
      if (!res.ok) return
      const json = await res.json()
      setPinnedMessages(json.data ?? [])
    } catch {
      // ignore
    }
  }, [groupId])

  useEffect(() => { loadPinned() }, [loadPinned])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Scroll button visibility
  function handleMessagesScroll() {
    const el = messagesAreaRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(distFromBottom > 200)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Supabase Realtime subscription
  useEffect(() => {
    if (!groupId) return
    const channel = supabaseRealtime
      .channel(`chat_messages:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as ChatMessage
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, is_pinned: updated.is_pinned } : m))
          // Sync pinned list
          if (updated.is_pinned) {
            setPinnedMessages(prev => prev.some(m => m.id === updated.id) ? prev : [updated, ...prev])
          } else {
            setPinnedMessages(prev => prev.filter(m => m.id !== updated.id))
          }
        }
      )
      .subscribe()

    return () => { supabaseRealtime.removeChannel(channel) }
  }, [groupId])

  // Handle file selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setSelectedFiles(prev => [...prev, ...files])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeSelectedFile(idx: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // @mention: parse textarea input
  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setContent(val)

    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? val.length
    // Find the last @ before cursor
    const textBefore = val.slice(0, cursor)
    const atIdx = textBefore.lastIndexOf("@")
    if (atIdx !== -1) {
      const afterAt = textBefore.slice(atIdx + 1)
      // No space in afterAt = still typing a mention
      if (!/\s/.test(afterAt)) {
        setMentionQuery(afterAt)
        setMentionCursorPos(atIdx)
        setShowMentionDropdown(true)
        return
      }
    }
    setMentionQuery(null)
    setShowMentionDropdown(false)
  }

  // @mention: filter members
  const mentionSuggestions = useMemo(() => {
    if (!group || mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return group.members
      .filter(m => {
        const name  = (m.user_name || "").toLowerCase()
        const email = m.user_email.toLowerCase()
        return !q || name.includes(q) || email.split("@")[0].includes(q)
      })
      .slice(0, 5)
  }, [group, mentionQuery])

  function selectMention(member: Member) {
    const handle = member.user_name
      ? member.user_name.replace(/\s+/g, "")
      : member.user_email.split("@")[0]
    const before = content.slice(0, mentionCursorPos)
    const after  = content.slice(mentionCursorPos + 1 + (mentionQuery?.length ?? 0))
    const newVal = `${before}@${handle} ${after}`
    setContent(newVal)
    setShowMentionDropdown(false)
    setMentionQuery(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // Search debounce
  useEffect(() => {
    if (!searchOpen) {
      setSearchResults([])
      return
    }
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res  = await fetch(`/api/to-gau/groups/${groupId}/messages?search=${encodeURIComponent(searchQuery)}&limit=20`)
        const json = await res.json()
        setSearchResults(json.data ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchQuery, searchOpen, groupId])

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [searchOpen])

  // Highlight matching text in search results
  function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  // Pin/unpin message
  async function togglePin(msgId: string) {
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/messages/${msgId}/pin`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const { id, is_pinned } = json.data
      // Update messages
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned } : m))
      // Update pinned list
      if (is_pinned) {
        const pinned = messages.find(m => m.id === id)
        if (pinned) setPinnedMessages(prev => [{ ...pinned, is_pinned: true }, ...prev.filter(m => m.id !== id)])
      } else {
        setPinnedMessages(prev => prev.filter(m => m.id !== id))
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    }
  }

  async function sendMessage() {
    const text = content.trim()
    if ((!text && selectedFiles.length === 0) || sending || uploading) return

    setSending(true)
    setContent("")
    setShowMentionDropdown(false)
    const filesToSend = [...selectedFiles]
    setSelectedFiles([])

    // Upload files first
    let uploadedAttachments: Attachment[] = []
    if (filesToSend.length > 0) {
      setUploading(true)
      try {
        uploadedAttachments = await Promise.all(
          filesToSend.map(async (file) => {
            const fd = new FormData()
            fd.append("file", file)
            fd.append("group_id", groupId)
            const res = await fetch("/api/to-gau/upload", { method: "POST", body: fd })
            if (!res.ok) {
              const j = await res.json()
              throw new Error(j.error ?? "Upload lỗi")
            }
            const { url, name, size, type } = await res.json()
            return { url, name, size, type } as Attachment
          })
        )
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Upload thất bại")
        setSending(false)
        setUploading(false)
        setContent(text)
        setSelectedFiles(filesToSend)
        return
      } finally {
        setUploading(false)
      }
    }

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id: tempId, group_id: groupId, sender_email: myEmail,
      sender_name: myName || myEmail, content: text,
      msg_type: uploadedAttachments.length > 0 && !text
        ? (uploadedAttachments[0].type.startsWith("image/") ? "image" : "file")
        : "text",
      created_at: new Date().toISOString(),
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error)
      }
      const json = await res.json()
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === tempId ? json.data : m))
    } catch (err: unknown) {
      // Remove optimistic on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setContent(text)
      setSelectedFiles(filesToSend)
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  async function askAI() {
    const question = content.trim()
    if (!question || askingAI) return

    setAskingAI(true)
    setContent("")

    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // AI message will arrive via realtime subscription
    } catch (err: unknown) {
      setContent(question)
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAskingAI(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // If mention dropdown open, Enter selects first suggestion
    if (showMentionDropdown && mentionSuggestions.length > 0 && e.key === "Enter") {
      e.preventDefault()
      selectMention(mentionSuggestions[0])
      return
    }
    if (showMentionDropdown && e.key === "Escape") {
      setShowMentionDropdown(false)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleMemberRemoved(email: string) {
    if (!group) return
    setGroup(prev => prev ? { ...prev, members: prev.members.filter(m => m.user_email !== email) } : prev)
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Không có quyền truy cập</h3>
        <p className="text-slate-400 text-[14px]">Bạn không phải thành viên của nhóm này.</p>
        <Link href="/analytics/to-gau" className="mt-4 text-[#003B95] text-[14px] hover:underline">← Quay lại</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="p-4 border-b border-slate-200 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/4" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400 text-[14px]">Đang tải...</div>
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-slate-400">Không tìm thấy nhóm.</p>
        <Link href="/analytics/to-gau" className="mt-3 text-[#003B95] text-[14px] hover:underline">← Quay lại</Link>
      </div>
    )
  }

  const showAIButton = group.ai_enabled !== false
  const isArchived   = group.is_archived

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
          <Link href="/analytics/to-gau" className="text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <span className="text-xl">{group.avatar_emoji || "🐻"}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-slate-800 text-[15px] leading-tight truncate">{group.name}</h1>
            <p className="text-slate-400 text-[12px]">{group.members.length} thành viên</p>
          </div>
          {group.ai_enabled && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-medium">
              <Bot size={11} /> AI
            </span>
          )}
          {/* Search button */}
          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) { setSearchQuery(""); setSearchResults([]) } }}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              searchOpen
                ? "bg-[#003B95] text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            )}
            title="Tìm kiếm tin nhắn"
          >
            <Search size={15} />
          </button>
        </div>

        {/* Archived banner */}
        {isArchived && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-[13px]">
            <AlertTriangle size={14} className="flex-shrink-0" />
            Nhóm này đã được lưu trữ. Chỉ có thể xem, không thể gửi tin.
          </div>
        )}

        {/* Search panel */}
        {searchOpen && (
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 shadow-sm">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm tin nhắn trong nhóm..."
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-[#003B95]"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Search results */}
            {(searchLoading || searchResults.length > 0 || (searchQuery && !searchLoading)) && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-6 text-slate-400 text-[13px]">
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-[#003B95] rounded-full animate-spin mr-2" /> Đang tìm...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-[13px]">Không tìm thấy kết quả</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchResults.map(msg => (
                      <button
                        key={msg.id}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        onClick={() => {
                          // Scroll to message in chat (find in messages list)
                          const el = document.getElementById(`msg-${msg.id}`)
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" })
                            el.classList.add("bg-yellow-50")
                            setTimeout(() => el.classList.remove("bg-yellow-50"), 2000)
                          }
                          setSearchOpen(false)
                          setSearchQuery("")
                          setSearchResults([])
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-medium text-slate-700">{msg.sender_name}</span>
                          <span className="text-[11px] text-slate-400">{fmtTime(msg.created_at)}</span>
                        </div>
                        <p className="text-[13px] text-slate-600 line-clamp-2">
                          {highlightMatch(msg.content, searchQuery)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pinned messages strip */}
        {pinnedMessages.length > 0 && activeTab === "chat" && (
          <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200">
            <button
              onClick={() => setPinnedExpanded(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-2 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <Pin size={13} className="flex-shrink-0" />
              <span className="text-[12px] font-medium flex-1 text-left">
                📌 {pinnedMessages.length} tin nhắn đã ghim
              </span>
              {pinnedExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {pinnedExpanded && (
              <div className="px-4 pb-3 space-y-1.5 max-h-40 overflow-y-auto">
                {pinnedMessages.map(msg => (
                  <div key={msg.id} className="bg-white rounded-lg px-3 py-2 border border-amber-200 text-[13px]">
                    <span className="font-medium text-slate-700 mr-1.5">{msg.sender_name}:</span>
                    <span className="text-slate-600 line-clamp-1">{msg.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4">
          <div className="flex gap-0">
            {(["chat", "docs", "notes"] as const).map(tab => {
              const labels: Record<typeof tab, string> = { chat: "💬 Chat", docs: "📄 Docs", notes: "📌 Notes" }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors",
                    activeTab === tab
                      ? "border-[#003B95] text-[#003B95]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  {labels[tab]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "chat" && (
          <>
            {/* Messages */}
            <div
              ref={messagesAreaRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50 relative"
            >
              {msgLoading ? (
                <div className="flex items-center justify-center h-32">
                  <span className="text-slate-400 text-[14px]">Đang tải tin nhắn...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="text-5xl mb-3">{group.avatar_emoji || "🐻"}</div>
                  <p className="text-slate-500 font-medium">Bắt đầu cuộc trò chuyện!</p>
                  <p className="text-slate-400 text-[13px] mt-1">Gửi tin nhắn đầu tiên vào nhóm.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    const isMe  = msg.sender_email === myEmail
                    const isAI  = msg.msg_type === "ai" || msg.sender_email === "ai@to-gau"
                    const prevMsg = idx > 0 ? messages[idx - 1] : null
                    const showAvatar = !prevMsg || prevMsg.sender_email !== msg.sender_email
                    const isHovered = hoveredMsgId === msg.id

                    if (isAI) {
                      return (
                        <div key={msg.id} id={`msg-${msg.id}`} className={cn("flex items-end gap-2 flex-row transition-colors rounded-xl px-1", showAvatar ? "mt-3" : "mt-0.5")}>
                          <div className="w-8 flex-shrink-0">
                            {showAvatar && (
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[13px] flex-shrink-0">
                                🤖
                              </div>
                            )}
                          </div>

                          <div className="max-w-[72%] min-w-0 flex flex-col items-start">
                            {showAvatar && (
                              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                                <p className="text-[11px] text-slate-400">{msg.sender_name}</p>
                                <span className="px-1.5 py-0 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-semibold uppercase tracking-wide">AI</span>
                              </div>
                            )}
                            <div className="px-3 py-2 rounded-2xl rounded-bl-sm text-[14px] leading-relaxed whitespace-pre-wrap break-words bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 text-slate-800 shadow-sm">
                              {msg.content}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 px-1 text-left">
                              {fmtTime(msg.created_at)}
                            </p>
                          </div>

                          <div className="w-8 flex-shrink-0" />
                        </div>
                      )
                    }

                    return (
                      <div
                        key={msg.id}
                        id={`msg-${msg.id}`}
                        className={cn("flex items-end gap-2 transition-colors rounded-xl px-1 relative group/msg", isMe ? "flex-row-reverse" : "flex-row", showAvatar ? "mt-3" : "mt-0.5")}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                      >
                        {/* Avatar placeholder */}
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && !isMe && <Avatar name={msg.sender_name} email={msg.sender_email} size="sm" />}
                        </div>

                        <div className={cn("max-w-[72%] min-w-0 relative", isMe ? "items-end" : "items-start", "flex flex-col")}>
                          {showAvatar && !isMe && (
                            <p className="text-[11px] text-slate-400 mb-0.5 px-1">{msg.sender_name}</p>
                          )}
                          <div className={cn(
                            "px-3 py-2 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words",
                            isMe
                              ? "bg-[#003B95] text-white rounded-br-sm"
                              : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm",
                            msg.is_pinned && "ring-1 ring-amber-400"
                          )}>
                            {renderContent(msg.content, myEmail, group.members)}
                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {msg.attachments.map((att, i) => (
                                  <AttachmentDisplay key={i} attachment={att} />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={cn("flex items-center gap-1.5 mt-0.5 px-1", isMe ? "flex-row-reverse" : "flex-row")}>
                            <p className="text-[10px] text-slate-400">
                              {fmtTime(msg.created_at)}
                            </p>
                            {msg.is_pinned && <Pin size={10} className="text-amber-500" />}
                          </div>
                        </div>

                        {/* Pin action button — hover, privileged only */}
                        {isPrivileged && isHovered && (
                          <div className={cn(
                            "absolute top-0 z-10 flex items-center",
                            isMe ? "left-10" : "right-10"
                          )}>
                            <button
                              onClick={() => togglePin(msg.id)}
                              title={msg.is_pinned ? "Bỏ ghim" : "Ghim tin nhắn"}
                              className={cn(
                                "p-1 rounded-lg border text-[11px] flex items-center gap-1 transition-colors shadow-sm",
                                msg.is_pinned
                                  ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                                  : "bg-white border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600"
                              )}
                            >
                              <Pin size={11} />
                              {msg.is_pinned ? "Bỏ ghim" : "Ghim"}
                            </button>
                          </div>
                        )}

                        {/* Avatar for me */}
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && isMe && <Avatar name={myName} email={myEmail} size="sm" />}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </>
              )}

              {/* Scroll to bottom button */}
              {showScrollBtn && (
                <button
                  onClick={scrollToBottom}
                  className="fixed bottom-24 right-72 z-20 w-9 h-9 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-[#003B95] hover:text-[#003B95] transition-colors"
                  title="Cuộn xuống"
                >
                  <ChevronDown size={18} />
                </button>
              )}
            </div>

            {/* Input bar */}
            {!isArchived && (
              <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                {/* File preview row */}
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedFiles.map((file, idx) => (
                      <FilePreviewItem key={idx} file={file} onRemove={() => removeSelectedFile(idx)} />
                    ))}
                  </div>
                )}

                {/* @mention dropdown */}
                {showMentionDropdown && mentionSuggestions.length > 0 && (
                  <div className="mb-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {mentionSuggestions.map(member => (
                      <button
                        key={member.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectMention(member) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left"
                      >
                        <Avatar name={member.user_name} email={member.user_email} size="sm" />
                        <div>
                          <p className="text-[13px] font-medium text-slate-700">{member.user_name || member.user_email}</p>
                          <p className="text-[11px] text-slate-400">{member.user_email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  {/* Paperclip button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    className="flex-shrink-0 w-9 h-9 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50 hover:text-[#003B95] disabled:opacity-40 transition-colors"
                    title="Đính kèm file"
                  >
                    <Paperclip size={15} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.xlsx,.docx,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng, @ để mention)"
                    rows={1}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#003B95] focus:ring-2 focus:ring-[#003B95]/20 resize-none max-h-32 overflow-y-auto"
                    style={{ minHeight: "42px" }}
                  />

                  {/* AI button */}
                  {showAIButton && (
                    <button
                      type="button"
                      onClick={askAI}
                      disabled={!content.trim() || askingAI || sending}
                      title="Hỏi AI Gấu Tổ"
                      className="flex-shrink-0 w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {askingAI ? (
                        <span className="text-[13px] animate-pulse">🤖</span>
                      ) : (
                        <Bot size={15} />
                      )}
                    </button>
                  )}

                  {/* Send button */}
                  <button
                    onClick={sendMessage}
                    disabled={(!content.trim() && selectedFiles.length === 0) || sending || uploading}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#003B95] text-white flex items-center justify-center hover:bg-[#002d73] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {(sending || uploading) ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Archived: no-input notice */}
            {isArchived && (
              <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[13px] text-slate-400">
                Nhóm đã lưu trữ — không thể gửi tin nhắn mới
              </div>
            )}
          </>
        )}

        {activeTab === "docs" && (
          <DocsPanel groupId={groupId} myEmail={myEmail} isPrivileged={isPrivileged} />
        )}

        {activeTab === "notes" && (
          <NotesPanel groupId={groupId} myEmail={myEmail} isPrivileged={isPrivileged} />
        )}
      </div>

      {/* Right sidebar: Members */}
      <div className="w-60 flex-shrink-0 border-l border-slate-200 bg-white flex-col hidden md:flex">
        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-[13px] font-semibold text-slate-700">Thành viên ({group.members.length})</h3>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {group.members.map(m => (
            <div key={m.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50">
              <Avatar name={m.user_name} email={m.user_email} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-700 truncate">{m.user_name || m.user_email}</p>
                {m.role === "admin" && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                    <Crown size={9} /> Admin
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {isPrivileged && (
          <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0 space-y-2">
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[13px] font-medium hover:bg-slate-50 transition-colors"
            >
              <Settings size={14} /> Cài đặt
            </button>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && group && (
        <SettingsModal
          group={group}
          onClose={() => setShowSettings(false)}
          onSaved={(updated) => setGroup(prev => prev ? { ...prev, ...updated } : prev)}
          onMemberRemoved={handleMemberRemoved}
          isCreator={isPrivileged}
        />
      )}
    </div>
  )
}
