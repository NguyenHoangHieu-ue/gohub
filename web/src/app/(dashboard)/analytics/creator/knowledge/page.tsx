"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession }                        from "next-auth/react"
import { useRouter }                         from "next/navigation"
import {
  BookOpen, Plus, Trash2, Save, RefreshCw, Tag, FileText,
  DollarSign, Package, Users, Cog, StickyNote, Cpu, ChevronRight,
  Eye, Edit3, Download, Upload, X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm     from "remark-gfm"

// ─── Types ────────────────────────────────────────────────────────────────────

interface KBEntry {
  id:         string
  key:        string
  category:   string
  title:      string
  content:    string
  metadata?:  any
  updated_at: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "product_codes",  label: "Mã Sản Phẩm",   icon: Package,    color: "violet"  },
  { id: "sku_rules",      label: "Quy Tắc SKU",    icon: Tag,        color: "blue"    },
  { id: "exchange_rates", label: "Tỷ Giá",          icon: DollarSign, color: "emerald" },
  { id: "cogs",           label: "COGS & Giá Vốn",  icon: DollarSign, color: "amber"   },
  { id: "vendors",        label: "Nhà Cung Cấp",    icon: Users,      color: "orange"  },
  { id: "processes",      label: "Quy Trình",        icon: Cog,        color: "cyan"    },
  { id: "wiki",           label: "Wiki & Tài Liệu", icon: BookOpen,   color: "indigo"  },
  { id: "notes",          label: "Ghi Chú Khác",    icon: StickyNote, color: "gray"    },
] as const

const COLOR_CLASSES: Record<string, { badge: string; active: string }> = {
  violet:  { badge: "bg-violet-100 text-violet-700",   active: "bg-violet-50 border-violet-300 text-violet-800" },
  blue:    { badge: "bg-blue-100 text-blue-700",       active: "bg-blue-50 border-blue-300 text-blue-800"       },
  emerald: { badge: "bg-emerald-100 text-emerald-700", active: "bg-emerald-50 border-emerald-300 text-emerald-800"},
  amber:   { badge: "bg-amber-100 text-amber-700",     active: "bg-amber-50 border-amber-300 text-amber-800"    },
  orange:  { badge: "bg-orange-100 text-orange-700",   active: "bg-orange-50 border-orange-300 text-orange-800" },
  cyan:    { badge: "bg-cyan-100 text-cyan-700",       active: "bg-cyan-50 border-cyan-300 text-cyan-800"       },
  gray:    { badge: "bg-gray-100 text-gray-600",       active: "bg-gray-50 border-gray-300 text-gray-700"       },
}

// ─── Sync button ─────────────────────────────────────────────────────────────

function SyncButton({ onDone }: { onDone: () => void }) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const r = await fetch("/api/creator-ai/knowledge?action=sync")
      const d = await r.json()
      if (d.ok) {
        setResult(`✓ Đã sync ${d.wiki} wiki + FX rates`)
        onDone()
      } else {
        setResult(`⚠ Lỗi: ${d.errors?.join(", ") || "unknown"}`)
      }
    } catch { setResult("⚠ Sync thất bại") }
    finally { setSyncing(false); setTimeout(() => setResult(null), 4000) }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button onClick={sync} disabled={syncing}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-violet-600 hover:bg-violet-50 border border-violet-200 rounded-lg transition-colors disabled:opacity-50">
        {syncing ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
        {syncing ? "Đang sync…" : "Sync Wiki + Tỷ giá"}
      </button>
      {result && <span className="text-[10px] text-gray-400">{result}</span>}
    </div>
  )
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [entries,      setEntries]      = useState<KBEntry[]>([])
  const [masterNote,   setMasterNote]   = useState<KBEntry | null>(null)
  const [activeCat,    setActiveCat]    = useState<string>("product_codes")
  const [selected,     setSelected]     = useState<KBEntry | null>(null)
  const [editMode,     setEditMode]     = useState(false)
  const [previewMode,  setPreviewMode]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState("")
  const [searchQ,      setSearchQ]      = useState("")
  const [importRows,   setImportRows]   = useState<{category:string;key:string;title:string;content:string}[]|null>(null)
  const [importing,    setImporting]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit form state
  const [formKey,      setFormKey]      = useState("")
  const [formTitle,    setFormTitle]    = useState("")
  const [formContent,  setFormContent]  = useState("")

  useEffect(() => {
    if (status === "loading") return
    if (!session?.user || session.user.role !== "creator") router.replace("/analytics")
  }, [session, status, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/creator-ai/knowledge")
      const data = await res.json() as KBEntry[]
      const master = data.find(e => e.key === "_master_note")
      setMasterNote(master || null)
      setEntries(data.filter(e => !e.key.startsWith("_")))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const catEntries = entries.filter(e => e.category === activeCat)
  const catMeta    = CATEGORIES.find(c => c.id === activeCat)
  const catCounts  = Object.fromEntries(CATEGORIES.map(c => [c.id, entries.filter(e => e.category === c.id).length]))
  const filteredEntries = searchQ.trim()
    ? catEntries.filter(e => e.title.toLowerCase().includes(searchQ.toLowerCase()) || e.content.toLowerCase().includes(searchQ.toLowerCase()))
    : catEntries

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ""
    const XLSX = await import("xlsx")
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: "array" })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" })
    setImportRows(raw
      .filter(r => r.title && r.content)
      .map(r => ({
        category: String(r.category || "notes").trim(),
        key:      String(r.key || "").trim(),
        title:    String(r.title).trim(),
        content:  String(r.content).trim(),
      }))
    )
  }

  async function doImport() {
    if (!importRows?.length) return
    setImporting(true)
    try {
      const r = await fetch("/api/creator-ai/knowledge?action=batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: importRows }),
      })
      const d = await r.json()
      if (r.ok) { setImportRows(null); await load() }
      else alert(d.error || "Lỗi import")
    } finally { setImporting(false) }
  }

  function openNew() {
    setSelected(null)
    setFormKey("")
    setFormTitle("")
    setFormContent("")
    setEditMode(true)
    setPreviewMode(false)
  }

  function openEdit(e: KBEntry) {
    setSelected(e)
    setFormKey(e.key)
    setFormTitle(e.title)
    setFormContent(e.content)
    setEditMode(true)
    setPreviewMode(false)
  }

  function openView(e: KBEntry) {
    setSelected(e)
    setEditMode(false)
    setPreviewMode(false)
  }

  async function save() {
    if (!formTitle.trim() || !formContent.trim()) return
    const key = selected?.key || formKey || slugify(formTitle)
    setSaving(true)
    try {
      await fetch("/api/creator-ai/knowledge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key, category: activeCat, title: formTitle.trim(), content: formContent.trim() }),
      })
      await load()
      setEditMode(false)
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  async function del(key: string) {
    if (!confirm(`Xóa entry "${key}"?`)) return
    setDeleting(key)
    try {
      await fetch(`/api/creator-ai/knowledge?key=${encodeURIComponent(key)}`, { method: "DELETE" })
      await load()
      if (selected?.key === key) { setSelected(null); setEditMode(false) }
    } finally {
      setDeleting("") }
  }

  if (status === "loading" || !session?.user || session.user.role !== "creator") return null

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden">
      {/* ── Category sidebar ── */}
      <div className="w-56 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-violet-600" />
            <h1 className="text-sm font-bold text-gray-900 dark:text-slate-100">Own Info</h1>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Gấu Pro tự đọc trước khi trả lời</p>
          <SyncButton onDone={load} />
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {CATEGORIES.map(cat => {
            const Icon    = cat.icon
            const isActive = activeCat === cat.id
            return (
              <button key={cat.id} onClick={() => { setActiveCat(cat.id); setSelected(null); setEditMode(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}>
                <Icon size={14} className={isActive ? "text-violet-600" : "text-gray-400"} />
                <span className="flex-1 text-left text-xs">{cat.label}</span>
                {catCounts[cat.id] > 0 && (
                  <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 rounded-full px-1.5 py-0.5">
                    {catCounts[cat.id]}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Master note */}
        <div className="p-3 border-t border-gray-200 dark:border-slate-800">
          <button onClick={() => { if (masterNote) openView(masterNote) }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <FileText size={13} />
            <span>Master Note</span>
          </button>
        </div>
      </div>

      {/* ── Entry list ── */}
      <div className="w-64 flex-shrink-0 bg-gray-50 dark:bg-slate-900/50 border-r border-gray-200 dark:border-slate-800 flex flex-col">
        <div className="px-3 py-2.5 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            {catMeta?.label} ({filteredEntries.length}{searchQ ? `/${catEntries.length}` : ""})
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Import Excel/CSV">
              <Upload size={11} />
            </button>
            <button onClick={openNew}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors">
              <Plus size={12} />Thêm
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFilePick} />
        <div className="px-2 pt-2">
          <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setSelected(null); setEditMode(false) }}
            placeholder="Tìm trong mục này…"
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-gray-300" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">{searchQ ? "Không tìm thấy kết quả" : "Chưa có entry nào"}</p>
              {!searchQ && <button onClick={openNew} className="mt-2 text-xs text-violet-600 hover:underline">+ Thêm entry đầu tiên</button>}
            </div>
          ) : (
            filteredEntries.map(e => (
              <div key={e.key}
                onClick={() => openView(e)}
                className={`group relative px-3 py-2.5 rounded-xl cursor-pointer border transition-all ${
                  selected?.key === e.key
                    ? "bg-white dark:bg-slate-800 border-violet-200 dark:border-violet-700 shadow-sm"
                    : "bg-white dark:bg-slate-800/60 border-transparent hover:border-gray-200 dark:hover:border-slate-700"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{e.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{e.content.slice(0, 60)}…</p>
                    <p className="text-[9px] text-gray-300 dark:text-slate-600 mt-1">{fmtDate(e.updated_at)}</p>
                  </div>
                  <button onClick={(ev) => { ev.stopPropagation(); del(e.key) }}
                    disabled={deleting === e.key}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 text-gray-300 hover:text-red-500 transition-all">
                    <Trash2 size={11} />
                  </button>
                </div>
                {selected?.key === e.key && (
                  <ChevronRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-violet-400" />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Import modal */}
      {importRows !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !importing && setImportRows(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-gray-900">Import Knowledge — Preview</h3>
                <p className="text-xs text-gray-400 mt-0.5">{importRows.length} entries sẽ được upsert (category, key, title, content)</p>
              </div>
              <button onClick={() => setImportRows(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              {importRows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Không tìm thấy row hợp lệ.<br />Cần cột <code className="bg-gray-100 px-1 rounded">title</code> + <code className="bg-gray-100 px-1 rounded">content</code> (optionals: category, key).</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-gray-50">
                    {["Category","Key","Title","Content (preview)"].map(h => (
                      <th key={h} className="text-left px-2 py-1.5 border border-gray-200 text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {importRows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1 border border-gray-200 text-gray-600">{r.category}</td>
                        <td className="px-2 py-1 border border-gray-200 font-mono text-gray-500 text-[10px]">{r.key || "(auto)"}</td>
                        <td className="px-2 py-1 border border-gray-200 font-medium text-gray-800">{r.title}</td>
                        <td className="px-2 py-1 border border-gray-200 text-gray-400">{r.content.slice(0, 80)}…</td>
                      </tr>
                    ))}
                    {importRows.length > 20 && (
                      <tr><td colSpan={4} className="px-2 py-2 border border-gray-200 text-gray-400 text-center text-[11px]">...và {importRows.length - 20} entries nữa</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex gap-2 justify-end shrink-0">
              <button onClick={() => setImportRows(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Huỷ</button>
              <button onClick={doImport} disabled={importing || importRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-500 disabled:opacity-40">
                {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? "Đang nhập…" : `Nhập ${importRows.length} entries`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail / Editor ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!editMode && !selected && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-violet-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Creator Knowledge Base</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed mb-4">
              Định nghĩa cấu trúc mã, tỷ giá, COGS, vendor rules, quy trình...
              Gấu Pro sẽ đọc trước khi trả lời để đảm bảo nhất quán.
            </p>
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-xs text-violet-600 dark:text-violet-400">
              <Cpu size={13} />
              <span>Gấu Pro tự đồng bộ khi có thay đổi</span>
            </div>
          </div>
        )}

        {(editMode || selected) && (
          <>
            {/* Toolbar */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editMode ? (
                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {selected ? "Sửa entry" : "Entry mới"}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate max-w-xs">
                    {selected?.title}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!editMode && selected && !selected.key.startsWith("_") && (
                  <>
                    <button onClick={() => setPreviewMode(!previewMode)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                        previewMode ? "bg-gray-100 text-gray-700" : "text-gray-500 hover:bg-gray-100"
                      }`}>
                      <Eye size={13} />
                      Preview
                    </button>
                    <button onClick={() => openEdit(selected)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                      <Edit3 size={13} />
                      Sửa
                    </button>
                  </>
                )}
                {editMode && (
                  <>
                    <button onClick={() => { setEditMode(false); if (!selected) setSelected(null) }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      Huỷ
                    </button>
                    <button onClick={save} disabled={saving || !formTitle.trim() || !formContent.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-colors">
                      <Save size={12} />
                      {saving ? "Đang lưu…" : "Lưu"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {editMode ? (
                <div className="p-5 space-y-4 max-w-3xl">
                  {!selected && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Key (slug, auto-generated)</label>
                      <input value={formKey} onChange={e => setFormKey(slugify(e.target.value))} placeholder="vd: fx_usd_vnd"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tiêu đề</label>
                    <input value={formTitle} onChange={e => {
                        setFormTitle(e.target.value)
                        if (!selected && !formKey) setFormKey(slugify(e.target.value))
                      }}
                      placeholder="vd: Tỷ giá USD/VND"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nội dung (Markdown)</label>
                    <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={16}
                      placeholder="Viết nội dung bằng Markdown...&#10;&#10;Vd:&#10;**Tỷ giá áp dụng:** 1 USD = 26,000 VND&#10;**Cập nhật:** 07/2026&#10;**Nguồn:** Vietcombank"
                      className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono resize-none" />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Key: <code className="bg-gray-100 px-1 rounded">{formKey || "(chưa có)"}</code> •
                    Category: <code className="bg-gray-100 px-1 rounded">{activeCat}</code>
                  </p>
                </div>
              ) : selected ? (
                <div className="p-5 max-w-3xl">
                  <div className="mb-3 flex items-center gap-2">
                    <code className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 px-2 py-0.5 rounded">{selected.key}</code>
                    <span className="text-[10px] text-gray-300">• {fmtDate(selected.updated_at)}</span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selected.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
