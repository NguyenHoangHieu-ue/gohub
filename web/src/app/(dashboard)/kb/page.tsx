"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useSession }     from "next-auth/react"
import ReactMarkdown      from "react-markdown"
import remarkGfm          from "remark-gfm"
import {
  BookOpen, Upload, Search, Trash2, FileText, File, FileCode, Loader2,
  PenLine, Eye, History, Plus, ChevronLeft, X,
} from "lucide-react"
import { DEPT_LABELS, type Department } from "@/lib/kb"

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
  department: string; tags: string[]; version: number
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KBPage() {
  const { data: session } = useSession()
  const role     = (session?.user as any)?.role ?? "standard"
  const username = session?.user?.name ?? ""
  const [tab, setTab] = useState<"docs" | "wiki" | "search">("docs")

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <BookOpen size={20} className="text-brand-600 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900">Kiến Thức Nội Bộ</h1>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([["docs","Tài liệu",<FileText size={14}/>],["wiki","Wiki",<PenLine size={14}/>],["search","Tìm kiếm",<Search size={14}/>]] as const).map(([id,label,icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab===id?"bg-white text-brand-700 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "docs"   && <DocsTab   role={role} username={username} />}
      {tab === "wiki"   && <WikiTab   role={role} username={username} />}
      {tab === "search" && <SearchTab />}
    </div>
  )
}

// ─── Docs Tab ─────────────────────────────────────────────────────────────────
function DocsTab({ role, username }: { role: string; username: string }) {
  const [docs,       setDocs]       = useState<KBDoc[]>([])
  const [loading,    setLoading]    = useState(true)
  const [deptFilter, setDeptFilter] = useState<Department | "">("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [uploadMsg,  setUploadMsg]  = useState<{type:"success"|"error";text:string}|null>(null)
  const [form,       setForm]       = useState({ department: "all" as Department, name: "" })
  const [fileRef,    setFileRef]    = useState<File | null>(null)
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
    if (deletingId !== id) { setDeletingId(id); return }
    setDeletingId(null)
    const r = await fetch(`/api/kb/documents/${id}`, { method: "DELETE" })
    if (r.ok) setDocs(p => p.filter(d => d.id !== id))
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileRef) { setUploadMsg({ type: "error", text: "Chưa chọn file" }); return }
    setUploading(true); setUploadMsg(null)
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
    } else {
      setUploadMsg({ type: "error", text: d.error ?? "Hiếu đang fix, vui lòng đợi" })
    }
  }

  return (
    <div className="space-y-5">
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
                    {(role==="admin"||d.uploaded_by===username) && (
                      <button onClick={() => deleteDoc(d.id)} title={deletingId===d.id?"Bấm lại để xác nhận xóa":"Xóa"}
                        className={`p-1.5 rounded-lg transition-colors ${deletingId===d.id?"bg-red-100 text-red-600":"text-gray-400 hover:text-red-600 hover:bg-red-50"}`}>
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
    </div>
  )
}

// ─── Wiki Tab ─────────────────────────────────────────────────────────────────
function WikiTab({ role, username }: { role: string; username: string }) {
  const [view,       setView]       = useState<"list"|"read"|"edit">("list")
  const [pages,      setPages]      = useState<WikiPage[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<WikiPage | null>(null)
  const [versions,   setVersions]   = useState<WikiVersion[]>([])
  const [showHistory,setShowHistory]= useState(false)
  const [search,     setSearch]     = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [deptFilter, setDeptFilter] = useState("")
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState<{type:"success"|"error";text:string}|null>(null)
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
    const r = await fetch(`/api/kb/wiki/${selected.id}`, { method:"DELETE" })
    if (r.ok) { setView("list"); setSelected(null) }
  }

  // ── List view ──
  if (view === "list") return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==="Enter"&&fetchPages()}
            placeholder="Tìm tiêu đề..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"/>
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
        <button onClick={startCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors ml-auto">
          <Plus size={14}/>Tạo trang
        </button>
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
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map(p => (
                <tr key={p.id} onClick={() => openPage(p)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.title}</td>
                  <td className="px-4 py-3">{typeBadge(p.page_type)}</td>
                  <td className="px-4 py-3">{deptBadge(p.department)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(p.updated_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.updated_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          {(role==="admin"||selected.created_by===username) && (
            <>
              <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-colors">
                <PenLine size={13}/>Sửa
              </button>
              <button onClick={deletePage} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors">
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
        <p className="text-xs text-gray-400 mb-4">v{selected.version} · Cập nhật {fmtDate(selected.updated_at)} bởi {selected.updated_by}</p>
        {selected.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-4">
            {selected.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{t}</span>)}
          </div>
        )}
        <div className="markdown-body prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            p:({children})=><p className="mb-3">{children}</p>,
            h1:({children})=><h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>,
            h2:({children})=><h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
            h3:({children})=><h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
            ul:({children})=><ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
            ol:({children})=><ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
            li:({children})=><li className="text-gray-700">{children}</li>,
            code:({children})=><code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
            table:({children})=><div className="overflow-x-auto mb-3 rounded-lg border border-gray-200"><table className="text-xs w-full border-collapse">{children}</table></div>,
            thead:({children})=><thead className="bg-gray-50">{children}</thead>,
            th:({children})=><th className="px-3 py-2 text-left font-semibold border-b border-gray-200">{children}</th>,
            td:({children})=><td className="px-3 py-2 border-b border-gray-100">{children}</td>,
          }}>
            {selected.content ?? ""}
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
