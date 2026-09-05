"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Send, Settings, X, Trash2, Crown, Paperclip, Bot,
  Pin, Upload, Edit2, Search, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { useDbRole } from "@/lib/use-role-guard"
import { Avatar } from "@/components/to-gau/avatar"
import { SettingsModal } from "@/components/to-gau/settings-modal"
import { DocsPanel } from "@/components/to-gau/docs-panel"
import { NotesPanel } from "@/components/to-gau/notes-panel"
import { WikiPanel } from "@/components/to-gau/wiki-panel"
import { FilePreviewItem, AttachmentDisplay } from "@/components/to-gau/file-preview"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { renderContent, fmtTime } from "@/lib/to-gau-format"
import type { Attachment, ChatMessage, Member, GroupInfo } from "@/lib/to-gau-types"

// Supabase realtime client (anon key đủ để subscribe)
const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// s183 Phase 5 (tiếp): Avatar/SettingsModal/DocsPanel/NotesPanel/WikiPanel/FilePreviewItem/
// AttachmentDisplay/ConfirmModal+useConfirm đã tách sang components/to-gau/*.tsx; types (Attachment/
// ChatMessage/Member/GroupInfo/DocItem/NoteItem/WikiPage/WikiVersion/GroupOption) sang lib/to-gau-types.ts;
// format helpers (emailColor/initials/fmtTime/fmtDate/fmtFileSize/fileIcon/renderContent/escapeHtml/
// renderMarkdown) sang lib/to-gau-format.tsx. Tách cơ học, không đổi hành vi.

// ── Main Chat Room ──
export default function ToGauRoomPage() {

  const { data: session } = useSession()
  const params  = useParams()
  const router  = useRouter()
  const toast   = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
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

  // Phase 3: tabs — "tailieu" gộp Wiki (Chính thức) + Docs/Notes (Của nhóm)
  const [activeTab, setActiveTab]     = useState<"chat" | "tailieu">("chat")
  const [docTrack, setDocTrack]       = useState<"official" | "group">("official")
  const [groupSubTab, setGroupSubTab] = useState<"docs" | "notes">("docs")

  // Phase 4: @mention
  const [mentionQuery, setMentionQuery]   = useState<string | null>(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionCursorPos, setMentionCursorPos] = useState(0)
  const [mentionIdx, setMentionIdx]       = useState(0)

  // Phase 4: search
  const [searchOpen, setSearchOpen]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState("")
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchDebounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phase 4: pinned messages
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])
  const [pinnedExpanded, setPinnedExpanded] = useState(false)

  // scroll-to-bottom
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesAreaRef = useRef<HTMLDivElement>(null)

  // load more
  const [hasMore, setHasMore]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newMsgCount, setNewMsgCount] = useState(0)

  // Pinned message hover
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)

  // edit/recall
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editContent, setEditContent]   = useState("")
  const [savingEdit, setSavingEdit]     = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // myEmail giữ tên biến cũ nhưng thực chất chứa USERNAME (không phải email thật) — fix bug identity-collision:
  // nhiều user Lark chưa gắn email → session.user.email rỗng cho MỌI user như vậy → cùng chung "" → lộ chéo
  // dữ liệu nhóm. username luôn duy nhất + luôn có. Xem CLAUDE.md / docs/wiki/system/tabs/analytics-to-gau.md.
  const myEmail      = session?.user?.username || ""
  const myName       = session?.user?.name  || ""
  // Role TƯƠI từ DB (không phải JWT) — backend (kb/wiki routes) đã dùng getDbRole(), FE phải khớp
  // để tránh admin mới cấp quyền không thấy nút Wiki cho tới khi re-login (JWT maxAge 1 ngày).
  const dbRole       = useDbRole()
  const myRole       = dbRole ?? session?.user?.role ?? ""
  const isPrivileged = myRole === "creator" || myRole === "admin"
  // isManager: creator/admin toàn hệ thống, hoặc manager của group này
  const isManager    = isPrivileged || (group?.my_member_role === "manager")

  // Dùng ref để realtime callback luôn đọc myEmail mới nhất (tránh stale closure)
  const myEmailRef = useRef(myEmail)
  useEffect(() => { myEmailRef.current = myEmail }, [myEmail])

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

  // Load messages (initial)
  const loadMessages = useCallback(async () => {
    if (!groupId) return
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/messages?limit=50`)
      if (!res.ok) return
      const json = await res.json()
      const data = json.data ?? []
      setMessages(data)
      setHasMore(data.length === 50)
      // Scroll to bottom sau khi load lần đầu
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
    } catch {
      // ignore
    } finally {
      setMsgLoading(false)
    }
  }, [groupId])

  // Load thêm tin nhắn cũ (cursor pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !messages.length) return
    const oldestId = messages[0].id
    const el = messagesAreaRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    setLoadingMore(true)
    try {
      const res  = await fetch(`/api/to-gau/groups/${groupId}/messages?limit=50&before=${oldestId}`)
      if (!res.ok) return
      const json = await res.json()
      const older = json.data ?? []
      if (!older.length) { setHasMore(false); return }
      setMessages(prev => [...older, ...prev])
      setHasMore(older.length === 50)
      // Giữ nguyên scroll position sau khi prepend
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
      })
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }, [groupId, loadingMore, hasMore, messages])

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

  // Kiểm tra user có đang ở gần đáy không (ngưỡng 120px)
  const isAtBottom = useCallback(() => {
    const el = messagesAreaRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  // Scroll button visibility + reset badge khi user kéo xuống đáy
  function handleMessagesScroll() {
    const el = messagesAreaRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(distFromBottom > 200)
    if (distFromBottom < 60) setNewMsgCount(0)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    setNewMsgCount(0)
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
          const wasAtBottom = isAtBottom()
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          if (wasAtBottom) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }))
          } else if (newMsg.sender_email !== myEmailRef.current) {
            setNewMsgCount(prev => prev + 1)
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as ChatMessage
          // Sync nội dung (edit/recall) + pin
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
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
        setMentionIdx(0)
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

  // Auto-resize textarea theo nội dung
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "42px"
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`
  }, [content])

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

  // Sửa nội dung tin nhắn (#4)
  async function handleSaveEdit(msgId: string) {
    if (!editContent.trim() || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: json.data.content, edited_at: json.data.edited_at } : m))
      setEditingMsgId(null)
      setEditContent("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setSavingEdit(false)
    }
  }

  // Thu hồi tin nhắn (#4)
  async function handleRecall(msgId: string) {
    if (!await confirmDialog("Thu hồi tin nhắn này?")) return
    try {
      const res = await fetch(`/api/to-gau/groups/${groupId}/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_recalled: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: json.data.content, is_recalled: true, attachments: [] } : m))
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
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }))

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
      // Add AI message immediately; dedup check handles if realtime also fires
      if (json.data) {
        setMessages(prev => prev.some(m => m.id === json.data.id) ? prev : [...prev, json.data])
      }
    } catch (err: unknown) {
      setContent(question)
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally {
      setAskingAI(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentionDropdown && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIdx(i => Math.min(i + 1, mentionSuggestions.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        selectMention(mentionSuggestions[mentionIdx])
        return
      }
      if (e.key === "Escape") {
        setShowMentionDropdown(false)
        return
      }
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
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Bạn chưa được thêm vào nhóm này</h3>
        <p className="text-slate-400 text-[14px]">Liên hệ Hiếu để được cấp quyền truy cập.</p>
        <Link href="/analytics/to-gau" className="mt-4 text-[#003B95] text-[14px] hover:underline">← Quay lại danh sách nhóm</Link>
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
                          setSearchOpen(false)
                          setSearchQuery("")
                          setSearchResults([])
                          const el = document.getElementById(`msg-${msg.id}`)
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" })
                            el.classList.add("bg-yellow-50")
                            setTimeout(() => el.classList.remove("bg-yellow-50"), 2000)
                          } else {
                            toast.success("Tin nhắn nằm trong lịch sử cũ — nhấn \"Tải thêm\" để xem")
                          }
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
            {(["chat", "tailieu"] as const).map(tab => {
              const labels: Record<typeof tab, string> = { chat: "💬 Chat", tailieu: "📚 Tài liệu" }
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

        {/* Sub-tab bar: Chính thức (Wiki) vs Của nhóm (Docs/Notes) */}
        {activeTab === "tailieu" && (
          <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50 px-4 flex items-center justify-between flex-wrap gap-2 py-1.5">
            <div className="flex gap-1.5">
              {(["official", "group"] as const).map(track => (
                <button
                  key={track}
                  onClick={() => setDocTrack(track)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors",
                    docTrack === track
                      ? "bg-[#003B95] text-white border-[#003B95]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  )}
                >
                  {track === "official" ? "Chính thức" : "Của nhóm"}
                </button>
              ))}
            </div>
            {docTrack === "group" && (
              <div className="flex gap-1.5">
                {(["docs", "notes"] as const).map(sub => (
                  <button
                    key={sub}
                    onClick={() => setGroupSubTab(sub)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                      groupSubTab === sub
                        ? "bg-white border-[#003B95] text-[#003B95]"
                        : "bg-transparent border-transparent text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {sub === "docs" ? "📄 Docs" : "📌 Notes"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
                  {/* Nút tải thêm tin nhắn cũ */}
                  {hasMore && (
                    <div className="flex justify-center py-3">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-500 text-[13px] hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {loadingMore ? (
                          <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#003B95] rounded-full animate-spin" />
                        ) : (
                          <ChevronUp size={14} />
                        )}
                        {loadingMore ? "Đang tải..." : "Tải thêm tin cũ"}
                      </button>
                    </div>
                  )}
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
                          {/* Inline edit form (#4) */}
                          {editingMsgId === msg.id ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                rows={3}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg.id) }
                                  if (e.key === "Escape") { setEditingMsgId(null); setEditContent("") }
                                }}
                                className={cn(
                                  "w-full rounded-xl px-3 py-2 text-[14px] resize-none focus:outline-none",
                                  isMe ? "bg-[#003B95]/80 text-white border border-white/30" : "bg-white border border-[#003B95] text-slate-800"
                                )}
                              />
                              <div className={cn("flex gap-1.5", isMe ? "justify-end" : "justify-start")}>
                                <button onClick={() => handleSaveEdit(msg.id)} disabled={savingEdit || !editContent.trim()}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-50">
                                  {savingEdit ? "..." : "Lưu"}
                                </button>
                                <button onClick={() => { setEditingMsgId(null); setEditContent("") }}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50">
                                  Hủy
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className={cn(
                              "px-3 py-2 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words",
                              msg.is_recalled
                                ? "bg-slate-100 text-slate-400 italic border border-dashed border-slate-200"
                                : isMe
                                ? "bg-[#003B95] text-white rounded-br-sm"
                                : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm",
                              msg.is_pinned && !msg.is_recalled && "ring-1 ring-amber-400"
                            )}>
                              {msg.is_recalled
                                ? "Tin nhắn đã được thu hồi"
                                : renderContent(msg.content, myEmail, group.members)
                              }
                              {/* Attachments */}
                              {!msg.is_recalled && msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-1 space-y-1">
                                  {msg.attachments.map((att, i) => (
                                    <AttachmentDisplay key={i} attachment={att} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className={cn("flex items-center gap-1.5 mt-0.5 px-1", isMe ? "flex-row-reverse" : "flex-row")}>
                            <p className="text-[10px] text-slate-400">
                              {fmtTime(msg.created_at)}
                            </p>
                            {msg.is_pinned && !msg.is_recalled && <Pin size={10} className="text-amber-500" />}
                            {msg.edited_at && !msg.is_recalled && (
                              <span className="text-[10px] text-slate-400 italic">(đã sửa)</span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons — hover: pin (manager+), edit/recall (author or manager) (#2,#4) */}
                        {isHovered && !msg.is_recalled && (
                          <div className={cn(
                            "absolute top-0 z-10 flex items-center gap-1",
                            isMe ? "left-10" : "right-10"
                          )}>
                            {/* Pin — manager+ */}
                            {isManager && (
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
                            )}
                            {/* Sửa — tác giả hoặc manager */}
                            {(isMe || isManager) && msg.msg_type !== "ai" && (
                              <button
                                onClick={() => { setEditingMsgId(msg.id); setEditContent(msg.content) }}
                                title="Sửa tin nhắn"
                                className="p-1 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-[#003B95] hover:text-[#003B95] text-[11px] flex items-center gap-1 transition-colors shadow-sm"
                              >
                                <Edit2 size={11} /> Sửa
                              </button>
                            )}
                            {/* Thu hồi — tác giả hoặc manager */}
                            {(isMe || isManager) && (
                              <button
                                onClick={() => handleRecall(msg.id)}
                                title="Thu hồi tin nhắn"
                                className="p-1 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-400 hover:text-rose-500 text-[11px] flex items-center gap-1 transition-colors shadow-sm"
                              >
                                <Trash2 size={11} /> Thu hồi
                              </button>
                            )}
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

              {/* Scroll to bottom button — hiện khi cách đáy xa hoặc có tin mới chưa đọc */}
              {(showScrollBtn || newMsgCount > 0) && (
                <button
                  onClick={scrollToBottom}
                  className={cn(
                    "fixed bottom-24 right-72 z-20 rounded-full shadow-md flex items-center justify-center transition-all",
                    newMsgCount > 0
                      ? "h-8 px-3 gap-1.5 bg-[#003B95] text-white border border-[#003B95] text-[12px] font-medium hover:bg-[#002d73]"
                      : "w-9 h-9 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-[#003B95] hover:text-[#003B95]"
                  )}
                  title="Cuộn xuống"
                >
                  {newMsgCount > 0 ? (
                    <>{newMsgCount} tin mới <ChevronDown size={14} /></>
                  ) : (
                    <ChevronDown size={18} />
                  )}
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
                    {mentionSuggestions.map((member, idx) => (
                      <button
                        key={member.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectMention(member) }}
                        onMouseEnter={() => setMentionIdx(idx)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left",
                          idx === mentionIdx ? "bg-blue-50" : "hover:bg-blue-50"
                        )}
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

        {activeTab === "tailieu" && docTrack === "official" && (
          <WikiPanel groupId={groupId} isPrivileged={isPrivileged} />
        )}

        {activeTab === "tailieu" && docTrack === "group" && groupSubTab === "docs" && (
          <DocsPanel groupId={groupId} myEmail={myEmail} isPrivileged={isPrivileged} />
        )}

        {activeTab === "tailieu" && docTrack === "group" && groupSubTab === "notes" && (
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
                {m.role === "manager" && (
                  <span className="text-[10px] text-blue-600 font-medium">Manager</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {isManager && (
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
          isManager={isManager}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}
