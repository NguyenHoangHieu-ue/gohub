"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Database } from "lucide-react"
import { api, jsonInit, type Run, type Source } from "../argon-types"
import type { FolderRow, KhoSource } from "@/lib/argon/kho-pure"
import type { MissionDetail } from "../missions/mission-types"
import { MissionChat } from "../missions/mission-chat"
import { useMissionRunner } from "../missions/use-mission-runner"
import { SourceViewer } from "../source-viewer"
import { KhoTree, type TreeSel } from "./kho-tree"
import { KhoInbox } from "./kho-inbox"
import type { FactRow } from "@/lib/argon/facts-pure"

// Kho nguồn của Phòng Argon: trái = "drive" (thư mục/file), giữa = chat với Thủ thư Kho (tìm, tổng hợp, so sánh, đánh giá, xếp tài liệu),
// phải = kéo thả file + tóm tắt nhanh file vừa nạp. Chat chạy trên sứ mệnh "Thủ thư Kho" (đọc MỌI nguồn của Kho bằng tìm kiếm ý nghĩa).
const QUICK = ["Tóm tắt các tài liệu mới nạp gần đây", "So sánh các báo giá vendor trong Kho", "Xếp các nguồn Chưa phân loại vào thư mục phù hợp", "Tài liệu nào có ngày hết hạn sắp tới?"]
interface KhoData { projectId: string; missionId: string; missionProjectId: string; folders: FolderRow[]; sources: KhoSource[] }

const toSource = (k: KhoSource): Source => ({
  id: k.id, project_id: k.project_id, kind: k.kind as Source["kind"], name: k.name, mime: k.mime, size_bytes: k.size_bytes, send_binary: false, tokens: k.tokens,
  external_url: null, sync_mode: null, synced_at: null, enabled: k.enabled, pinned: k.pinned, version: 1, meta: {}, created_at: k.created_at, updated_at: k.updated_at,
})

export default function KhoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [data, setData] = useState<KhoData | null>(null)
  const [facts, setFacts] = useState<{ rows: FactRow[]; today: string }>({ rows: [], today: new Date().toISOString().slice(0, 10) })
  const [sel, setSel] = useState<TreeSel>({ kind: "all" })
  const [viewing, setViewing] = useState<Source | null>(null)
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [autoSend, setAutoSend] = useState<{ text: string; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const busyRef = useRef(false)
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const reload = useCallback(async () => {
    try {
      const [k, f] = await Promise.all([api<KhoData>("/api/creator/argon/kho"), api<{ facts: FactRow[]; today: string }>("/api/creator/argon/facts").catch(() => null)])
      setData(k)
      if (f) setFacts({ rows: f.facts, today: f.today })
    } catch (e) { onError((e as Error).message) }
  }, [onError])
  useEffect(() => { if (role === "creator") void reload() }, [role, reload])

  const loadDetail = useCallback((id: string) => {
    const seq = ++loadSeq.current
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => {
      if (seq !== loadSeq.current) return
      setDetail(r)
      if (!busyRef.current) setRuns(r.runs)
    }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => { if (data?.missionId) loadDetail(data.missionId) }, [data?.missionId, loadDetail])

  const refreshAll = useCallback(() => { void reload(); if (data?.missionId) loadDetail(data.missionId) }, [reload, data?.missionId, loadDetail])
  const runner = useMissionRunner({ projectId: detail?.mission.project_id ?? null, runs, setRuns, onError, onWorkspaceChanged: refreshAll, onFinished: refreshAll, onPoll: refreshAll })
  busyRef.current = runner.busy

  async function move(ids: string[], folderId: string | null) {
    setData(d => (d ? { ...d, sources: d.sources.map(s => (ids.includes(s.id) ? { ...s, folder_id: folderId } : s)) } : d))   // cập nhật ngay, rồi đồng bộ lại
    try { await api("/api/creator/argon/kho", jsonInit("POST", { action: "move", ids, folderId })) } catch (e) { onError((e as Error).message) }
    await reload()
  }
  async function folderAction(a: { type: "create"; path: string } | { type: "rename"; id: string; name: string } | { type: "delete"; id: string }) {
    try {
      const body = a.type === "create" ? { action: "folder-create", path: a.path } : a.type === "rename" ? { action: "folder-rename", id: a.id, name: a.name } : { action: "folder-delete", id: a.id }
      await api("/api/creator/argon/kho", jsonInit("POST", body))
      if (a.type === "delete" && sel.kind === "folder" && sel.id === a.id) setSel({ kind: "all" })
    } catch (e) { onError((e as Error).message) }
    await reload()
  }
  async function pin(s: KhoSource) {
    setData(d => (d ? { ...d, sources: d.sources.map(x => (x.id === s.id ? { ...x, pinned: !s.pinned } : x)) } : d))
    try { await api(`/api/creator/argon/sources/${s.id}`, jsonInit("PATCH", { pinned: !s.pinned })) } catch (e) { onError((e as Error).message); await reload() }
  }
  async function remove(s: KhoSource) {
    if (!confirm(`Xoá "${s.name}" khỏi Kho? Không khôi phục được.`)) return
    try { await api(`/api/creator/argon/sources/${s.id}`, { method: "DELETE" }) } catch (e) { onError((e as Error).message) }
    await reload()
  }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const m = detail?.mission
  const targetFolder = sel.kind === "folder" ? sel.id : null

  return (
    <div className="flex flex-col max-w-[1600px] mx-auto px-4 py-4 gap-3 lg:h-[calc(100vh-4rem)]">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-sm"><Database size={20} /></div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Kho</h1>
          <p className="text-[13px] text-gray-500">Nạp tài liệu, hỏi Argon tìm / so sánh / đánh giá, tự sắp xếp thư mục</p>
        </div>
        
      </header>
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}

      <div className="flex-1 min-h-0 grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)_330px]">
        <aside className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden min-h-[320px] max-h-[60vh] lg:max-h-none" aria-label="Thư mục và file">
          {data ? <KhoTree folders={data.folders} sources={data.sources} sel={sel} setSel={setSel} onOpen={k => setViewing(toSource(k))} onMove={move} onFolder={folderAction} onPin={pin} onRemove={remove} onAsk={t => setAutoSend({ text: t, k: Date.now() })} />
            : <div className="p-4 text-sm text-gray-400">Đang tải Kho…</div>}
        </aside>

        <section className="order-first lg:order-none rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[60vh] min-w-0" aria-label="Hỏi Thủ thư Kho">
          {!m || !detail ? <div className="m-auto text-sm text-gray-400">Đang chuẩn bị Thủ thư Kho…</div> : (
            <MissionChat simple quick={QUICK} autoSend={autoSend} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []}
              onPatch={async (id, action) => { await api(`/api/creator/argon/missions/${m.id}/patches`, jsonInit("POST", { id, action })); refreshAll() }}
              runs={runs} runner={runner} onPhase={async to => { await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to })); refreshAll() }}
              onStep={async (runId) => { await runner.loadSteps(runId, true) }} onError={onError} />
          )}
        </section>

        <aside className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden min-h-[320px]" aria-label="Nạp tài liệu">
          {data ? <KhoInbox projectId={data.projectId} folders={data.folders} sources={data.sources} facts={facts.rows} today={facts.today} targetFolderId={targetFolder} onChanged={reload} onMove={move} onOpen={k => setViewing(toSource(k))} onError={onError} />
            : <div className="p-4 text-sm text-gray-400">Đang tải…</div>}
        </aside>
      </div>

      {viewing && <SourceViewer source={viewing} onClose={() => setViewing(null)} onChanged={() => void reload()} onError={onError} />}
    </div>
  )
}
