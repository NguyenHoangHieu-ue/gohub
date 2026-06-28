"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useSession }     from "next-auth/react"
import ReactMarkdown      from "react-markdown"
import remarkGfm          from "remark-gfm"
import {
  BookOpen, Upload, Search, Trash2, FileText, File, FileCode, Loader2,
  PenLine, Eye, EyeOff, History, Plus, ChevronLeft, X,
  Brain, CheckCircle2, XCircle,
} from "lucide-react"
import type { MrpPlan } from "@/lib/mrp"
import { DEPT_LABELS, type Department } from "@/lib/kb"
import { ConfirmModal } from "@/components/confirm-modal"
import { MermaidBlock  } from "@/components/mermaid-block"

// ─── Types ────────────────────────────────────────────────────────────────────
interface KBDoc {
  id: string; name: string; file_type: string; department: Department
  chunk_count: number; uploaded_by: string; created_at: string
}

interface SearchResult {
  chunk_id: number | string; document_id: string; document_name: string
  department: string; content: string; similarity: number
  source: "document" | "wiki"; page_type?: string
}

interface WikiPage {
  id: string; title: string; content?: string; page_type: string
  department: string; tags: string[]; version: number; is_hidden?: boolean
  created_by: string; updated_by: string; updated_at: string; created_at?: string
}

interface WikiVersion { id: number; version: number; updated_by: string; updated_at: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEPTS = Object.entries(DEPT_LABELS) as [Department, string][]

const PAGE_TYPES: Record<string, { label: string; color: string }> = {
  vendor_profile: { label: "Vendor",    color: "bg-blue-100 text-blue-700"   },
  product_guide:  { label: "Sản phẩm",  color: "bg-green-100 text-green-700" },
  process_sop:    { label: "Quy trình", color: "bg-orange-100 text-orange-700"},
  pricing_rule:   { label: "Giá",       color: "bg-amber-100 text-amber-700"  },
  meeting_note:   { label: "Họp",       color: "bg-purple-100 text-purple-700"},
  reference:      { label: "Tham chiếu",color: "bg-teal-100 text-teal-700"   },
  note:           { label: "Ghi chú",   color: "bg-gray-100 text-gray-600"   },
}

const FILE_ICON: Record<string, React.ReactNode> = {
  pdf:  <FileText size={14} className="text-red-500"    />,
  docx: <File     size={14} className="text-blue-500"   />,
  md:   <FileCode size={14} className="text-purple-500" />,
  txt:  <FileCode size={14} className="text-gray-400"   />,
}

function deptBadge(dept: string) {
  const colors: Record<string, string> = {
    all: "bg-gray-100 text-gray-500", sales: "bg-green-100 text-green-700",
    product: "bg-blue-100 text-blue-700", tech: "bg-purple-100 text-purple-700",
    finance: "bg-amber-100 text-amber-700",
  }
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colors[dept] ?? "bg-gray-100 text-gray-500"}`}>{DEPT_LABELS[dept as Department] ?? dept}</span>
}

function typeBadge(type: string) {
  const t = PAGE_TYPES[type] ?? PAGE_TYPES.note
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// Chuyển Obsidian wikilinks thành markdown links có protocol wiki://
// để ReactMarkdown render thành button navigate nội bộ
function processWikilinks(md: string): string {
  return md
    // Xoá dataview code blocks (Obsidian-only, không render trên web)
    .replace(/```dataview[\s\S]*?```/g, "")
    // [[path|display]] → [display](wiki://display)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, _path, display) =>
      `[${display.trim()}](wiki://${encodeURIComponent(display.trim())})`
    )
    // [[path]] → [Page Name](wiki://Page Name)  (dùng filename, replace - thành space)
    .replace(/\[\[([^\]]+)\]\]/g, (_, path) => {
      const name = (path.split("/").pop() ?? path).replace(/-/g, " ")
      return `[${name}](wiki://${encodeURIComponent(name)})`
    })
}

// ─── Permissions hook ─────────────────────────────────────────────────────────
function usePermissions(role: string) {
  const [perms, setPerms] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!role) return
    fetch("/api/permissions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.perms) setPerms(d.perms) })
      .catch(() => {})
  }, [role]) // re-fetch khi role thay đổi (session vừa load xong)
  return (key: string) => {
    if (role === "admin" || role === "creator") return true  // creator = super-admin: không giới hạn
    const allowed = perms[key]
    if (!allowed) return role === "manager" // safe default while loading
    return allowed.includes(role)
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KBPage() {
  const { data: session } = useSession()
  const jwtRole  = (session?.user as any)?.role ?? "staff"
  const username = session?.user?.name ?? ""
  // Role DB tươi (JWT có thể CŨ nếu admin vừa đổi role) → quyết hiện trang ẩn + nút Ẩn/Hiện.
  const [dbRole, setDbRole] = useState<string>("")
  useEffect(() => {
    if (!session) return
    fetch("/api/user/me", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role) setDbRole(d.role) })
      .catch(() => {})
  }, [session])
  const role = dbRole || jwtRole
  const [tab, setTab] = useState<"docs" | "wiki" | "search">("docs")
  const can = usePermissions(role)

  const canUpload   = can("perm_kb_upload")
  const canWikiView = can("perm_kb_wiki_view")
  const canWikiEdit = can("perm_kb_wiki_edit")

  type TabId = "docs" | "wiki" | "search"
  const ALL_TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "docs",   label: "Tài liệu",  icon: <FileText size={14}/> },
    { id: "wiki",   label: "Wiki",      icon: <PenLine  size={14}/> },
    { id: "search", label: "Tìm kiếm",  icon: <Search   size={14}/> },
  ]
  const visibleTabs = ALL_TABS.filter(t => t.id !== "wiki" || canWikiView)

  useEffect(() => {
    if (tab === "wiki" && !canWikiView) setTab("docs")
  }, [canWikiView, tab])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <BookOpen size={20} className="text-brand-600 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900">Kiến Thức Nội Bộ</h1>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {visibleTabs.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab===id?"bg-white text-brand-700 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "docs"   && <DocsTab   role={role} username={username} canUpload={canUpload} />}
      {tab === "wiki"   && <WikiTab   role={role} username={username} canWikiEdit={canWikiEdit} />}
      {tab === "search" && <SearchTab />}
    </div>
  )
}

// ─── Docs Tab ─────────────────────────────────────────────────────────────────
type MrpState = {
  jobId:    string
  status:   "analyzing" | "plan_ready" | "done" | "rejected" | "error"
  plan?:    MrpPlan
  created?: string[]
  error?:   string
}

function DocsTab({ role, username, canUpload }: { role: string; username: string; canUpload: boolean }) {
  const canDelete = (uploadedBy: string) => role === "admin" || role === "creator" || uploadedBy === username
  const [docs,          setDocs]          = useState<KBDoc[]>([])
  const [loading,       setLoading]       = useState(true)
  const [deptFilter,    setDeptFilter]    = useState<Department | "">("")
  const [confirmDelete, setConfirmDelete] = useState<{id:string;name:string}|null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadMsg,     setUploadMsg]     = useState<{type:"success"|"error";text:string}|null>(null)
  const [form,          setForm]          = useState({ department: "all" as Department, name: "" })
  const [fileRef,       setFileRef]       = useState<File | null>(null)
  const [mrp,           setMrp]           = useState<MrpState | null>(null)
  const [approving,     setApproving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const p = deptFilter ? `?dept=${deptFilter}` : ""
    const r = await fetch(`/api/kb/documents${p}`)
    const d = await r.json()
    setDocs(d.data ?? [])
    setLoading(false)
  }, [deptFilter])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const deleteDoc = async (id: string) => {
    setDeleting(true)
    const r = await fetch(`/api/kb/documents/${id}`, { method: "DELETE" })
    setDeleting(false)
    if (r.ok) setDocs(p => p.filter(d => d.id !== id))
    setConfirmDelete(null)
  }

  const triggerMrp = async (documentId: string) => {
    setMrp({ jobId: "", status: "analyzing" })
    const r = await fetch("/api/kb/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId }),
    })
    const d = await r.json()
    if (r.ok) {
      setMrp({ jobId: d.id, status: "plan_ready", plan: d.plan })
    } else {
      setMrp({ jobId: "", status: "error", error: d.error ?? "Lỗi phân tích" })
    }
  }

  const approveMrp = async () => {
    if (!mrp?.jobId) return
    setApproving(true)
    const r = await fetch(`/api/kb/process/${mrp.jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    })
    const d = await r.json()
    setApproving(false)
    if (r.ok) setMrp(m => m ? { ...m, status: "done", created: d.created_pages } : null)
    else setMrp(m => m ? { ...m, status: "error", error: d.error } : null)
  }

  const rejectMrp = async () => {
    if (!mrp?.jobId) return
    await fetch(`/api/kb/process/${mrp.jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    })
    setMrp(m => m ? { ...m, status: "rejected" } : null)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileRef) { setUploadMsg({ type: "error", text: "Chưa chọn file" }); return }
    setUploading(true); setUploadMsg(null); setMrp(null)
    const fd = new FormData()
    fd.append("file", fileRef); fd.append("department", form.department); fd.append("name", form.name)
    const r = await fetch("/api/kb/documents", { method: "POST", body: fd })
    const d = await r.json()
    setUploading(false)
    if (r.ok) {
      setUploadMsg({ type: "success", text: `Đã upload "${d.name}" — ${d.chunk_count} chunks` })
      setFileRef(null); setForm({ department: "all", name: "" })
      if (inputRef.current) inputRef.current.value = ""
      fetchDocs()
      triggerMrp(d.id)
    } else {
      setUploadMsg({ type: "error", text: d.error ?? "Hiếu đang fix, vui lòng đợi" })
    }
  }

  return (
    <div className="space-y-5">
      {canUpload && (
      <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Upload size={15} className="text-brand-500"/>Upload tài liệu mới</h3>
        {uploadMsg && (
          <div className={`px-3 py-2 rounded-lg text-sm ${uploadMsg.type==="success"?"bg-green-50 border border-green-200 text-green-700":"bg-red-50 border border-red-200 text-red-700"}`}>{uploadMsg.text}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
            <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt" onChange={e => setFileRef(e.target.files?.[0]??null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"/>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, MD, TXT — tối đa 10MB</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phòng ban</label>
            <select value={form.department} onChange={e => setForm(f=>({...f,department:e.target.value as Department}))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {DEPTS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên (tuỳ chọn)</label>
            <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Để trống = dùng tên file"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
        </div>
        <button type="submit" disabled={!fileRef||uploading}
          className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {uploading?<><Loader2 size={14} className="animate-spin"/>Đang xử lý...</>:<><Upload size={14}/>Upload & Embed</>}
        </button>
      </form>
      )}

      {/* ── MRP Analysis Panel ─────────────────────────────────────────────── */}
      {mrp && (
        <div className="bg-white border border-brand-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <Brain size={15}/> AI Phân Tích (MRP)
            </div>
            <button onClick={() => setMrp(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
          </div>

          {mrp.status === "analyzing" && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin"/> AI đang phân tích tài liệu...
            </div>
          )}

          {mrp.status === "plan_ready" && mrp.plan && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 italic">{mrp.plan.summary}</p>

              {(mrp.plan.key_extractions?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Thông tin trích xuất</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mrp.plan.key_extractions.slice(0, 8).map((ex, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {ex.item}{ex.value ? ` → ${ex.value}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(mrp.plan.proposed_pages?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    Wiki pages đề xuất ({mrp.plan.proposed_pages.length})
                  </p>
                  {mrp.plan.proposed_pages.map((p, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-1.5 bg-gray-50">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{p.title}</span>
                        {typeBadge(p.page_type)}
                        {deptBadge(p.department)}
                      </div>
                      <p className="text-xs text-gray-500">{p.reason}</p>
                      {p.tags?.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {p.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded">{t}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={approveMrp} disabled={approving}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                      {approving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
                      Tạo {mrp.plan.proposed_pages.length} wiki page{mrp.plan.proposed_pages.length > 1 ? "s" : ""}
                    </button>
                    <button onClick={rejectMrp}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors">
                      <XCircle size={12}/> Bỏ qua
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Không có wiki page nào được đề xuất cho tài liệu này.</p>
              )}
            </div>
          )}

          {mrp.status === "done" && (
            <div className="flex items-start gap-2 text-sm text-green-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0"/>
              <span>Đã tạo {mrp.created?.length ?? 0} wiki page{(mrp.created?.length ?? 0) > 1 ? "s" : ""}:{" "}
                <span className="font-medium">{mrp.created?.join(", ")}</span>
              </span>
            </div>
          )}

          {mrp.status === "rejected" && (
            <p className="text-sm text-gray-400">Đã bỏ qua — không tạo wiki page.</p>
          )}

          {mrp.status === "error" && (
            <p className="text-sm text-red-600">Lỗi phân tích: {mrp.error}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Lọc:</span>
        <div className="flex gap-1 flex-wrap">
          {([["","Tất cả"],...DEPTS] as [string,string][]).map(([k,v]) => (
            <button key={k} onClick={() => setDeptFilter(k as any)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${deptFilter===k?"bg-brand-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{v}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
      ) : docs.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Chưa có tài liệu nào</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">Tên tài liệu</th>
              <th className="px-4 py-3 font-medium">Phòng ban</th>
              <th className="px-4 py-3 font-medium text-right">Chunks</th>
              <th className="px-4 py-3 font-medium">Upload bởi</th>
              <th className="px-4 py-3 font-medium">Ngày</th>
              <th className="px-4 py-3"/>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3"><div className="flex items-center gap-2">{FILE_ICON[d.file_type]??<File size={14} className="text-gray-400"/>}<span className="font-medium text-gray-800">{d.name}</span><span className="text-[10px] text-gray-400 uppercase">.{d.file_type}</span></div></td>
                  <td className="px-4 py-3">{deptBadge(d.department)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{d.chunk_count}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{d.uploaded_by}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(d.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {canDelete(d.uploaded_by) && (
                      <button onClick={() => setConfirmDelete({id:d.id, name:d.name})} title="Xóa"
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        loading={deleting}
        message={`Xóa tài liệu "${confirmDelete?.name}"? Toàn bộ chunks và embeddings sẽ bị xóa vĩnh viễn.`}
        onConfirm={() => confirmDelete && deleteDoc(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

// ─── Wiki Tab ─────────────────────────────────────────────────────────────────
function WikiTab({ role, username, canWikiEdit }: { role: string; username: string; canWikiEdit: boolean }) {
  const canEdit = (createdBy: string) => canWikiEdit || createdBy === username
  const isAdmin = role === "admin" || role === "creator"  // creator = super-admin: ẩn/hiện trang + đổi phòng ban
  const [view,       setView]       = useState<"list"|"read"|"edit">("list")
  const [pages,      setPages]      = useState<WikiPage[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<WikiPage | null>(null)
  const [versions,   setVersions]   = useState<WikiVersion[]>([])
  const [showHistory,setShowHistory]= useState(false)
  const [search,     setSearch]     = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [deptFilter, setDeptFilter] = useState("")
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDel,    setConfirmDel]    = useState(false)
  const [wikiResults,   setWikiResults]   = useState<SearchResult[]>([])
  const [semanticSearching, setSemanticSearching] = useState(false)
  const [msg,        setMsg]        = useState<{type:"success"|"error";text:string}|null>(null)
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editForm,   setEditForm]   = useState({ title:"", content:"", page_type:"note", department:"all", tags:"" })
  const [previewMd,  setPreviewMd]  = useState(false)

  const fetchPages = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (search)     p.set("search", search)
    if (typeFilter) p.set("type",   typeFilter)
    if (deptFilter) p.set("dept",   deptFilter)
    const r = await fetch(`/api/kb/wiki?${p}`)
    const d = await r.json()
    setPages(d.data ?? [])
    setLoading(false)
  }, [search, typeFilter, deptFilter])

  useEffect(() => { if (view==="list") fetchPages() }, [view, fetchPages])

  const openPage = async (page: WikiPage) => {
    const r = await fetch(`/api/kb/wiki/${page.id}`)
    const d = await r.json()
    setSelected(d.page)
    setVersions(d.versions ?? [])
    setView("read")
    setShowHistory(false)
  }

  const startCreate = () => {
    setSelected(null)
    setEditForm({ title:"", content:"", page_type:"note", department:"all", tags:"" })
    setPreviewMd(false)
    setView("edit")
  }

  const startEdit = () => {
    if (!selected) return
    setEditForm({
      title:      selected.title,
      content:    selected.content ?? "",
      page_type:  selected.page_type,
      department: selected.department,
      tags:       (selected.tags ?? []).join(", "),
    })
    setPreviewMd(false)
    setView("edit")
  }

  const savePage = async () => {
    if (!editForm.title.trim()) { setMsg({ type:"error", text:"Cần nhập tiêu đề" }); return }
    setSaving(true); setMsg(null)
    const body = {
      title:      editForm.title,
      content:    editForm.content,
      page_type:  editForm.page_type,
      department: editForm.department,
      tags:       editForm.tags.split(",").map(t=>t.trim()).filter(Boolean),
    }
    const url    = selected ? `/api/kb/wiki/${selected.id}` : "/api/kb/wiki"
    const method = selected ? "PATCH" : "POST"
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const d = await r.json()
    setSaving(false)
    if (r.ok) {
      setMsg({ type:"success", text: selected?"Đã cập nhật":"Đã tạo wiki page" })
      setTimeout(() => { setMsg(null); setView("list") }, 800)
    } else {
      setMsg({ type:"error", text: d.error ?? "Hiếu đang fix, vui lòng đợi" })
    }
  }

  const deletePage = async () => {
    if (!selected) return
    setDeleting(true)
    const r = await fetch(`/api/kb/wiki/${selected.id}`, { method:"DELETE" })
    setDeleting(false)
    if (r.ok) { setView("list"); setSelected(null) }
    setConfirmDel(false)
  }

  const toggleHidden = async (page: WikiPage) => {
    const r = await fetch(`/api/kb/wiki/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: !page.is_hidden }),
    })
    if (r.ok) fetchPages()
  }

  const changeDept = async (id: string, dept: string) => {
    setEditingDeptId(null)
    const r = await fetch(`/api/kb/wiki/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: dept }),
    })
    if (r.ok) setPages(prev => prev.map(p => p.id === id ? { ...p, department: dept } : p))
  }

  // Navigate sang wiki page khác khi user bấm vào wikilink trong nội dung
  const handleWikiLink = async (display: string) => {
    // Tìm trong pages đã load trước
    const d = display.toLowerCase()
    const local = pages.find(p => {
      const t = p.title.toLowerCase()
      if (t.includes(d) || d.includes(t.split("—")[0].trim())) return true
      return d.split(/[\s—–]+/).filter(w => w.length > 2).some(w => t.includes(w))
    })
    if (local) { openPage(local); return }
    // Fallback: gọi API tìm theo title
    const term = display.split(" ").slice(0, 3).join(" ")
    const r = await fetch(`/api/kb/wiki?search=${encodeURIComponent(term)}`)
    const d2 = await r.json()
    if (d2.data?.[0]) openPage(d2.data[0])
  }

  const runSemanticSearch = async (q: string) => {
    if (!q.trim()) { setWikiResults([]); return }
    setSemanticSearching(true)
    try {
      const r = await fetch("/api/kb/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 6 }),
      })
      const d = await r.json()
      setWikiResults((d.results ?? []).filter((x: SearchResult) => x.source === "wiki"))
    } catch { setWikiResults([]) }
    setSemanticSearching(false)
  }

  // ── List view ──
  if (view === "list") return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setWikiResults([]) }}
            onKeyDown={e => { if (e.key === "Enter") { fetchPages(); runSemanticSearch(search) } }}
            placeholder="Tìm tiêu đề... (Enter = tìm ngữ nghĩa)"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          <option value="">Tất cả loại</option>
          {Object.entries(PAGE_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          <option value="">Tất cả phòng ban</option>
          {DEPTS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => { setSearch(""); setTypeFilter(""); setDeptFilter(""); fetchPages() }}
          className="px-3 py-2 text-sm border border-gray-200 text-gray-500 rounded-xl hover:border-gray-300 transition-colors">Reset</button>
        {canWikiEdit && (
          <button onClick={startCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors ml-auto">
            <Plus size={14}/>Tạo trang
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
      ) : pages.length === 0 ? (
        <div className="py-16 text-center text-gray-400"><PenLine size={32} className="mx-auto mb-3 text-gray-300"/><p>Chưa có wiki page nào. Bấm "Tạo trang" để bắt đầu.</p></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">Tiêu đề</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Phòng ban</th>
              <th className="px-4 py-3 font-medium">Cập nhật</th>
              <th className="px-4 py-3 font-medium">Bởi</th>
              {isAdmin && <th className="px-4 py-3"/>}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${p.is_hidden ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-800 cursor-pointer" onClick={() => openPage(p)}>
                    <span className="flex items-center gap-2">
                      {p.title}
                      {p.is_hidden && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded-full font-normal">Ẩn</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => openPage(p)}>{typeBadge(p.page_type)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {isAdmin && editingDeptId === p.id ? (
                      <select
                        autoFocus
                        defaultValue={p.department}
                        onBlur={e => changeDept(p.id, e.target.value)}
                        onChange={e => changeDept(p.id, e.target.value)}
                        className="text-xs border border-brand-400 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {DEPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : (
                      <span
                        onClick={() => isAdmin ? setEditingDeptId(p.id) : openPage(p)}
                        className="cursor-pointer"
                        title={isAdmin ? "Click để đổi phòng ban" : undefined}
                      >
                        {deptBadge(p.department)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 cursor-pointer" onClick={() => openPage(p)}>{fmtDate(p.updated_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 cursor-pointer" onClick={() => openPage(p)}>{p.updated_by}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleHidden(p)} title={p.is_hidden ? "Hiện trang" : "Ẩn trang"}
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        {p.is_hidden ? <Eye size={13}/> : <EyeOff size={13}/>}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Semantic search results */}
      {(semanticSearching || wikiResults.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Search size={12}/> Kết quả ngữ nghĩa {semanticSearching && <Loader2 size={11} className="animate-spin ml-1"/>}
          </p>
          {wikiResults.map((r, i) => (
            <div key={i} className="bg-white border border-brand-100 rounded-xl p-3 space-y-1 hover:border-brand-300 transition-colors cursor-pointer"
              onClick={() => { const p = pages.find(pg => pg.id === String(r.document_id)); if (p) openPage(p) }}>
              <div className="flex items-center gap-2 flex-wrap">
                {r.page_type && typeBadge(r.page_type)}
                <span className="text-sm font-semibold text-gray-800">{r.document_name}</span>
                {deptBadge(r.department)}
                <span className="text-xs text-gray-400 ml-auto">{Math.round(r.similarity * 100)}% khớp</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{r.content}</p>
            </div>
          ))}
          {!semanticSearching && wikiResults.length === 0 && search && (
            <p className="text-xs text-gray-400 pl-1">Không có kết quả ngữ nghĩa</p>
          )}
        </div>
      )}
    </div>
  )

  // ── Read view ──
  if (view === "read" && selected) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setView("list")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors">
          <ChevronLeft size={15}/>Danh sách
        </button>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => setShowHistory(h => !h)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${showHistory?"bg-brand-50 border-brand-300 text-brand-700":"border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            <History size={13}/>Lịch sử ({versions.length})
          </button>
          {canEdit(selected.created_by) && (
            <>
              <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-colors">
                <PenLine size={13}/>Sửa
              </button>
              <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors">
                <Trash2 size={13}/>Xóa
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start gap-2 mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex-1">{selected.title}</h2>
          <div className="flex gap-1.5 flex-wrap">{typeBadge(selected.page_type)}{deptBadge(selected.department)}</div>
        </div>
        <p className="text-xs text-gray-400 mb-4">Cập nhật {fmtDate(selected.updated_at)} bởi {selected.updated_by}</p>
        {selected.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-4">
            {selected.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{t}</span>)}
          </div>
        )}
        <div className="markdown-body prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            p:  ({children}) => <p  className="mb-3">{children}</p>,
            h1: ({children}) => <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>,
            h2: ({children}) => <h2 className="text-base font-semibold mb-2 mt-3 border-b border-gray-100 pb-1">{children}</h2>,
            h3: ({children}) => <h3 className="text-sm font-semibold mb-1 mt-3">{children}</h3>,
            ul: ({children}) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
            ol: ({children}) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
            li: ({children}) => <li className="text-gray-700">{children}</li>,
            table: ({children}) => <div className="overflow-x-auto mb-3 rounded-lg border border-gray-200"><table className="text-xs w-full border-collapse">{children}</table></div>,
            thead: ({children}) => <thead className="bg-gray-50">{children}</thead>,
            th:    ({children}) => <th className="px-3 py-2 text-left font-semibold border-b border-gray-200">{children}</th>,
            td:    ({children}) => <td className="px-3 py-2 border-b border-gray-100">{children}</td>,
            a: ({ href, children }) => {
              if (href?.startsWith("wiki://")) {
                const query = decodeURIComponent(href.slice(7))
                return (
                  <button
                    onClick={() => handleWikiLink(query)}
                    className="text-brand-600 hover:text-brand-700 underline decoration-brand-200 cursor-pointer font-medium"
                  >
                    {children}
                  </button>
                )
              }
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{children}</a>
            },
            code: ({ className, children }) => {
              const lang = /language-(\w+)/.exec(className ?? "")?.[1]
              if (lang === "mermaid")
                return <MermaidBlock code={String(children).trim()} />
              return <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
            },
            pre: ({ children }) => <>{children}</>,
          }}>
            {processWikilinks(selected.content ?? "")}
          </ReactMarkdown>
        </div>
      </div>

      {showHistory && versions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Lịch sử thay đổi</h4>
          <div className="space-y-1">
            {versions.map(v => (
              <div key={v.id} className="flex items-center gap-3 text-xs text-gray-500 py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-mono text-gray-400">v{v.version}</span>
                <span>{fmtDate(v.updated_at)}</span>
                <span>bởi {v.updated_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDel}
        loading={deleting}
        message={`Xóa trang "${selected?.title}"? Lịch sử các phiên bản cũng sẽ bị xóa vĩnh viễn.`}
        onConfirm={deletePage}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )

  // ── Edit view ──
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setView(selected?"read":"list")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors">
          <ChevronLeft size={15}/>{selected?"Quay lại":"Danh sách"}
        </button>
        <h3 className="text-sm font-semibold text-gray-700">{selected?"Chỉnh sửa trang":"Tạo trang mới"}</h3>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm ${msg.type==="success"?"bg-green-50 border border-green-200 text-green-700":"bg-red-50 border border-red-200 text-red-700"}`}>{msg.text}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tiêu đề *</label>
            <input value={editForm.title} onChange={e => setEditForm(f=>({...f,title:e.target.value}))} placeholder="Tên trang"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Loại trang</label>
            <select value={editForm.page_type} onChange={e => setEditForm(f=>({...f,page_type:e.target.value}))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {Object.entries(PAGE_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phòng ban</label>
            <select value={editForm.department} onChange={e => setEditForm(f=>({...f,department:e.target.value}))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {DEPTS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tags (cách nhau bằng dấu phẩy)</label>
            <input value={editForm.tags} onChange={e => setEditForm(f=>({...f,tags:e.target.value}))} placeholder="WM, Japan, eSIM..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Nội dung (Markdown)</label>
            <button onClick={() => setPreviewMd(p=>!p)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
              {previewMd?<><PenLine size={11}/>Soạn thảo</>:<><Eye size={11}/>Xem trước</>}
            </button>
          </div>
          {previewMd ? (
            <div className="min-h-[300px] p-4 border border-gray-200 rounded-xl bg-gray-50 prose prose-sm max-w-none text-sm">
              {editForm.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editForm.content}</ReactMarkdown>
              ) : (
                <p className="text-gray-400 italic">Chưa có nội dung</p>
              )}
            </div>
          ) : (
            <textarea value={editForm.content} onChange={e => setEditForm(f=>({...f,content:e.target.value}))}
              rows={16} placeholder="# Tiêu đề&#10;&#10;Nội dung Markdown...&#10;&#10;## Mục 1&#10;- Điểm 1&#10;- Điểm 2"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono resize-y"/>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={savePage} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            {saving?<Loader2 size={14} className="animate-spin"/>:null}
            {saving?"Đang lưu...":selected?"Lưu thay đổi":"Tạo trang"}
          </button>
          <button onClick={() => setView(selected?"read":"list")}
            className="px-5 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
            Hủy
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDel}
        loading={deleting}
        message={`Xóa trang "${selected?.title}"? Lịch sử các phiên bản cũng sẽ bị xóa vĩnh viễn.`}
        onConfirm={deletePage}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

// ─── Search Tab ───────────────────────────────────────────────────────────────
function SearchTab() {
  const [query,      setQuery]      = useState("")
  const [searching,  setSearching]  = useState(false)
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [searched,   setSearched]   = useState(false)
  const [searchDept, setSearchDept] = useState("")

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setResults([]); setSearched(false)
    const r = await fetch("/api/kb/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, department: searchDept || null }),
    })
    const d = await r.json()
    setResults(d.results ?? [])
    setSearched(true); setSearching(false)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tìm kiếm trong tài liệu và wiki..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <select value={searchDept} onChange={e => setSearchDept(e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
          <option value="">Tất cả phòng ban</option>
          {DEPTS.filter(([k])=>k!=="all").map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" disabled={!query.trim()||searching}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {searching?<Loader2 size={15} className="animate-spin"/>:"Tìm"}
        </button>
      </form>

      {searching && <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 size={15} className="animate-spin"/>Đang tìm kiếm...</div>}
      {searched && !searching && results.length === 0 && <div className="py-12 text-center text-gray-400">Không tìm thấy kết quả phù hợp</div>}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{results.length} kết quả cho &ldquo;{query}&rdquo;</p>
          {results.map((r,i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 hover:border-brand-200 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.source==="wiki"?"bg-purple-100 text-purple-600":"bg-gray-100 text-gray-500"}`}>
                  {r.source==="wiki"?"📝 Wiki":"📄 Tài liệu"}
                </span>
                {r.page_type && typeBadge(r.page_type)}
                <span className="text-sm font-semibold text-gray-800">{r.document_name}</span>
                {deptBadge(r.department)}
                <span className="text-xs text-gray-400 ml-auto">{Math.round(r.similarity*100)}% khớp</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {!searched && !searching && (
        <div className="py-12 text-center text-gray-400">
          <BookOpen size={32} className="mx-auto mb-3 text-gray-300"/>
          <p>Nhập câu hỏi để tìm trong tài liệu và wiki nội bộ</p>
        </div>
      )}
    </div>
  )
}
