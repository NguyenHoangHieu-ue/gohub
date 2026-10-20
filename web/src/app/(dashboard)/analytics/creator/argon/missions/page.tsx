"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore, Atom, FolderOpen, MessageSquare, Pencil, Trash2, Workflow } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "../argon-types"
import { BRIEF, PHASE_LABEL, PHASE_PILL, fmtUsd, type MissionDetail, type MissionRowUi } from "./mission-types"
import { MissionList } from "./mission-list"
import { WorkspaceTree } from "./workspace-tree"
import { FileViewer } from "./file-viewer"

// Phòng Argon — Sứ mệnh (plan docs/plans/argon-missions.md, commit 4: khung + workspace). Chat theo sứ mệnh, thanh pha/Chốt và Bàn làm việc đến ở commit 5.
type Panel = "left" | "center" | "right"
export default function ArgonMissionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [missions, setMissions] = useState<MissionRowUi[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reloadKey] = useState(0)   // commit 5: Bàn làm việc tăng số này khi Argon vừa ghi file
  const [panel, setPanel] = useState<Panel>("center")
  const [err, setErr] = useState<string | null>(null)
  const loadSeq = useRef(0)
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
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => { if (seq === loadSeq.current) setDetail(r) }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => {
    if (!activeId) { setDetail(null); setSelected(null); return }
    setSelected(BRIEF)
    loadDetail(activeId)
  }, [activeId, loadDetail])

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
    try { await api(`/api/creator/argon/missions/${activeId}`, jsonInit("PATCH", patch)); loadDetail(activeId); void loadMissions() } catch (e) { onError((e as Error).message) }
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
  const colCls = (p: Panel) => cn("rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-col min-h-0 min-w-0", panel === p ? "flex" : "hidden", "lg:flex")

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1700px] mx-auto">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0"><Atom size={18} /></div>
        <div className="min-w-0">
          <h1 className="font-semibold text-gray-900 dark:text-slate-100 leading-tight">Phòng Tham mưu · Argon</h1>
          <div className="text-xs text-gray-500 truncate">Sứ mệnh dài hạn · hỏi cho rõ, Hiếu Chốt rồi Argon mới làm · bản đang dựng (commit 4: workspace)</div>
        </div>
      </div>
      {err && <div className="mx-4 mb-2 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">✕</button></div>}
      <div className="lg:hidden flex gap-2 px-4 pb-2" role="tablist">{tabBtn("left", "Sứ mệnh", FolderOpen)}{tabBtn("center", "Chat", MessageSquare)}{tabBtn("right", "Bàn làm việc", Workflow)}</div>

      <div className="flex-1 min-h-0 grid gap-3 px-4 pb-4 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
        <aside className={colCls("left")} aria-label="Sứ mệnh và workspace">
          <div className="flex-1 overflow-y-auto">
            <MissionList missions={missions} activeId={activeId} onSelect={id => { setActiveId(id); setPanel("center") }} onCreate={createMission} showArchived={showArchived} setShowArchived={setShowArchived} />
            {detail && <div className="border-t border-gray-200 dark:border-slate-700 mt-1 pt-2 pb-3">
              <WorkspaceTree tree={detail.tree} selected={selected} linked={detail.sources.map(s => ({ id: s.id, name: s.name }))} onSelect={p => { setSelected(p); setPanel("center") }} onCreate={createFile} />
            </div>}
          </div>
        </aside>

        <main className={cn(colCls("center"), "bg-gray-50/50 dark:bg-slate-900")}>
          {!m ? <div className="m-auto text-sm text-gray-400 px-6 text-center">Chọn hoặc tạo một sứ mệnh.</div> : <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-xl">
              <div className="font-semibold truncate">{m.name}</div>
              <button type="button" onClick={rename} title="Đổi tên" className="text-gray-400 hover:text-gray-700"><Pencil size={13} /></button>
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full", PHASE_PILL[m.phase])}>{PHASE_LABEL[m.phase]}</span>
              <span className="text-xs text-gray-500">Đã dùng {fmtUsd(detail.spent_usd)} · {detail.runs.length} lượt chạy</span>
              <span className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => patchMission({ archived: !m.archived })} title={m.archived ? "Bỏ lưu trữ" : "Lưu trữ"} className="p-1.5 text-gray-400 hover:text-gray-700">{m.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                <button type="button" onClick={remove} title="Xoá hẳn" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </span>
            </div>
            {m.goal && <div className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 border-b border-gray-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60"><span className="text-xs text-gray-500">Mục tiêu: </span>{m.goal}</div>}
            <div className="flex-1 min-h-0">
              {selected
                ? <FileViewer missionId={m.id} path={selected} reloadKey={reloadKey} onSaved={() => { loadDetail(m.id); void loadMissions() }} onDeleted={() => { setSelected(BRIEF); loadDetail(m.id); void loadMissions() }} onError={onError} />
                : <div className="p-6 text-sm text-gray-400">Chọn một file ở cột trái.</div>}
            </div>
          </>}
        </main>

        <aside className={colCls("right")} aria-label="Bàn làm việc">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-gray-500">Bàn làm việc</div>
          <div className="p-4 text-sm text-gray-500 space-y-2">
            <p>Các bước Argon làm (đọc file, ghi file, lấy số liệu) sẽ hiện ở đây theo thời gian thực cùng thanh chat và nút Chốt.</p>
            <p className="text-xs text-gray-400">Đang dựng ở commit 5. Hiện tại workspace đã dùng được: tạo, xem, sửa file; Argon đã đọc/ghi được qua API.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
