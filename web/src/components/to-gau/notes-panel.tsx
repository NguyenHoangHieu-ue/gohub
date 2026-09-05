"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import React, { useState, useEffect, useCallback } from "react"
import { Pin, Edit2, Trash2 } from "lucide-react"
import { useToast } from "@/components/toast"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { fmtDate } from "@/lib/to-gau-format"
import type { NoteItem } from "@/lib/to-gau-types"

export function NotesPanel({
  groupId, myEmail, isPrivileged,
}: {
  groupId: string
  myEmail: string
  isPrivileged: boolean
}) {
  const toast = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
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
    if (!await confirmDialog("Xóa ghi chú này?")) return
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
    <>
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
    {ConfirmDialog}
    </>
  )
}
