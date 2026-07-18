"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { Plus, Trash2, Pin, Upload, FileText, Download, X, Save, RefreshCw, Users, ChevronRight, File, StickyNote, BookOpen, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import KBPage from "@/app/(dashboard)/kb/page"

interface Note { id: string; username: string; title: string; content: string; is_pinned: boolean; created_at: string; updated_at: string }
interface FileItem { name: string; path: string; size?: number; created_at?: string; url?: string }
interface UserOverview { username: string; name: string; role: string; noteCount: number; fileCount: number; lastUpdated: string | null }

function fmtSize(bytes?: number) {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
function fmtDate(s?: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function InfoPage() {
  const { data: session, status } = useSession()
  const [canViewAll, setCanViewAll] = useState(false)
  const [view, setView] = useState<"mine" | "all">("mine")
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  // Tab chính: Notes & Files  |  Knowledge Base (KB gộp vào trong Note)
  const [mainTab, setMainTab] = useState<"notes" | "kb">("notes")

  // Dùng DB role + role_permissions để kiểm tra quyền xem-tất-cả (không dùng JWT stale)
  useEffect(() => {
    if (status !== "authenticated") return
    Promise.all([
      fetch("/api/user/me").then(r => r.json()).catch(() => null),
      fetch("/api/config/role-permissions").then(r => r.json()).catch(() => null),
    ]).then(([me, perms]) => {
      const role: string = me?.role ?? session?.user?.role ?? ""
      if (role === "admin" || role === "creator") { setCanViewAll(true); return }
      const matrix: Record<string, string[]> = perms ?? {}
      setCanViewAll((matrix[role] ?? []).includes("info"))
    })
  }, [status, session?.user?.username])

  if (!session) return null
  const myUsername = session.user?.username
  const targetUsername = view === "all" && selectedUser ? selectedUser : myUsername

  return (
    <div className="p-6 min-h-screen bg-slate-50 dark:bg-slate-900 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm">
            <StickyNote className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Note</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Notes cá nhân, lưu trữ file & Kiến thức nội bộ</p>
          </div>
        </div>
        {mainTab === "notes" && canViewAll && (
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
            <button onClick={() => { setView("mine"); setSelectedUser(null) }} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", view === "mine" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700")}>
              Của tôi
            </button>
            <button onClick={() => setView("all")} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5", view === "all" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700")}>
              <Users className="w-3.5 h-3.5" />Tất cả
            </button>
          </div>
        )}
      </div>

      {/* Tab chính: Notes & Files | Knowledge Base */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button onClick={() => setMainTab("notes")}
          className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all", mainTab === "notes" ? "bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}>
          <StickyNote className="w-4 h-4" />Notes & Files
        </button>
        <button onClick={() => setMainTab("kb")}
          className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all", mainTab === "kb" ? "bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}>
          <BookOpen className="w-4 h-4" />Knowledge Base
        </button>
      </div>

      {mainTab === "kb" ? (
        <div className="-mx-6 -mb-4">
          <KBPage />
        </div>
      ) : view === "all" && canViewAll ? (
        <AdminOverview onSelectUser={(u) => { setSelectedUser(u); setView("all") }} selectedUser={selectedUser} />
      ) : (
        <UserWorkspace username={targetUsername} isOwn={!selectedUser || selectedUser === myUsername} />
      )}
    </div>
  )
}

// ─── Admin overview: grid of users ──────────────────────────────────────────
function AdminOverview({ onSelectUser, selectedUser }: { onSelectUser: (u: string) => void; selectedUser: string | null }) {
  const [users, setUsers] = useState<UserOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/info/overview").then(r => r.ok ? r.json() : []).then(setUsers).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      {selectedUser && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-3">
            <button onClick={() => onSelectUser("")} className="text-slate-400 hover:text-slate-600"><ChevronRight className="w-4 h-4 rotate-180" /></button>
            <h2 className="font-bold text-slate-800">{users.find(u => u.username === selectedUser)?.name || selectedUser}</h2>
          </div>
          <div className="p-6"><UserWorkspace username={selectedUser} isOwn={false} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {users.filter(u => u.noteCount > 0 || u.fileCount > 0 || true).map(u => (
          <button key={u.username} onClick={() => onSelectUser(u.username)}
            className={cn("bg-white dark:bg-slate-800 border rounded-2xl p-4 text-left hover:border-violet-300 hover:shadow-md transition-all group", selectedUser === u.username ? "border-violet-400 shadow-md bg-violet-50/30 dark:bg-violet-900/20" : "border-slate-200 dark:border-slate-700 shadow-sm")}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center mb-3 font-bold text-violet-700 dark:text-violet-300 text-sm group-hover:from-violet-200 transition-all">
              {(u.name || u.username).charAt(0).toUpperCase()}
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{u.name || u.username}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">{u.role}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-slate-500 flex items-center gap-1"><StickyNote className="w-3 h-3" />{u.noteCount}</span>
              <span className="text-xs text-slate-500 flex items-center gap-1"><File className="w-3 h-3" />{u.fileCount}</span>
            </div>
            {u.lastUpdated && <p className="text-[10px] text-slate-400 mt-1.5">{fmtDate(u.lastUpdated)}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── User workspace: notes + files ──────────────────────────────────────────
function UserWorkspace({ username, isOwn }: { username: string; isOwn: boolean }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(true)
  // Xác nhận xóa qua modal (đồng bộ pattern confirm của app, thay confirm() native)
  const [confirmDel, setConfirmDel] = useState<{ kind: "note" | "file"; id: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [preview, setPreview] = useState<FileItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchNotes = useCallback(() => {
    setLoadingNotes(true)
    fetch(`/api/info/notes?username=${username}`).then(r => r.ok ? r.json() : []).then(setNotes).finally(() => setLoadingNotes(false))
  }, [username])

  const fetchFiles = useCallback(() => {
    setLoadingFiles(true)
    fetch(`/api/info/files?username=${username}`).then(r => r.ok ? r.json() : []).then(setFiles).finally(() => setLoadingFiles(false))
  }, [username])

  useEffect(() => { fetchNotes(); fetchFiles() }, [fetchNotes, fetchFiles])

  const selectNote = (note: Note) => {
    setSelectedNote(note)
    setEditTitle(note.title)
    setEditContent(note.content)
  }

  const newNote = async () => {
    const r = await fetch("/api/info/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Note mới", content: "" }) })
    if (r.ok) { const note = await r.json(); fetchNotes(); selectNote(note) }
  }

  const saveNote = async () => {
    if (!selectedNote) return
    setSaving(true)
    await fetch(`/api/info/notes/${selectedNote.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editTitle, content: editContent }) })
    setSaving(false)
    fetchNotes()
    setSelectedNote(prev => prev ? { ...prev, title: editTitle, content: editContent } : null)
  }

  // Nút Lưu chỉ sáng khi tiêu đề/nội dung khác bản đang mở
  const noteDirty = !!selectedNote && (editTitle !== selectedNote.title || editContent !== selectedNote.content)

  const doDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      if (confirmDel.kind === "note") {
        await fetch(`/api/info/notes/${confirmDel.id}`, { method: "DELETE" })
        if (selectedNote?.id === confirmDel.id) setSelectedNote(null)
        fetchNotes()
      } else {
        await fetch(`/api/info/files?path=${encodeURIComponent(confirmDel.id)}`, { method: "DELETE" })
        fetchFiles()
      }
    } finally {
      setDeleting(false)
      setConfirmDel(null)
    }
  }

  const togglePin = async (note: Note) => {
    await fetch(`/api/info/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_pinned: !note.is_pinned }) })
    fetchNotes()
  }

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.append("file", file)
    await fetch("/api/info/files", { method: "POST", body: fd })
    setUploading(false)
    fetchFiles()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }


  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      {/* Notes sidebar */}
      <div className="space-y-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2"><StickyNote className="w-4 h-4 text-violet-500" /><span className="font-bold text-slate-700 text-sm">Notes ({notes.length})</span></div>
            {isOwn && <button onClick={newNote} className="w-7 h-7 bg-violet-600 text-white rounded-lg flex items-center justify-center hover:bg-violet-700"><Plus className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
            {loadingNotes ? <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
              : notes.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">{isOwn ? "Chưa có note nào. Tạo mới +" : "Chưa có note"}</p>
              : notes.map(note => (
                <button key={note.id} onClick={() => selectNote(note)} className={cn("w-full px-4 py-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors", selectedNote?.id === note.id && "bg-violet-50/50 dark:bg-violet-900/20 border-l-2 border-violet-500")}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate flex-1">{note.is_pinned && <Pin className="w-3 h-3 text-violet-400 inline mr-1 -mt-0.5" />}{note.title}</p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{note.content || "Trống"}</p>
                  <p className="text-[10px] text-slate-300 mt-1">{fmtDate(note.updated_at)}</p>
                </button>
              ))}
          </div>
        </div>

        {/* Files */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2"><File className="w-4 h-4 text-blue-500" /><span className="font-bold text-slate-700 dark:text-slate-200 text-sm">Files ({files.length})</span></div>
            {isOwn && (
              <>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
                  {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}Upload
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={uploadFile} />
              </>
            )}
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[300px] overflow-y-auto">
            {loadingFiles ? <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              : files.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Chưa có file</p>
              : files.map(f => (
                <button key={f.path} onClick={() => f.url && setPreview(f)} className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50/60 dark:hover:bg-slate-700/40 group text-left">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{f.name}</p>
                    <p className="text-[10px] text-slate-400">{fmtSize(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {f.url && <span className="w-6 h-6 flex items-center justify-center text-violet-500 hover:bg-violet-50 rounded" title="Xem"><Eye className="w-3.5 h-3.5" /></span>}
                    {f.url && <a href={f.url} download={f.name} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded" title="Tải về"><Download className="w-3.5 h-3.5" /></a>}
                    {isOwn && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); setConfirmDel({ kind: "file", id: f.path, label: f.name }) }} className="w-6 h-6 flex items-center justify-center text-rose-400 hover:bg-rose-50 rounded" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></span>}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Note editor */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: "500px" }}>
        {selectedNote ? (
          <>
            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-3">
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1 font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none text-base" placeholder="Tiêu đề…" />
              <div className="flex items-center gap-2">
                {isOwn && <button onClick={() => togglePin(selectedNote)} className={cn("p-1.5 rounded-lg", selectedNote.is_pinned ? "text-violet-600 bg-violet-50" : "text-slate-400 hover:bg-slate-100")} title="Ghim"><Pin className="w-3.5 h-3.5" /></button>}
                {isOwn && <button onClick={saveNote} disabled={saving || !noteDirty} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Lưu
                </button>}
                {isOwn && <button onClick={() => setConfirmDel({ kind: "note", id: selectedNote.id, label: selectedNote.title || "note này" })} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}
                <button onClick={() => setSelectedNote(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              readOnly={!isOwn}
              placeholder="Nội dung note… (hỗ trợ markdown)"
              className="flex-1 p-6 text-sm text-slate-700 dark:text-slate-200 outline-none resize-none bg-white dark:bg-slate-800 font-mono leading-relaxed"
              onKeyDown={e => { if (e.ctrlKey && e.key === "s") { e.preventDefault(); saveNote() } }}
            />
            <div className="px-6 py-2 border-t border-slate-50 dark:border-slate-700 flex items-center justify-between text-[10px] text-slate-300 dark:text-slate-500">
              <span>Cập nhật: {fmtDate(selectedNote.updated_at)}</span>
              {isOwn && <span>Ctrl+S để lưu nhanh</span>}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300">
            <StickyNote className="w-12 h-12" />
            <p className="text-sm font-medium">Chọn note để xem hoặc chỉnh sửa</p>
            {isOwn && <button onClick={newNote} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700">
              <Plus className="w-3.5 h-3.5" />Tạo note mới
            </button>}
          </div>
        )}
      </div>

      {/* Confirm xóa (thay confirm() native — đồng bộ pattern modal của app) */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-overlay-in" onClick={() => !deleting && setConfirmDel(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-[340px] p-5 animate-modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><Trash2 className="w-4 h-4 text-rose-500" /></div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Xóa {confirmDel.kind === "note" ? "note" : "file"}?</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 break-words">Bạn chắc chắn muốn xóa <span className="font-semibold text-slate-700 dark:text-slate-200">{confirmDel.label}</span>? Thao tác không thể hoàn tác.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} disabled={deleting} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50">Hủy</button>
              <button onClick={doDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xem nội dung file đã import (ảnh / PDF / text) */}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

// ─── File preview: ảnh hiện trực tiếp, PDF nhúng iframe, text/markdown đọc nội dung ──
function FilePreview({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  const isPdf   = ext === "pdf"
  const isText  = ["txt", "md", "markdown", "csv", "json", "log", "yml", "yaml", "xml", "ts", "tsx", "js", "jsx", "sql", "html", "css"].includes(ext)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(isText)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!isText || !file.url) return
    setLoading(true)
    fetch(file.url).then(r => r.ok ? r.text() : Promise.reject()).then(t => setText(t)).catch(() => setErr(true)).finally(() => setLoading(false))
  }, [isText, file.url])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col animate-modal-in" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{file.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {file.url && <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="w-7 h-7 flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded-lg" title="Tải về"><Download className="w-4 h-4" /></a>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-slate-50/60 dark:bg-slate-900/40">
          {isImage && file.url && (
            <img src={file.url} alt={file.name} className="max-w-full mx-auto rounded-lg" />
          )}
          {isPdf && file.url && (
            <iframe src={file.url} title={file.name} className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-white" />
          )}
          {isText && (
            loading ? <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
            : err ? <p className="py-12 text-center text-sm text-slate-400">Không đọc được nội dung file.</p>
            : <pre className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words font-mono leading-relaxed bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">{text}</pre>
          )}
          {!isImage && !isPdf && !isText && (
            <div className="py-12 text-center text-sm text-slate-500">
              <File className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p>Không hỗ trợ xem trực tiếp định dạng <span className="font-semibold uppercase">.{ext}</span>.</p>
              {file.url && <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"><Download className="w-3.5 h-3.5" />Tải về để xem</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
