"use client"

// Upload tài liệu (PDF/DOCX/MD/TXT) → chunk + embed → MRP AI đề xuất trang Wiki chính thức.
// Chuyển từ trang /kb cũ (đã gộp Wiki+Docs+Search vào Tổ Gấu) — chỉ admin/creator dùng, đặt ở Creator Settings.
import { useEffect, useState, useCallback, useRef } from "react"
import {
  Upload, X, Trash2, FileText, File, FileCode, Loader2,
  Brain, CheckCircle2, XCircle,
} from "lucide-react"
import type { MrpPlan } from "@/lib/mrp"
import { DEPT_LABELS, type Department } from "@/lib/kb-constants"
import { ConfirmModal } from "@/components/confirm-modal"
import { SkeletonTable } from "@/components/skeleton"
import { EmptyState } from "@/components/empty-state"

interface KBDoc {
  id: string; name: string; file_type: string; department: Department
  chunk_count: number; uploaded_by: string; created_at: string
}

type MrpState = {
  jobId:    string
  status:   "analyzing" | "plan_ready" | "done" | "rejected" | "error"
  plan?:    MrpPlan
  created?: string[]
  error?:   string
}

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

export default function KbDocsSection() {
  const [docs,          setDocs]          = useState<KBDoc[]>([])
  const [loading,       setLoading]       = useState(true)
  const [deptFilter,    setDeptFilter]    = useState<Department | "">("")
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadMsg,     setUploadMsg]     = useState<{ type: "success" | "error"; text: string } | null>(null)
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId }),
    })
    const d = await r.json()
    if (r.ok) setMrp({ jobId: d.id, status: "plan_ready", plan: d.plan })
    else setMrp({ jobId: "", status: "error", error: d.error ?? "Lỗi phân tích" })
  }

  const approveMrp = async () => {
    if (!mrp?.jobId) return
    setApproving(true)
    const r = await fetch(`/api/kb/process/${mrp.jobId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
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
      method: "PATCH", headers: { "Content-Type": "application/json" },
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
      <p className="text-[13px] text-slate-500">
        Upload file → AI đề xuất trang Wiki chính thức. Sau khi tạo, vào group Tổ Gấu → tab Tài liệu → Chính thức
        để gán trang cho đúng nhóm.
      </p>

      <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Upload size={15} className="text-brand-500" />Upload tài liệu mới</h3>
        {uploadMsg && (
          <div className={`px-3 py-2 rounded-lg text-sm ${uploadMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>{uploadMsg.text}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
            <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt" onChange={e => setFileRef(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, MD, TXT — tối đa 10MB</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phòng ban</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as Department }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {DEPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên (tuỳ chọn)</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Để trống = dùng tên file"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <button type="submit" disabled={!fileRef || uploading}
          className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {uploading ? <><Loader2 size={14} className="animate-spin" />Đang xử lý...</> : <><Upload size={14} />Upload & Embed</>}
        </button>
      </form>

      {mrp && (
        <div className="bg-white border border-brand-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <Brain size={15} /> AI Phân Tích (MRP)
            </div>
            <button onClick={() => setMrp(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>

          {mrp.status === "analyzing" && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> AI đang phân tích tài liệu...
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
                      {approving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Tạo {mrp.plan.proposed_pages.length} wiki page{mrp.plan.proposed_pages.length > 1 ? "s" : ""}
                    </button>
                    <button onClick={rejectMrp}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors">
                      <XCircle size={12} /> Bỏ qua
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
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
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
          {([["", "Tất cả"], ...DEPTS] as [string, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setDeptFilter(k as Department | "")}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${deptFilter === k ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{v}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : docs.length === 0 ? (
        <EmptyState title="Chưa có tài liệu nào" description="Upload file để AI đề xuất trang Wiki" />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">Tên tài liệu</th>
              <th className="px-4 py-3 font-medium">Phòng ban</th>
              <th className="px-4 py-3 font-medium text-right">Chunks</th>
              <th className="px-4 py-3 font-medium">Upload bởi</th>
              <th className="px-4 py-3 font-medium">Ngày</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3"><div className="flex items-center gap-2">{FILE_ICON[d.file_type] ?? <File size={14} className="text-gray-400" />}<span className="font-medium text-gray-800">{d.name}</span><span className="text-[10px] text-gray-400 uppercase">.{d.file_type}</span></div></td>
                  <td className="px-4 py-3">{deptBadge(d.department)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{d.chunk_count}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{d.uploaded_by}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(d.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setConfirmDelete({ id: d.id, name: d.name })} title="Xóa"
                      className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
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
