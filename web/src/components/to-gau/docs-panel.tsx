"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import React, { useState, useEffect, useCallback, useRef } from "react"
import { FileText, Upload, Paperclip, Tag, X, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { fileIcon, fmtDate, fmtFileSize } from "@/lib/to-gau-format"
import type { DocItem } from "@/lib/to-gau-types"

export function DocsPanel({
  groupId, myEmail, isPrivileged,
}: {
  groupId: string
  myEmail: string
  isPrivileged: boolean
}) {
  const toast = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()
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
    if (!await confirmDialog("Xóa tài liệu này?")) return
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
    <>
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
    {ConfirmDialog}
    </>
  )
}
