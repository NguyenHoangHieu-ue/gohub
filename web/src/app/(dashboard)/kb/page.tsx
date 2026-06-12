"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession }                                from "next-auth/react"
import { BookOpen, Upload, Search, Trash2, FileText, File, FileCode, Loader2 } from "lucide-react"
import { DEPT_LABELS, type Department }              from "@/lib/kb"

interface KBDoc {
  id:          string
  name:        string
  file_type:   string
  department:  Department
  chunk_count: number
  uploaded_by: string
  created_at:  string
}

interface SearchResult {
  chunk_id:      number
  document_id:   string
  document_name: string
  department:    string
  content:       string
  similarity:    number
}

const DEPTS = Object.entries(DEPT_LABELS) as [Department, string][]
const FILE_ICON: Record<string, React.ReactNode> = {
  pdf:  <FileText size={14} className="text-red-500"  />,
  docx: <File     size={14} className="text-blue-500" />,
  md:   <FileCode size={14} className="text-purple-500" />,
  txt:  <FileCode size={14} className="text-gray-400" />,
}

function deptBadge(dept: string) {
  const colors: Record<string, string> = {
    all:     "bg-gray-100 text-gray-500",
    sales:   "bg-green-100 text-green-700",
    product: "bg-blue-100 text-blue-700",
    tech:    "bg-purple-100 text-purple-700",
    finance: "bg-amber-100 text-amber-700",
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colors[dept] ?? "bg-gray-100 text-gray-500"}`}>
      {DEPT_LABELS[dept as Department] ?? dept}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default function KBPage() {
  const { data: session } = useSession()
  const role     = (session?.user as any)?.role ?? "standard"
  const username = session?.user?.name ?? ""

  const [tab,         setTab]         = useState<"docs" | "search">("docs")
  const [docs,        setDocs]        = useState<KBDoc[]>([])
  const [loading,     setLoading]     = useState(true)
  const [deptFilter,  setDeptFilter]  = useState<Department | "">("")
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState<{ type: "success"|"error"; text: string } | null>(null)
  const [uploadForm,  setUploadForm]  = useState({ department: "all" as Department, name: "" })
  const [fileRef,     setFileRef]     = useState<File | null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)

  const [query,       setQuery]       = useState("")
  const [searching,   setSearching]   = useState(false)
  const [results,     setResults]     = useState<SearchResult[]>([])
  const [searched,    setSearched]    = useState(false)
  const [searchDept,  setSearchDept]  = useState<Department | "">("")

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const params = deptFilter ? `?dept=${deptFilter}` : ""
    const res    = await fetch(`/api/kb/documents${params}`)
    const data   = await res.json()
    setDocs(data.data ?? [])
    setLoading(false)
  }, [deptFilter])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const deleteDoc = async (id: string) => {
    if (deletingId === id) {
      setDeletingId(null)
      const res = await fetch(`/api/kb/documents/${id}`, { method: "DELETE" })
      if (res.ok) setDocs(prev => prev.filter(d => d.id !== id))
    } else {
      setDeletingId(id)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileRef) { setUploadMsg({ type: "error", text: "Chưa chọn file" }); return }
    setUploading(true)
    setUploadMsg(null)
    const fd = new FormData()
    fd.append("file",       fileRef)
    fd.append("department", uploadForm.department)
    fd.append("name",       uploadForm.name)
    const res = await fetch("/api/kb/documents", { method: "POST", body: fd })
    const data = await res.json()
    setUploading(false)
    if (res.ok) {
      setUploadMsg({ type: "success", text: `Đã upload "${data.name}" — ${data.chunk_count} chunks` })
      setFileRef(null)
      setUploadForm({ department: "all", name: "" })
      if (inputRef.current) inputRef.current.value = ""
      fetchDocs()
    } else {
      setUploadMsg({ type: "error", text: data.error ?? "Hiếu đang fix, vui lòng đợi" })
    }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    setSearched(false)
    const res  = await fetch("/api/kb/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, department: searchDept || null }),
    })
    const data = await res.json()
    setResults(data.results ?? [])
    setSearched(true)
    setSearching(false)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <BookOpen size={20} className="text-brand-600 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900">Kiến Thức Nội Bộ</h1>
        {!loading && <span className="text-sm text-gray-400 ml-1">{docs.length} tài liệu</span>}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([["docs", "Tài liệu"], ["search", "Tìm kiếm"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {id === "docs" ? <FileText size={14} /> : <Search size={14} />}
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Tài liệu ── */}
      {tab === "docs" && (
        <div className="space-y-5">
          {/* Upload form */}
          <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Upload size={15} className="text-brand-500" /> Upload tài liệu mới
            </h3>

            {uploadMsg && (
              <div className={`px-3 py-2 rounded-lg text-sm ${
                uploadMsg.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>{uploadMsg.text}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  onChange={e => setFileRef(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                />
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX, MD, TXT — tối đa 10MB</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phòng ban</label>
                <select value={uploadForm.department} onChange={e => setUploadForm(f => ({ ...f, department: e.target.value as Department }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  {DEPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tên (tuỳ chọn)</label>
                <input type="text" value={uploadForm.name} onChange={e => setUploadForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Để trống = dùng tên file"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button type="submit" disabled={!fileRef || uploading}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Đang xử lý...</> : <><Upload size={14} /> Upload & Embed</>}
            </button>
          </form>

          {/* Filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Lọc:</span>
            <div className="flex gap-1">
              {[["", "Tất cả"], ...DEPTS].map(([k, v]) => (
                <button key={k as string} onClick={() => setDeptFilter(k as Department | "")}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    deptFilter === k
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>{v as string}</button>
              ))}
            </div>
          </div>

          {/* Document list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : docs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Chưa có tài liệu nào</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">Tên tài liệu</th>
                    <th className="px-4 py-3 font-medium">Phòng ban</th>
                    <th className="px-4 py-3 font-medium text-right">Chunks</th>
                    <th className="px-4 py-3 font-medium">Upload bởi</th>
                    <th className="px-4 py-3 font-medium">Ngày</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docs.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {FILE_ICON[d.file_type] ?? <File size={14} className="text-gray-400" />}
                          <span className="font-medium text-gray-800">{d.name}</span>
                          <span className="text-[10px] text-gray-400 uppercase">.{d.file_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{deptBadge(d.department)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{d.chunk_count}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{d.uploaded_by}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(d.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {(role === "admin" || d.uploaded_by === username) && (
                          <button onClick={() => deleteDoc(d.id)}
                            title={deletingId === d.id ? "Bấm lại để xác nhận xóa" : "Xóa"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              deletingId === d.id
                                ? "bg-red-100 text-red-600"
                                : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                            }`}>
                            <Trash2 size={13} />
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
      )}

      {/* ── Tab: Tìm kiếm ── */}
      {tab === "search" && (
        <div className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tìm kiếm trong tài liệu nội bộ..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select value={searchDept} onChange={e => setSearchDept(e.target.value as Department | "")}
              className="px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Tất cả phòng ban</option>
              {DEPTS.filter(([k]) => k !== "all").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="submit" disabled={!query.trim() || searching}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {searching ? <Loader2 size={15} className="animate-spin" /> : "Tìm"}
            </button>
          </form>

          {searching && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 size={15} className="animate-spin" /> Đang tìm kiếm...
            </div>
          )}

          {searched && !searching && results.length === 0 && (
            <div className="py-12 text-center text-gray-400">Không tìm thấy kết quả phù hợp</div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">{results.length} kết quả cho &ldquo;{query}&rdquo;</p>
              {results.map(r => (
                <div key={r.chunk_id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 hover:border-brand-200 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{r.document_name}</span>
                    {deptBadge(r.department)}
                    <span className="text-xs text-gray-400 ml-auto">
                      {Math.round(r.similarity * 100)}% khớp
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {r.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!searched && !searching && (
            <div className="py-12 text-center text-gray-400">
              <BookOpen size={32} className="mx-auto mb-3 text-gray-300" />
              <p>Nhập câu hỏi hoặc từ khóa để tìm trong tài liệu nội bộ</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
