"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { BearAvatar } from "@/components/brand/bear"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Atom, ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Save, Pencil, Mail, MessagesSquare, FolderPlus, Moon, Play, LayoutDashboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { SourcesPanel } from "../../sources-panel"
import { SourceViewer } from "../../source-viewer"
import { ChatPanel } from "../../chat-panel"
import { api, jsonInit, fmtTokens, type AutorunUi, type Project, type ProjectRow, type ReportMetaUi, type Run, type Source } from "../../argon-types"
import { ReportsModal } from "../../reports-modal"
import { TEMPLATES, quickPromptsFor, type TemplateId } from "@/lib/argon/templates"

// Phòng Argon — CHỈ Creator. Kho tài liệu + trợ lý Gemini 4 Argon nạp nguyên tài liệu vào ngữ cảnh (wiki creator-argon-room.md).
export default function ArgonRoomPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [viewing, setViewing] = useState<Source | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [notes, setNotes] = useState(""), [instr, setInstr] = useState(""), [metaDirty, setMetaDirty] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [autorun, setAutorun] = useState<AutorunUi>({ enabled: false, prompt: "", thinking: "medium" })
  const [autoDirty, setAutoDirty] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [reports, setReports] = useState<ReportMetaUi[]>([])
  const [reportsOpen, setReportsOpen] = useState(false)
  const [pendingTpl, setPendingTpl] = useState<ReportMetaUi | null>(null)
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const loadReports = useCallback(() => { api<{ reports: ReportMetaUi[] }>("/api/creator/argon/reports").then(r => setReports(r.reports)).catch(() => { /* kho lỗi không chặn trang */ }) }, [])
  useEffect(() => { if (role === "creator") loadReports() }, [role, loadReports])
  // Có lượt vừa xong (câu trả lời đổi) → kho có thể có report mới: tải lại khi số lượt hoàn tất thay đổi.
  const doneRuns = runs.filter(r => r.status === "done" || r.status === "partial").length
  useEffect(() => { if (role === "creator" && doneRuns) loadReports() }, [doneRuns, role, loadReports])

  const loadProjects = useCallback(async () => {
    try { const r = await api<{ projects: ProjectRow[] }>("/api/creator/argon/projects"); setProjects(r.projects); return r.projects } catch (e) { onError((e as Error).message); return [] }
  }, [onError])

  useEffect(() => { if (role === "creator") void loadProjects().then(ps => { if (ps.length && !activeId) setActiveId(ps[0].id) }) }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = useCallback((id: string, keepMeta = false) => {
    const seq = ++loadSeq.current
    api<{ project: Project; sources: Source[]; runs: Run[] }>(`/api/creator/argon/projects/${id}`).then(r => {
      if (seq !== loadSeq.current) return
      setProject(r.project); setSources(r.sources); setRuns(r.runs)
      if (!keepMeta) { setNotes(r.project.notes); setInstr(r.project.instructions); setMetaDirty(false) }
    }).catch(e => onError(e.message))
  }, [onError])

  useEffect(() => {
    if (!activeId) { setProject(null); setSources([]); setRuns([]); return }
    loadDetail(activeId)
    setAutoDirty(false)
    api<{ autorun: AutorunUi }>(`/api/creator/argon/projects/${activeId}/autorun`).then(r => setAutorun(r.autorun)).catch(() => setAutorun({ enabled: false, prompt: "", thinking: "medium" }))
  }, [activeId, loadDetail])

  async function saveAutorun(next: AutorunUi = autorun) {
    if (!project) return
    try { const r = await api<{ autorun: AutorunUi }>(`/api/creator/argon/projects/${project.id}/autorun`, jsonInit("PUT", next)); setAutorun(r.autorun); setAutoDirty(false) } catch (e) { onError((e as Error).message) }
  }
  async function runAutorunNow() {
    if (!project) return
    try {
      if (autoDirty) await saveAutorun()
      await api(`/api/creator/argon/projects/${project.id}/autorun`, jsonInit("POST", {}))
      setInfo("Đã giao Argon chạy nền — xong sẽ nhắn Lark; kết quả hiện trong khung chat.")
      loadDetail(project.id, true)
    } catch (e) { onError((e as Error).message) }
  }

  async function createProject(template?: TemplateId) {
    setNewOpen(false)
    const tpl = TEMPLATES.find(t => t.id === template)
    const name = prompt(tpl ? `Tên dự án (mẫu "${tpl.label}")` : "Tên dự án mới?", tpl?.name)?.trim()
    if (!name) return
    try {
      const r = await api<{ project: Project }>("/api/creator/argon/projects", jsonInit("POST", { name, template }))
      await loadProjects(); setActiveId(r.project.id)
      if (tpl) { setMetaOpen(true); setInfo(tpl.id === "mail" ? "Đã tạo dự án mẫu. Bước tiếp: ở cột phải bấm “Mail Lark” → chọn thư mục/người gửi → Lưu & nạp mail; rồi bật “Tự chạy hằng đêm” ở Sổ dự án." : "Đã tạo dự án mẫu. Bước tiếp: ở cột phải bấm “Thread Lark” → chọn group → Lưu & nạp thread; rồi bật “Tự chạy hằng đêm” ở Sổ dự án.") }
    } catch (e) { onError((e as Error).message) }
  }
  async function renameProject() {
    const name = prompt("Đổi tên dự án", project?.name)?.trim()
    if (!name || !project) return
    try { const r = await api<{ project: Project }>(`/api/creator/argon/projects/${project.id}`, jsonInit("PATCH", { name })); setProject(r.project); void loadProjects() } catch (e) { onError((e as Error).message) }
  }
  async function deleteProject() {
    if (!project || !confirm(`Xoá dự án "${project.name}" cùng toàn bộ nguồn, file và lịch sử?`)) return
    try { await api(`/api/creator/argon/projects/${project.id}`, { method: "DELETE" }); const ps = await loadProjects(); setActiveId(ps[0]?.id ?? null) } catch (e) { onError((e as Error).message) }
  }
  async function saveMeta(nextNotes = notes) {
    if (!project) return
    try {
      const r = await api<{ project: Project }>(`/api/creator/argon/projects/${project.id}`, jsonInit("PATCH", { notes: nextNotes, instructions: instr }))
      setProject(r.project); setNotes(r.project.notes); setMetaDirty(false)
    } catch (e) { onError((e as Error).message) }
  }
  async function appendNotes(text: string) {
    const next = `${notes.trim()}${notes.trim() ? "\n\n" : ""}${text}`
    setNotes(next); setMetaOpen(true); await saveMeta(next)
  }
  async function saveAsSource(name: string, text: string) {
    if (!project) return
    try { const r = await api<{ sources: Source[] }>(`/api/creator/argon/projects/${project.id}/sources`, jsonInit("POST", { action: "note", name: `Argon: ${name}`, text })); setSources(prev => [...prev, ...r.sources]) } catch (e) { onError((e as Error).message) }
  }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const enabled = sources.filter(s => s.enabled)
  const quickPrompts = quickPromptsFor({ mail: sources.some(s => s.kind === "mail"), threads: sources.some(s => !!s.meta?.larkThread && s.kind === "note") })

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 px-4 py-3">
        <BearAvatar size={36} />
        <div>
          <h1 className="font-semibold text-gray-900 dark:text-slate-100 leading-tight">Nguồn tự động</h1>
          <div className="text-xs text-gray-500">Gắn Lark, mail, thread, gói số liệu để Argon tự đọc mỗi đêm. Nạp file lẻ và xem sổ sự việc: trang Kho.</div>
        </div>
        <Link href="/analytics/creator/argon/kho-nguon" className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg"><ArrowLeft size={14} />Về Kho</Link>
        <button onClick={() => setReportsOpen(true)} className=" inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40"><LayoutDashboard size={14} />Kho báo cáo{reports.length ? ` (${reports.length})` : ""}</button>
      </div>
      {info && <div className="mx-4 mb-2 text-sm rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{info}</span><button onClick={() => setInfo(null)}>✕</button></div>}
      {err && <div className="mx-4 mb-2 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button onClick={() => setErr(null)}>✕</button></div>}

      <div className="flex-1 min-h-0 grid gap-3 px-4 pb-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-0">
          <div className="p-2 border-b border-gray-200 dark:border-slate-700 relative">
            <button onClick={() => setNewOpen(v => !v)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg"><Plus size={14} />Dự án mới<ChevronDown size={13} /></button>
            {newOpen && (
              <div className="absolute left-2 right-2 top-full mt-1 z-20 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-1 text-sm">
                <button onClick={() => void createProject()} className="w-full text-left px-2.5 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2"><FolderPlus size={14} className="text-gray-500" />Dự án trống</button>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => void createProject(t.id)} className="w-full text-left px-2.5 py-2 rounded-md hover:bg-violet-50 dark:hover:bg-violet-950/40">
                    <span className="inline-flex items-center gap-2 font-medium">{t.id === "mail" ? <Mail size={14} className="text-violet-600" /> : <MessagesSquare size={14} className="text-violet-600" />}{t.label}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{t.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {projects.length === 0 && <div className="text-xs text-gray-400 text-center py-6">Chưa có dự án.</div>}
            {projects.map(p => (
              <button key={p.id} onClick={() => setActiveId(p.id)} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm", p.id === activeId ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "hover:bg-gray-50 dark:hover:bg-slate-700")}>
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-[11px] text-gray-500">{p.id === activeId && project && !p.hub ? sources.length : p.sources} nguồn · {fmtTokens(p.id === activeId && project && !p.hub ? enabled.reduce((n, x) => n + x.tokens, 0) : p.tokens)} token{p.hub ? " (đọc mọi dự án)" : ""}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900 flex flex-col min-h-0">
          {!project ? <div className="m-auto text-sm text-gray-400">Chọn hoặc tạo một dự án.</div> : <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-xl">
              <div className="font-semibold truncate">{project.name}</div>
              <button onClick={renameProject} className="text-gray-400 hover:text-gray-700"><Pencil size={13} /></button>
              <button onClick={() => setMetaOpen(v => !v)} className="ml-3 inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300 hover:underline">{metaOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Sổ dự án & chỉ dẫn{project.notes ? ` · ${fmtTokens(Math.ceil(project.notes.length / 3))} token` : ""}</button>
              <button onClick={deleteProject} className="ml-auto text-gray-400 hover:text-red-600" title="Xoá dự án"><Trash2 size={15} /></button>
            </div>
            {metaOpen && (
              <div className="grid gap-3 p-3 md:grid-cols-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <label className="text-xs text-gray-500">Sổ dự án (tóm tắt, quyết định, câu hỏi mở — luôn nằm đầu ngữ cảnh)
                  <textarea value={notes} onChange={e => { setNotes(e.target.value); setMetaDirty(true) }} rows={7} className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
                </label>
                <label className="text-xs text-gray-500">Chỉ dẫn riêng cho dự án (văn phong, ràng buộc, định dạng)
                  <textarea value={instr} onChange={e => { setInstr(e.target.value); setMetaDirty(true) }} rows={7} className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
                </label>
                <div className="md:col-span-2"><button onClick={() => saveMeta()} disabled={!metaDirty} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50"><Save size={14} />Lưu</button></div>
                <div className="md:col-span-2 rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 font-medium"><input type="checkbox" checked={autorun.enabled} onChange={e => { const n = { ...autorun, enabled: e.target.checked }; setAutorun(n); void saveAutorun(n) }} className="accent-violet-600" /><Moon size={14} className="text-violet-600" />Tự chạy hằng đêm</label>
                    <span className="text-xs text-gray-500">Sau khi cron đêm nạp mail/thread mới, Argon chạy nền yêu cầu cố định dưới đây (1 lần/ngày) và nhắn kết quả qua Lark. Dùng cache nên rẻ ({autorun.lastRunDate ? `lần gần nhất ${autorun.lastRunDate}` : "chưa chạy lần nào"}).</span>
                  </div>
                  <textarea value={autorun.prompt} onChange={e => { setAutorun(a => ({ ...a, prompt: e.target.value })); setAutoDirty(true) }} rows={3} placeholder="Yêu cầu cố định, vd: Bản tin mail: tóm tắt các luồng thư mới trong 3 ngày gần nhất…" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
                  <div className="flex gap-2">
                    <button onClick={() => void saveAutorun()} disabled={!autoDirty} className="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50"><Save size={13} />Lưu yêu cầu</button>
                    <button onClick={runAutorunNow} disabled={!autorun.prompt.trim()} className="inline-flex items-center gap-1.5 px-3 py-1 text-sm border border-violet-400 text-violet-700 dark:text-violet-300 rounded-lg disabled:opacity-50"><Play size={13} />Chạy thử ngay</button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="min-h-[50vh]">{project && <SourcesPanel projectId={project.id} sources={sources} setSources={fn => { setSources(fn); void loadProjects() }} onOpen={setViewing} onError={onError} onReload={() => activeId && loadDetail(activeId, true)} />}</div>
              <details className="border-t border-gray-200 dark:border-slate-700">
                <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200">Trò chuyện về dự án này &amp; Làm report <span className="font-normal text-xs text-gray-500">(hỏi chung: tab Hỏi)</span></summary>
                <div className="h-[70vh] min-h-0 flex flex-col">
              {projects.find(x => x.id === project.id)?.hub && <div className="mx-4 mt-3 text-xs rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 px-3 py-2">Dự án Tổng hợp tự đọc sổ, nguồn đang bật và vài kết quả gần đây của MỌI dự án khác (vượt 700k token thì bỏ bớt nguồn cũ không ghim). Hỏi chéo ở đây; dự án thường vẫn tách biệt nhau.</div>}
                  <ChatPanel projectId={project.id} runs={runs} setRuns={fn => setRuns(fn)} enabledCount={enabled.length} quickPrompts={quickPrompts} reportTemplates={reports.filter(r => r.template)} pendingTpl={pendingTpl} setPendingTpl={setPendingTpl} onAppendNotes={appendNotes} onSaveAsSource={saveAsSource} onError={onError} />
                </div>
              </details>
            </div>
          </>}
        </main>

      </div>

      {reportsOpen && <ReportsModal reports={reports} activeProject={activeId} onClose={() => setReportsOpen(false)} onChange={loadReports} onError={onError}
        onUseTemplate={r => { setPendingTpl(r); setInfo(`Đã chọn mẫu “${r.title}”. Gõ yêu cầu (hoặc gửi luôn câu gợi ý) ở ô chat để dựng lại với số liệu mới của dự án đang mở.`) }} />}
      {viewing && <SourceViewer source={viewing} onClose={() => setViewing(null)} onChanged={s => setSources(prev => prev.map(x => (x.id === s.id ? s : x)))} onError={onError} />}
    </div>
  )
}
