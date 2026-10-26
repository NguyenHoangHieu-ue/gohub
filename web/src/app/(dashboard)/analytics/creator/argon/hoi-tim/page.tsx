"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown, Cpu, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit, type Run } from "../argon-types"
import type { MissionDetail } from "../missions/mission-types"
import { MissionChat } from "../missions/mission-chat"
import { Workbench } from "../missions/workbench"
import { useMissionRunner } from "../missions/use-mission-runner"
import { routeQuestion, type RouteDecision } from "@/lib/assistant/route-pure"
import { ENTITY_KINDS } from "@/lib/argon/graph-pure"
import type { SearchResult } from "@/lib/assistant/search"

// Hỏi: MỘT ô cho cả hỏi và tìm. Gõ → Kho gợi ý ngay phía trên ô nhắn (sự việc, thực thể, đoạn tài liệu/mail — không tốn lượt model); Ctrl+Enter → Argon trả lời (chat đầy đủ, có lịch sử). Câu cần THAO TÁC (tạo task, gửi tin…) → gợi ý mở Gấu Pro.
// MỘT khung chat nắm được mọi "cửa sổ" của Phòng Argon (Kho, sổ sự việc, bối cảnh và kế hoạch, số liệu hệ thống). Chạy trên sứ mệnh "Tham mưu hằng ngày"
// (đọc toàn Kho, có công cụ xếp thư mục/ghi sổ/sql/chạy code). Ghi vào Kho và sổ thì làm luôn rồi báo; việc gửi tin ra ngoài hoặc ghi DB production thì hỏi anh.
const QUICK = [
  "Mail nào đang chờ tôi trả lời?",
  "Hôm nay có gì cần anh quyết?",
  "Tuần này vendor nào có thay đổi đáng chú ý?",
  "Gom các báo giá Thái Lan trong Kho và so sánh",
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
  // Gợi ý từ Kho khi đang gõ: chờ 0,9s sau lần gõ cuối, ≥4 ký tự, huỷ lượt cũ; lỗi thì im lặng (chỉ là gợi ý).
  const [draft, setDraft] = useState("")
  const [found, setFound] = useState<(SearchResult & { route: RouteDecision }) | null>(null)
  const [searching, setSearching] = useState(false)
  const [dismissed, setDismissed] = useState("")
  useEffect(() => {
    const q = draft.trim()
    if (q.length < 4) { setFound(null); setSearching(false); return }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/creator/assistant/search?q=${encodeURIComponent(q)}`, { signal: ac.signal, cache: "no-store" })
        if (r.ok) setFound(await r.json())
      } catch { /* bị huỷ hoặc lỗi mạng: bỏ qua */ } finally { if (!ac.signal.aborted) setSearching(false) }
    }, 900)
    return () => { clearTimeout(t); ac.abort() }
  }, [draft])
  const [runs, setRuns] = useState<Run[]>([])
  const [showBench, setShowBench] = useState(false)
  const [focus, setFocus] = useState<{ id: string; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const busyRef = useRef(false)
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.argon_enabled === true ? "creator" : (d?.role ?? session?.user?.role ?? "staff"))).catch(() => setRole(session?.user?.role ?? "staff"))
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
              <MissionChat simple quick={QUICK} autoSend={auto} onDraft={setDraft} aboveInput={<KhoHints draft={draft} found={found} searching={searching} dismissed={dismissed} onDismiss={() => setDismissed(draft.trim())} />} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []}
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

/** Gợi ý từ Kho ngay trên ô nhắn: gọn (tối đa ~6 dòng), tắt được, và nhắc Gấu Pro khi câu có vẻ cần thao tác. */
function KhoHints({ draft, found, searching, dismissed, onDismiss }: { draft: string; found: (SearchResult & { route: RouteDecision }) | null; searching: boolean; dismissed: string; onDismiss: () => void }) {
  const q = draft.trim()
  if (q.length < 4 || dismissed === q) return null
  const route = found?.route ?? routeQuestion(q)
  const hasAny = !!found && (found.facts.length || found.entities.length || found.threads.length || found.chunks.length)
  if (!searching && !hasAny && route.mode !== "gau_pro") return null
  return (
    <div className="mb-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 px-3 py-2 text-[12.5px] space-y-1.5" aria-label="Gợi ý từ Kho">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        {searching ? <><Loader2 size={11} className="animate-spin" />Đang tìm trong Kho…</> : "Có trong Kho"}
        <button type="button" onClick={onDismiss} aria-label="Ẩn gợi ý" className="ml-auto text-gray-400 hover:text-gray-700"><X size={13} /></button>
      </div>
      {found && found.facts.slice(0, 2).map(f => <p key={f.id} className="leading-snug text-gray-700 dark:text-slate-300">{f.line}</p>)}
      {found && found.entities.length > 0 && <div className="flex flex-wrap gap-1.5">{found.entities.slice(0, 4).map(e => <span key={e.id} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700">{e.name}<span className="text-gray-400"> · {ENTITY_KINDS[e.kind]} · {e.mentions} nguồn</span></span>)}</div>}
      {found && found.threads.slice(0, 2).map(t => <p key={t.id} className="leading-snug text-gray-700 dark:text-slate-300">✉ {t.line}</p>)}
      {found && found.chunks.slice(0, 3).map((c, i) => <p key={`${c.sourceId}-${i}`} className="leading-snug text-gray-600 dark:text-slate-400"><b className="font-medium text-gray-800 dark:text-slate-200">{c.sourceName}</b> — {c.text.slice(0, 130)}…</p>)}
      {route.mode === "gau_pro" && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-gray-700 dark:text-slate-300">
          <Cpu size={13} className="text-violet-600" />{route.reason}.
          <Link href={`/analytics/creator/ai?q=${encodeURIComponent(q)}`} className="font-medium text-violet-700 dark:text-violet-300 hover:underline">Mở Gấu Pro với câu này</Link>
        </div>
      )}
    </div>
  )
}
