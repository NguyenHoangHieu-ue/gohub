"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { BearAvatar } from "@/components/brand/bear"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore, ArrowLeft, Atom, Database, Moon, FolderOpen, MessageSquare, Pencil, Target, Trash2, Workflow } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit, type Run } from "../argon-types"
import { PHASE_LABEL, PHASE_PILL, fmtUsd, type MissionDetail, type MissionPhase, type MissionRowUi } from "../missions/mission-types"
import { MissionList } from "../missions/mission-list"
import { WorkspaceTree } from "../missions/workspace-tree"
import { FileViewer } from "../missions/file-viewer"
import { MissionChat } from "../missions/mission-chat"
import { Workbench } from "../missions/workbench"
import { LinkSourcesModal } from "../missions/link-sources-modal"
import { PatrolPanel } from "../missions/patrol-panel"
import { useMissionRunner } from "../missions/use-mission-runner"

// Phòng Argon — Sứ mệnh (plan docs/plans/argon-missions.md). Trái: sứ mệnh + workspace · Giữa: chat (chỉ kết quả) hoặc file · Phải: Bàn làm việc (các bước Argon làm).
type Panel = "left" | "center" | "right"
export default function ArgonMissionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [missions, setMissions] = useState<MissionRowUi[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [selected, setSelected] = useState<string | null>(null)   // file đang mở ở khung giữa; null = chat
  const [reloadKey, setReloadKey] = useState(0)
  const [panel, setPanel] = useState<Panel>("center")
  const [linkOpen, setLinkOpen] = useState(false)
  const [patrolOpen, setPatrolOpen] = useState(false)
  const [autoSend, setAutoSend] = useState<{ text: string; k: number } | null>(null)   // ▶ chạy lại script → câu lệnh tự gửi ở chat
  const [sandbox, setSandbox] = useState<{ cpuMs: number; limitMs: number; snapshot: { at: string } | null } | null>(null)
  const [building, setBuilding] = useState(false)
  const [focus, setFocus] = useState<{ id: string; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const loadSeq = useRef(0)
  const busyRef = useRef(false)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const loadMissions = useCallback(async () => {
    try { const r = await api<{ missions: MissionRowUi[] }>(`/api/creator/argon/missions${showArchived ? "?archived=1" : ""}`); setMissions(r.missions); return r.missions } catch (e) { onError((e as Error).message); return [] }
  }, [showArchived, onError])
  useEffect(() => { if (role === "creator") void loadMissions().then(ms => { if (ms.length && !activeId) setActiveId(ms[0].id) }) }, [role, showArchived]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = useCallback((id: string) => {
    const seq = ++loadSeq.current
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => {
      if (seq !== loadSeq.current) return
      setDetail(r)
      if (!busyRef.current) setRuns(r.runs)   // đang stream thì giữ bản cục bộ (đang nhận chữ)
    }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => {
    setSelected(null); setRuns([])
    if (!activeId) { setDetail(null); return }
    loadDetail(activeId)
  }, [activeId, loadDetail])

  const loadSandbox = useCallback(() => { api<{ cpuMs: number; limitMs: number; snapshot: { at: string } | null }>("/api/creator/argon/sandbox").then(setSandbox).catch(() => { /* đồng hồ phụ: lỗi thì bỏ qua */ }) }, [])
  useEffect(() => { if (role === "creator") loadSandbox() }, [role, loadSandbox])
  const refreshAll = useCallback(() => { if (activeId) loadDetail(activeId); void loadMissions(); loadSandbox() }, [activeId, loadDetail, loadMissions, loadSandbox])
  const runner = useMissionRunner({
    projectId: detail?.mission.project_id ?? null, runs, setRuns, onError,
    onWorkspaceChanged: () => { setReloadKey(k => k + 1); refreshAll() },
    onFinished: refreshAll,
    onPoll: () => { if (activeId) loadDetail(activeId); setReloadKey(k => k + 1) },
  })
  busyRef.current = runner.busy

  async function createMission(name: string, goal: string) {
    try {
      const r = await api<{ mission: MissionRowUi }>("/api/creator/argon/missions", jsonInit("POST", { name, goal }))
      await loadMissions(); setActiveId(r.mission.id); setPanel("center")
    } catch (e) { onError((e as Error).message); throw e }
  }
  async function createFile(path: string) {
    if (!activeId) return
    try { await api(`/api/creator/argon/missions/${activeId}/files`, jsonInit("PUT", { path, content: "" })); loadDetail(activeId); setSelected(path); void loadMissions() } catch (e) { onError((e as Error).message) }
  }
  async function patchMission(patch: Record<string, unknown>) {
    if (!activeId) return
    try { await api(`/api/creator/argon/missions/${activeId}`, jsonInit("PATCH", patch)); refreshAll() } catch (e) { onError((e as Error).message) }
  }
  async function changePhase(to: MissionPhase) {
    if (!activeId) return
    await api(`/api/creator/argon/missions/${activeId}/phase`, jsonInit("POST", { to }))
    refreshAll()
  }
  async function showStep(runId: string, n: number) {
    await runner.loadSteps(runId, true)
    setFocus({ id: `${runId}:${n - 1}`, k: Date.now() }); setPanel("right")
  }
  async function buildSandbox() {
    setBuilding(true)
    try { await api("/api/creator/argon/sandbox", jsonInit("POST", { action: "build" })); loadSandbox() } catch (e) { onError((e as Error).message) } finally { setBuilding(false) }
  }
  function runScript(path: string) {
    if (detail?.mission.phase !== "run") { onError('Chạy lại script chỉ dùng được khi sứ mệnh đang ở pha "Đang chạy" (sau khi Chốt).'); return }
    setSelected(null); setPanel("center")
    setAutoSend({ text: `Chạy lại ${path}: đọc docstring để biết đầu vào; nếu cần dữ liệu mới thì lấy lại bằng sql (saveAs) trước, rồi chạy run_code script="${path}" và báo kết quả ngắn gọn.`, k: Date.now() })
  }
  async function decidePatch(id: string, action: "approve" | "reject") {
    if (!activeId) return
    await api(`/api/creator/argon/missions/${activeId}/patches`, jsonInit("POST", { id, action }))
    refreshAll()
  }
  async function unlink(sourceId: string) {
    if (!activeId) return
    try { await api(`/api/creator/argon/missions/${activeId}/sources?sourceId=${sourceId}`, { method: "DELETE" }); refreshAll() } catch (e) { onError((e as Error).message) }
  }
  async function rename() {
    const n = window.prompt("Tên sứ mệnh", detail?.mission.name ?? "")
    if (n && n.trim()) await patchMission({ name: n.trim() })
  }
  async function remove() {
    if (!detail || !window.confirm(`Xoá hẳn sứ mệnh "${detail.mission.name}" cùng workspace và lịch sử chạy? Không hoàn tác được.`)) return
    try { await api(`/api/creator/argon/missions/${detail.mission.id}`, { method: "DELETE" }); setActiveId(null); const ms = await loadMissions(); if (ms.length) setActiveId(ms[0].id) } catch (e) { onError((e as Error).message) }
  }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const m = detail?.mission
  const tabBtn = (p: Panel, label: string, Icon: typeof Atom) => (
    <button type="button" role="tab" aria-selected={panel === p} onClick={() => setPanel(p)}
      className={cn("flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border", panel === p ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200")}><Icon size={14} />{label}</button>
  )
  const colCls = (p: Panel) => cn("rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex-col min-h-0 min-w-0", panel === p ? "flex" : "hidden", "lg:flex")

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1700px] mx-auto">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <BearAvatar size={40} className="!rounded-2xl" />
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Phòng Tham mưu</h1>
          <div className="text-xs text-gray-500 truncate">Giao Argon một sứ mệnh dài hạn: hỏi cho rõ, anh Chốt rồi Argon mới làm</div>
        </div>
        <Link href="/analytics/creator/argon" className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"><ArrowLeft size={14} />Về Argon</Link>
        <Link href="/analytics/creator/argon/kho-nguon" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"><Database size={14} />Kho nguồn</Link>
      </div>
      {err && <div className="mx-4 mb-2 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">✕</button></div>}
      <div className="lg:hidden flex gap-2 px-4 pb-2" role="tablist">{tabBtn("left", "Sứ mệnh", FolderOpen)}{tabBtn("center", "Chat", MessageSquare)}{tabBtn("right", "Bàn làm việc", Workflow)}</div>

      <div className="flex-1 min-h-0 grid gap-3 px-4 pb-4 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
        <aside className={colCls("left")} aria-label="Sứ mệnh và workspace">
          <div className="flex-1 overflow-y-auto">
            <MissionList missions={missions} activeId={activeId} onSelect={id => { setActiveId(id); setPanel("center") }} onCreate={createMission} showArchived={showArchived} setShowArchived={setShowArchived} />
            {detail && <div className="border-t border-gray-200 dark:border-slate-700 mt-1 pt-3 pb-3 px-1">
              <WorkspaceTree tree={detail.tree} selected={selected} linked={detail.sources.map(s => ({ id: s.id, name: s.name }))} onSelect={p => { setSelected(p); setPanel("center") }} onCreate={createFile} onManageSources={() => setLinkOpen(true)} onUnlink={unlink} onRunScript={runScript} />
            </div>}
          </div>
        </aside>

        <main className={cn(colCls("center"), "bg-gray-50/50 dark:bg-slate-900")}>
          {!m || !detail ? <div className="m-auto text-sm text-gray-400 px-6 text-center">Chọn hoặc tạo một sứ mệnh.</div> : <>
            <div className="px-4 pt-3 pb-2.5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 truncate text-[15px] font-semibold text-gray-900 dark:text-slate-100">{m.name}</h2>
                <button type="button" onClick={rename} title="Đổi tên" aria-label="Đổi tên sứ mệnh" className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><Pencil size={13} /></button>
                <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium", PHASE_PILL[m.phase])}>{PHASE_LABEL[m.phase]}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setPatrolOpen(true)} title="Tuần tra đêm: Argon tự chạy nền mỗi đêm và chấm sổ dự đoán" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-slate-300 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700"><Moon size={14} /><span className="hidden xl:inline">Tuần tra đêm</span></button>
                  <button type="button" onClick={() => patchMission({ archived: !m.archived })} title={m.archived ? "Bỏ lưu trữ" : "Lưu trữ"} aria-label={m.archived ? "Bỏ lưu trữ" : "Lưu trữ"} className="p-1.5 text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700">{m.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                  <button type="button" onClick={remove} title="Xoá hẳn" aria-label="Xoá hẳn sứ mệnh" className="p-1.5 text-gray-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600"><Trash2 size={15} /></button>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-gray-500">
                <span>{detail.files.length} file</span><span>{detail.sources.length} nguồn gắn</span><span>{runs.length} lượt chạy</span><span title="Chi phí token Gemini (chỉ để xem, không giới hạn)">{fmtUsd(detail.spent_usd)}</span>
              </div>
              {m.goal && <div className="mt-2 flex items-start gap-2 rounded-xl bg-gray-50 dark:bg-slate-900/50 px-3 py-2 text-[12.5px] leading-relaxed text-gray-700 dark:text-slate-300"><Target size={14} className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-300" /><span className="line-clamp-2" title={m.goal}>{m.goal}</span></div>}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {selected ? <>
                <button type="button" onClick={() => setSelected(null)} className="self-start m-2 inline-flex items-center gap-1 text-xs text-violet-700 dark:text-violet-300 hover:underline"><ArrowLeft size={12} />Về chat</button>
                <div className="flex-1 min-h-0">
                  <FileViewer missionId={m.id} path={selected} reloadKey={reloadKey} onSaved={refreshAll} onDeleted={() => { setSelected(null); refreshAll() }} onError={onError} />
                </div>
              </> : (
                <MissionChat autoSend={autoSend} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []} onPatch={decidePatch} runs={runs} runner={runner} onPhase={changePhase} onStep={(id, n) => void showStep(id, n)} onError={onError} />
              )}
            </div>
          </>}
        </main>

        <aside className={colCls("right")} aria-label="Bàn làm việc">
          <Workbench steps={runner.steps} busy={runner.busy} bgActive={runner.bgActive} spentUsd={detail?.spent_usd ?? 0} runCount={runs.length} focus={focus} sandbox={sandbox} building={building} onBuild={() => void buildSandbox()}
            onStop={runner.stop} onOpenFile={p => { setSelected(p); setPanel("center") }} onLoadFull={id => void runner.loadSteps(id, true)} />
        </aside>
      </div>
      {patrolOpen && m && <PatrolPanel missionId={m.id} phase={m.phase} onClose={() => setPatrolOpen(false)} onStarted={refreshAll} onError={onError} />}
      {linkOpen && m && <LinkSourcesModal missionId={m.id} onClose={() => setLinkOpen(false)} onChanged={refreshAll} onError={onError} />}
    </div>
  )
}
