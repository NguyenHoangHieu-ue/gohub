"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Atom, Plus, Trash2, ChevronDown, ChevronRight, Save, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { SourcesPanel } from "./sources-panel"
import { SourceViewer } from "./source-viewer"
import { ChatPanel } from "./chat-panel"
import { api, jsonInit, fmtTokens, type Project, type ProjectRow, type Run, type Source } from "./argon-types"

// Phòng Argon — CHỈ Creator. Kho tài liệu + trợ lý Gemini 4 Argon nạp nguyên tài liệu vào ngữ cảnh (plan docs/plans/argon-room.md).
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
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

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
  }, [activeId, loadDetail])

  async function createProject() {
    const name = prompt("Tên dự án mới?")?.trim()
    if (!name) return
    try {
      const r = await api<{ project: Project }>("/api/creator/argon/projects", jsonInit("POST", { name }))
      await loadProjects(); setActiveId(r.project.id)
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center"><Atom size={18} /></div>
        <div>
          <h1 className="font-semibold text-gray-900 dark:text-slate-100 leading-tight">Phòng Argon</h1>
          <div className="text-xs text-gray-500">Gemini 4 Argon · nạp nguyên tài liệu (ngữ cảnh 1M token) · chỉ đọc, không ghi dữ liệu hệ thống</div>
        </div>
      </div>
      {err && <div className="mx-4 mb-2 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button onClick={() => setErr(null)}>✕</button></div>}

      <div className="flex-1 min-h-0 grid gap-3 px-4 pb-4 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col min-h-0">
          <div className="p-2 border-b border-gray-200 dark:border-slate-700"><button onClick={createProject} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg"><Plus size={14} />Dự án mới</button></div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {projects.length === 0 && <div className="text-xs text-gray-400 text-center py-6">Chưa có dự án.</div>}
            {projects.map(p => (
              <button key={p.id} onClick={() => setActiveId(p.id)} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm", p.id === activeId ? "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200" : "hover:bg-gray-50 dark:hover:bg-slate-700")}>
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-[11px] text-gray-500">{p.sources} nguồn · {fmtTokens(p.tokens)} token</div>
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
              </div>
            )}
            <div className="flex-1 min-h-0">
              <ChatPanel projectId={project.id} runs={runs} setRuns={fn => setRuns(fn)} enabledCount={enabled.length} onAppendNotes={appendNotes} onSaveAsSource={saveAsSource} onError={onError} />
            </div>
          </>}
        </main>

        <aside className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-0 hidden lg:block">
          {project && <SourcesPanel projectId={project.id} sources={sources} setSources={fn => { setSources(fn); void loadProjects() }} onOpen={setViewing} onError={onError} onReload={() => activeId && loadDetail(activeId, true)} />}
        </aside>
      </div>

      {project && <div className="lg:hidden px-4 pb-4"><div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 h-[60vh]"><SourcesPanel projectId={project.id} sources={sources} setSources={fn => { setSources(fn); void loadProjects() }} onOpen={setViewing} onError={onError} onReload={() => activeId && loadDetail(activeId, true)} /></div></div>}
      {viewing && <SourceViewer source={viewing} onClose={() => setViewing(null)} onChanged={s => setSources(prev => prev.map(x => (x.id === s.id ? s : x)))} onError={onError} />}
    </div>
  )
}
