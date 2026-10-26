"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit, type Run } from "../argon-types"
import type { MissionDetail } from "../missions/mission-types"
import { MissionChat } from "../missions/mission-chat"
import { Workbench } from "../missions/workbench"
import { useMissionRunner } from "../missions/use-mission-runner"

// Trợ lý: MỘT khung chat nắm được mọi "cửa sổ" của Phòng Argon (Kho, sổ sự việc, bối cảnh và kế hoạch, số liệu hệ thống). Chạy trên sứ mệnh "Tham mưu hằng ngày"
// (đọc toàn Kho, có công cụ xếp thư mục/ghi sổ/sql/chạy code). Ghi vào Kho và sổ thì làm luôn rồi báo; việc gửi tin ra ngoài hoặc ghi DB production thì hỏi anh.
const QUICK = [
  "Hôm nay có gì cần anh quyết?",
  "Tuần này vendor nào có thay đổi đáng chú ý?",
  "Gom các báo giá Thái Lan trong Kho và so sánh",
  "Đặt nhắc: hỏi VNPT về báo giá trước 05/11",
  "So với kế hoạch của anh, chỗ nào đang chậm?",
]

export default function TroLyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [auto, setAuto] = useState<{ text: string; k: number } | null>(null)
  // Từ ô Hỏi / Tìm: ?q=… → tự gửi câu đó (anh đã bấm "Hỏi Argon"; Argon ở đây không thao tác ngoài Kho).
  useEffect(() => { const q = new URLSearchParams(window.location.search).get("q"); if (q?.trim()) setAuto({ text: q.trim().slice(0, 2000), k: 1 }) }, [])
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [showBench, setShowBench] = useState(false)
  const [focus, setFocus] = useState<{ id: string; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const busyRef = useRef(false)
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])
  useEffect(() => {
    if (role !== "creator") return
    api<{ missionId: string }>("/api/creator/argon/context").then(r => setMissionId(r.missionId)).catch(e => onError(e.message))
  }, [role, onError])

  const loadDetail = useCallback((id: string) => {
    const seq = ++loadSeq.current
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => { if (seq !== loadSeq.current) return; setDetail(r); if (!busyRef.current) setRuns(r.runs) }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])
  const refresh = useCallback(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])
  const runner = useMissionRunner({ projectId: detail?.mission.project_id ?? null, runs, setRuns, onError, onWorkspaceChanged: refresh, onFinished: refresh, onPoll: refresh })
  busyRef.current = runner.busy

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const m = detail?.mission

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-4 flex flex-col gap-3 lg:h-[calc(100vh-7rem)]">
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
      <section className="flex-1 min-h-[60vh] rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col" aria-label="Trợ lý Argon">
        {!m || !detail ? <div className="m-auto text-sm text-gray-400">Đang chuẩn bị trợ lý…</div> : (
          <>
            <div className="flex-1 min-h-0">
              <MissionChat simple quick={QUICK} autoSend={auto} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []}
                onPatch={async (id, action) => { await api(`/api/creator/argon/missions/${m.id}/patches`, jsonInit("POST", { id, action })); refresh() }}
                runs={runs} runner={runner} onPhase={async to => { await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to })); refresh() }}
                onStep={async (runId, n) => { await runner.loadSteps(runId, true); setFocus({ id: `${runId}:${n - 1}`, k: Date.now() }); setShowBench(true) }} onError={onError} />
            </div>
            <div className="border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={() => setShowBench(v => !v)} aria-expanded={showBench} className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-gray-600 dark:text-slate-300">
                Argon đang làm gì ({runner.steps.length} bước){runner.busy && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                <ChevronDown size={14} className={cn("ml-auto transition-transform", showBench && "rotate-180")} />
              </button>
              {showBench && (
                <div className="h-64 border-t border-gray-100 dark:border-slate-700">
                  <Workbench steps={runner.steps} busy={runner.busy} bgActive={runner.bgActive} spentUsd={detail.spent_usd ?? 0} runCount={runs.length} focus={focus} sandbox={null} building={false} onBuild={() => {}}
                    onStop={runner.stop} onOpenFile={() => {}} onLoadFull={id => void runner.loadSteps(id, true)} />
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
