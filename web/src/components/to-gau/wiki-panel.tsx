"use client"

// Tách từ to-gau/[id]/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback } from "react"
import {
  Search, Plus, History, Eye, EyeOff, ChevronLeft,
  FileText, Users, Edit2, Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { useConfirm } from "@/components/to-gau/confirm-modal"
import { renderMarkdown } from "@/lib/to-gau-format"
import { DEPT_LABELS, type Department } from "@/lib/kb-constants"
import { WIKI_PAGE_TYPES } from "@/lib/to-gau-types"
import type { WikiPage, WikiVersion, GroupOption } from "@/lib/to-gau-types"

// ── Wiki Panel (tài liệu Chính thức — creator/admin viết, gán theo group Tổ Gấu) ──
export function WikiPanel({ groupId, isPrivileged }: { groupId: string; isPrivileged: boolean }) {
  const toast = useToast()
  const { confirm: confirmDialog, ConfirmDialog } = useConfirm()

  const [view, setView]             = useState<"list" | "read" | "edit">("list")
  const [pages, setPages]           = useState<WikiPage[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState("")
  const [selected, setSelected]     = useState<WikiPage | null>(null)
  const [versions, setVersions]     = useState<WikiVersion[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [previewMd, setPreviewMd]   = useState(false)
  const [editForm, setEditForm]     = useState({ title: "", content: "", page_type: "note", department: "all" as Department, tags: "" })

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupTarget, setGroupTarget]       = useState<WikiPage | null>(null)
  const [groupOptions, setGroupOptions]     = useState<GroupOption[]>([])
  const [assignMode, setAssignMode]         = useState<"all" | "groups">("all")
  const [assignedIds, setAssignedIds]       = useState<string[]>([])
  const [savingGroups, setSavingGroups]     = useState(false)

  const fetchPages = useCallback(async (q = "") => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ groupId })
      if (q) p.set("search", q)
      const res  = await fetch(`/api/kb/wiki?${p}`)
      const json = await res.json()
      setPages(json.data ?? [])
    } catch { setPages([]) }
    finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { fetchPages() }, [fetchPages])
  useEffect(() => {
    const t = setTimeout(() => fetchPages(search), 300)
    return () => clearTimeout(t)
  }, [search, fetchPages])

  async function openPage(page: WikiPage) {
    const res  = await fetch(`/api/kb/wiki/${page.id}`)
    const json = await res.json()
    if (!res.ok) { toast.error("Không mở được tài liệu"); return }
    setSelected(json.page)
    setVersions(json.versions ?? [])
    setShowHistory(false)
    setView("read")
  }

  function startCreate() {
    setSelected(null)
    setEditForm({ title: "", content: "", page_type: "note", department: "all", tags: "" })
    setPreviewMd(false)
    setView("edit")
  }

  function startEdit() {
    if (!selected) return
    setEditForm({
      title: selected.title, content: selected.content ?? "", page_type: selected.page_type,
      department: selected.department as Department, tags: (selected.tags ?? []).join(", "),
    })
    setPreviewMd(false)
    setView("edit")
  }

  async function savePage() {
    if (!editForm.title.trim()) { toast.error("Cần nhập tiêu đề"); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: editForm.title, content: editForm.content, page_type: editForm.page_type,
        department: editForm.department, tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      }
      let url = "/api/kb/wiki", method = "POST"
      if (selected) { url = `/api/kb/wiki/${selected.id}`; method = "PATCH" }
      // Trang tạo mới từ group này → mặc định gán riêng cho group này (không phải toàn công ty)
      else { body.visibility_mode = "groups"; body.group_ids = [groupId] }
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(selected ? "Đã cập nhật tài liệu" : "Đã tạo tài liệu")
      setView("list")
      fetchPages(search)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiếu đang fix, vui lòng đợi")
    } finally { setSaving(false) }
  }

  async function deletePage() {
    if (!selected) return
    const ok = await confirmDialog(`Xoá tài liệu "${selected.title}"? Lịch sử phiên bản cũng sẽ bị xoá.`)
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/kb/wiki/${selected.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Đã xoá tài liệu")
      setView("list"); setSelected(null)
      fetchPages(search)
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
    finally { setDeleting(false) }
  }

  async function toggleHidden(page: WikiPage) {
    const res = await fetch(`/api/kb/wiki/${page.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_hidden: !page.is_hidden }),
    })
    if (res.ok) fetchPages(search)
  }

  async function openGroupModal(page: WikiPage) {
    setGroupTarget(page)
    try {
      const [groupsJson, assignJson] = await Promise.all([
        groupOptions.length ? Promise.resolve(null) : fetch("/api/to-gau/groups").then(r => r.json()),
        fetch(`/api/kb/wiki/${page.id}/groups`).then(r => r.json()),
      ])
      if (groupsJson) setGroupOptions((groupsJson.data ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })))
      setAssignMode(assignJson.visibility_mode === "groups" ? "groups" : "all")
      setAssignedIds(assignJson.group_ids ?? [])
      setShowGroupModal(true)
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
  }

  async function saveGroups() {
    if (!groupTarget) return
    setSavingGroups(true)
    try {
      const res = await fetch(`/api/kb/wiki/${groupTarget.id}/groups`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility_mode: assignMode, group_ids: assignedIds }),
      })
      if (!res.ok) throw new Error()
      toast.success("Đã lưu phân phối nhóm")
      setShowGroupModal(false)
      fetchPages(search)
    } catch { toast.error("Hiếu đang fix, vui lòng đợi") }
    finally { setSavingGroups(false) }
  }

  const formDirty = selected
    ? JSON.stringify(editForm) !== JSON.stringify({
        title: selected.title, content: selected.content ?? "", page_type: selected.page_type,
        department: selected.department, tags: (selected.tags ?? []).join(", "),
      })
    : editForm.title.trim() !== "" || editForm.content.trim() !== ""

  // ── List view ──
  if (view === "list") return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tài liệu..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-[#003B95]"
          />
        </div>
        {isPrivileged && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003B95] hover:bg-[#002d73] text-white text-[12px] font-medium rounded-lg transition-colors ml-auto"
          >
            <Plus size={13} /> Soạn trang mới
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-[13px]">Đang tải...</div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-[13px] gap-1">
            <FileText size={24} className="text-slate-300" />
            <span>Chưa có tài liệu chính thức nào cho nhóm này</span>
          </div>
        ) : (
          pages.map(page => (
            <div
              key={page.id}
              className={cn("w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50", page.is_hidden && "opacity-60")}
            >
              <button onClick={() => openPage(page)} className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium text-slate-800 leading-snug line-clamp-1 flex items-center gap-1.5">
                  {page.title}
                  {page.is_hidden && <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full font-normal">Ẩn</span>}
                  {page.visibility_mode === "groups" && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-normal">Riêng nhóm</span>}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {WIKI_PAGE_TYPES[page.page_type] ?? page.page_type} · Sửa bởi {page.updated_by} · {new Date(page.updated_at).toLocaleDateString("vi-VN")}
                </p>
              </button>
              {isPrivileged && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openGroupModal(page)} title="Gán nhóm" className="p-1.5 rounded-lg text-slate-400 hover:text-[#003B95] hover:bg-slate-100 transition-colors">
                    <Users size={13} />
                  </button>
                  <button onClick={() => toggleHidden(page)} title={page.is_hidden ? "Hiện trang" : "Ẩn trang"} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    {page.is_hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showGroupModal && groupTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowGroupModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1">Gán nhóm — {groupTarget.title}</h3>
            <p className="text-[12px] text-slate-400 mb-3">Chọn ai được xem tài liệu này.</p>
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="radio" checked={assignMode === "all"} onChange={() => setAssignMode("all")} />
                Toàn công ty (mọi nhóm Tổ Gấu đều thấy)
              </label>
              <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="radio" checked={assignMode === "groups"} onChange={() => setAssignMode("groups")} />
                Chỉ nhóm được chọn
              </label>
            </div>
            {assignMode === "groups" && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-50 mb-3">
                {groupOptions.map(g => (
                  <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-700 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={assignedIds.includes(g.id)}
                      onChange={e => setAssignedIds(prev => e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id))}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowGroupModal(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[13px] hover:bg-slate-50">Hủy</button>
              <button
                onClick={saveGroups}
                disabled={savingGroups}
                className="px-3 py-1.5 rounded-lg bg-[#003B95] text-white text-[13px] font-medium hover:bg-[#002d73] disabled:opacity-50"
              >
                {savingGroups ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )

  // ── Read view ──
  if (view === "read" && selected) return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 sticky top-0 bg-white z-10">
        <button onClick={() => setView("list")} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-[#003B95] transition-colors">
          <ChevronLeft size={15} /> Danh sách
        </button>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setShowHistory(h => !h)}
            className={cn("flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-lg border transition-colors", showHistory ? "bg-blue-50 border-blue-300 text-[#003B95]" : "border-slate-200 text-slate-500 hover:border-slate-400")}
          >
            <History size={12} /> Lịch sử ({versions.length})
          </button>
          {isPrivileged && (
            <>
              <button onClick={() => openGroupModal(selected)} className="flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:border-[#003B95] hover:text-[#003B95] transition-colors">
                <Users size={12} /> Gán nhóm
              </button>
              <button onClick={startEdit} className="flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-lg border border-slate-200 text-slate-600 hover:border-[#003B95] hover:text-[#003B95] transition-colors">
                <Edit2 size={11} /> Sửa
              </button>
              <button onClick={deletePage} disabled={deleting} className="flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors">
                <Trash2 size={11} /> Xoá
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-start gap-2 flex-wrap mb-1">
          <h2 className="text-[17px] font-bold text-slate-900 flex-1">{selected.title}</h2>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {WIKI_PAGE_TYPES[selected.page_type] ?? selected.page_type} · {DEPT_LABELS[selected.department as Department] ?? selected.department} ·
          {" "}Cập nhật {new Date(selected.updated_at).toLocaleDateString("vi-VN")} bởi {selected.updated_by}
        </p>
        <div
          className="prose-sm max-w-none text-slate-800 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.content ?? "") }}
        />
      </div>

      {showHistory && versions.length > 0 && (
        <div className="px-5 pb-5">
          <div className="border border-slate-200 rounded-lg p-3">
            <h4 className="text-[12px] font-semibold text-slate-600 mb-2">Lịch sử thay đổi</h4>
            {versions.map(v => (
              <div key={v.id} className="flex items-center gap-3 text-[11px] text-slate-500 py-1 border-b border-slate-50 last:border-0">
                <span className="font-mono text-slate-400">v{v.version}</span>
                <span>{new Date(v.updated_at).toLocaleDateString("vi-VN")}</span>
                <span>bởi {v.updated_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )

  // ── Edit / create view ──
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <button onClick={() => setView(selected ? "read" : "list")} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-[#003B95] transition-colors">
          <ChevronLeft size={15} /> {selected ? "Quay lại" : "Danh sách"}
        </button>
        <h3 className="text-[13px] font-semibold text-slate-700 ml-1">{selected ? "Chỉnh sửa trang" : "Soạn trang mới"}</h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Tiêu đề *</label>
            <input
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Tên trang"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#003B95] font-medium"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Loại trang</label>
            <select
              value={editForm.page_type}
              onChange={e => setEditForm(f => ({ ...f, page_type: e.target.value }))}
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#003B95] bg-white"
            >
              {Object.entries(WIKI_PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Phòng ban</label>
            <select
              value={editForm.department}
              onChange={e => setEditForm(f => ({ ...f, department: e.target.value as Department }))}
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#003B95] bg-white"
            >
              {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Tags (cách nhau bằng dấu phẩy)</label>
            <input
              value={editForm.tags}
              onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="WM, Japan, eSIM..."
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#003B95]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-slate-600">Nội dung (Markdown)</label>
            <button onClick={() => setPreviewMd(p => !p)} className="flex items-center gap-1 text-[11px] text-[#003B95] hover:underline">
              {previewMd ? <><Edit2 size={11} /> Soạn thảo</> : <><Eye size={11} /> Xem trước</>}
            </button>
          </div>
          {previewMd ? (
            <div
              className="min-h-[300px] p-4 border border-slate-200 rounded-lg bg-slate-50 prose-sm max-w-none text-[13px]"
              dangerouslySetInnerHTML={{ __html: editForm.content ? renderMarkdown(editForm.content) : '<p class="text-slate-400 italic">Chưa có nội dung</p>' }}
            />
          ) : (
            <textarea
              value={editForm.content}
              onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
              rows={16}
              placeholder="# Tiêu đề&#10;&#10;Nội dung Markdown..."
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#003B95] font-mono resize-y"
            />
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={savePage}
            disabled={saving || !formDirty}
            className="px-4 py-2 bg-[#003B95] hover:bg-[#002d73] text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : selected ? "Lưu thay đổi" : "Tạo trang"}
          </button>
          <button
            onClick={() => setView(selected ? "read" : "list")}
            className="px-4 py-2 text-[13px] border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
