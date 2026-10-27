"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Brain, Check, Cpu, FileText, Loader2, Radio, Wrench, X } from "lucide-react"
import { MemoryPanel } from "@/components/gau-pro/memory-panel"
import { useChatUpload } from "./use-chat-upload"
const LiveSession = dynamic(() => import("@/components/gau-pro/live-session").then(m => m.LiveSession), { ssr: false })   // giọng nói trực tiếp: chỉ nạp khi mở (nặng)
import { InlineConfirm } from "./inline-confirm"
import { MyDocs } from "./my-docs"
import { cn } from "@/lib/utils"
import { api, jsonInit, type Run } from "../argon-types"
import type { MissionDetail } from "../missions/mission-types"
import { MissionChat } from "../missions/mission-chat"
import { Workbench } from "../missions/workbench"
import { useMissionRunner } from "../missions/use-mission-runner"
import { routeLane, type RouteDecision } from "@/lib/assistant/route-pure"
import { ConversationSwitcher, type ConvItem } from "@/components/chat/conversation-switcher"
import { ConversationSidebar } from "@/components/chat/conversation-sidebar"
import { CHAT_DEFAULT_NAME } from "@/lib/argon/missions"
import { useArgonMember } from "../use-argon-member"
import { ENTITY_KINDS } from "@/lib/argon/graph-pure"
import type { SearchResult } from "@/lib/assistant/search"

// Hỏi: MỘT ô cho cả hỏi và tìm. Gõ → Kho gợi ý ngay phía trên ô nhắn (sự việc, thực thể, đoạn tài liệu/mail — không tốn lượt model); Ctrl+Enter → Argon trả lời (chat đầy đủ, có lịch sử). Câu cần THAO TÁC (tạo task, gửi tin…) → gợi ý mở Gấu Pro.
// MỘT khung chat nắm được mọi "cửa sổ" của Phòng Argon (Kho, sổ sự việc, bối cảnh và kế hoạch, số liệu hệ thống). Chạy trên sứ mệnh "Tham mưu hằng ngày"
// (đọc toàn Kho, có công cụ xếp thư mục/ghi sổ/sql/chạy code). Ghi vào Kho và sổ thì làm luôn rồi báo; việc gửi tin ra ngoài hoặc ghi DB production thì hỏi anh.
const MEMBER_QUICK = [
  "Tóm tắt giúp em tài liệu vừa thêm",
  "Trong tài liệu của em có thông tin gì về giá?",
  "Giúp em soạn email trả lời khách",
  "So sánh các báo giá trong tài liệu của em",
]
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
  const [showLive, setShowLive] = useState(false)   // giọng nói/màn hình trực tiếp (chỉ Creator)
  const [showDocs, setShowDocs] = useState(false)   // ngăn kéo "Tài liệu của tôi"
  const { state: up, upload, reset: resetUp } = useChatUpload()
  const [dropping, setDropping] = useState(false)
  const [showMemory, setShowMemory] = useState(false)   // panel Trí nhớ của chính người dùng (Argon đọc chung trí nhớ này)
  const [focus, setFocus] = useState<{ id: string; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const busyRef = useRef(false)
  const loadSeq = useRef(0)
  const onError = useCallback((m: string) => setErr(m), [])

  // Cuộc trò chuyện có tên (Creator): mỗi cuộc là một sứ mệnh riêng nên ngữ cảnh tách hẳn; cuộc mặc định = "Tham mưu hằng ngày". Member chỉ có cuộc mặc định.
  const member = useArgonMember()
  const [dailyId, setDailyId] = useState<string | null>(null)
  const [convs, setConvs] = useState<(ConvItem & { daily: boolean })[]>([])
  const loadConvs = useCallback(() => api<{ conversations: (ConvItem & { daily: boolean })[] }>("/api/creator/argon/conversations").then(r => setConvs(r.conversations)).catch(() => { /* chỉ là danh sách: lỗi thì giữ cuộc hiện tại */ }), [])
  const titled = useRef<Set<string>>(new Set())

  const sessionRole = session?.user?.role
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.argon_enabled === true ? "creator" : (d?.role ?? sessionRole ?? "staff"))).catch(() => setRole(sessionRole ?? "staff"))
  }, [status, sessionRole])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])
  useEffect(() => {
    if (role !== "creator") return
    api<{ missionId: string }>("/api/creator/argon/context").then(r => { setDailyId(r.missionId); setMissionId(r.missionId) }).catch(e => onError(e.message))
  }, [role, onError])
  useEffect(() => { if (role === "creator") void loadConvs() }, [role, loadConvs])

  const loadDetail = useCallback((id: string) => {
    const seq = ++loadSeq.current
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => { if (seq !== loadSeq.current) return; setDetail(r); if (!busyRef.current) setRuns(r.runs) }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])
  const refresh = useCallback(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])
  const runner = useMissionRunner({ projectId: detail?.mission.project_id ?? null, runs, setRuns, onError, onWorkspaceChanged: refresh, onFinished: refresh, onPoll: refresh })
  busyRef.current = runner.busy
  const benchClosedByUser = useRef(false)
  const toggleBench = (v: boolean) => { benchClosedByUser.current = !v; setShowBench(v) }
  useEffect(() => { if (!member && runner.busy && !benchClosedByUser.current && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setShowBench(true) }, [runner.busy, member])

  const switchTo = (id: string) => {
    if (id === missionId || runner.busy) return
    setDetail(null); setRuns([]); setDraft(""); setFound(null); setMissionId(id)
  }
  const newConversation = async () => {
    if (runner.busy) return
    try {
      const r = await api<{ conversation: ConvItem & { daily: boolean } }>("/api/creator/argon/conversations", jsonInit("POST", {}))
      setConvs(prev => [r.conversation, ...prev]); switchTo(r.conversation.id)
    } catch (e) { onError((e as Error).message) }
  }
  const renameConv = async (id: string, title: string) => {
    try {
      await api(`/api/creator/argon/conversations/${id}`, jsonInit("PATCH", { title }))
      setConvs(prev => prev.map(c => (c.id === id ? { ...c, title } : c)))
    } catch (e) { onError((e as Error).message) }
  }
  const deleteConv = async (id: string) => {
    if (!confirm("Xoá cuộc trò chuyện này (cả lượt hỏi/đáp và file trong đó)?")) return
    try {
      await api(`/api/creator/argon/conversations/${id}`, { method: "DELETE" })
      setConvs(prev => prev.filter(c => c.id !== id))
      if (id === missionId && dailyId) switchTo(dailyId)
    } catch (e) { onError((e as Error).message) }
  }
  // Cuộc mới chưa có tên: lấy câu hỏi đầu làm tên (sửa lại được bằng nút bút chì).
  const active = convs.find(c => c.id === missionId)
  const firstPrompt = runs[0]?.prompt
  useEffect(() => {
    if (!active || active.daily || active.title !== CHAT_DEFAULT_NAME || !firstPrompt || titled.current.has(active.id)) return
    titled.current.add(active.id)
    const t = firstPrompt.replace(/\s+/g, " ").trim()
    void renameConv(active.id, t.length > 50 ? `${t.slice(0, 50)}…` : t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.title, firstPrompt])

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const m = detail?.mission

  const steps = runner.steps.length
  const mainLabel = member ? "Cuộc trò chuyện chính" : "Tham mưu hằng ngày"   // tên dễ hiểu cho thành viên
  const convItems = convs.map(c => ({ ...c, locked: c.daily, title: c.daily ? mainLabel : c.title }))
  const canRename = (id: string) => !convs.find(c => c.id === id)?.daily
  // Bố cục như Gấu Pro/ChatGPT: danh sách cuộc trò chuyện ở CỘT TRÁI, khung chat chiếm phần còn lại, "Argon đang làm gì" là panel bên phải.
  // Phân quyền: chỉ Creator thấy cột trái và panel Argon đang làm gì; thành viên chỉ thấy khung chat của mình.
  return (
    <div className="mx-auto w-full max-w-[1700px] px-3 py-2 flex flex-col gap-2 lg:h-[calc(100vh-6.5rem)]">
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
      <div className="flex-1 min-h-0 flex gap-3">
        {convs.length > 0 && (
          <aside className="hidden lg:flex w-[260px] shrink-0 ag-card ag-card-flat overflow-hidden flex-col" aria-label="Quản lý cuộc trò chuyện">
            <ConversationSidebar className="flex-1" conversations={convItems} activeId={missionId} disabled={runner.busy}
              onSelect={c => switchTo(c.id)} onNew={() => void newConversation()}
              onRename={(id, t) => (canRename(id) ? renameConv(id, t) : undefined)}
              onDelete={id => { if (canRename(id)) void deleteConv(id) }} />
          </aside>
        )}
        <section onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true) } }} onDragLeave={e => { if (e.currentTarget === e.target) setDropping(false) }} onDrop={e => { e.preventDefault(); setDropping(false); const fs = Array.from(e.dataTransfer.files); if (fs.length) void upload(fs) }}
          className={cn("relative flex-1 min-w-0 min-h-[75vh] lg:min-h-0 ag-card ag-card-flat overflow-hidden flex flex-col", dropping && "ring-2 ring-violet-400")} aria-label="Gấu Prime">
          {dropping && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-violet-50/80 dark:bg-slate-900/80 text-[15px] font-medium text-violet-700 dark:text-violet-200">Thả tài liệu vào đây để thêm vào Tài liệu của tôi</div>}
          <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
            {convs.length > 0
              ? <div className="lg:hidden min-w-0"><ConversationSwitcher conversations={convItems} activeId={missionId} title={active?.daily ? mainLabel : (active?.title ?? mainLabel)} disabled={runner.busy}
                  onSelect={c => switchTo(c.id)} onNew={() => void newConversation()}
                  onRename={(id, t) => (canRename(id) ? renameConv(id, t) : undefined)}
                  onDelete={id => { if (canRename(id)) void deleteConv(id) }} /></div>
              : null}
            <span className={cn("px-2 text-sm font-semibold text-gray-800 dark:text-slate-100 truncate", convs.length > 0 && "hidden lg:inline")}>{active?.daily ? mainLabel : (active?.title ?? mainLabel)}</span>
            <button type="button" onClick={() => setShowDocs(true)} title="Những tài liệu bạn đã đưa cho trợ lý" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-600 px-2.5 py-1 text-[12px] text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"><FileText size={13} />Tài liệu của tôi</button>
            <button type="button" onClick={() => setShowMemory(true)} title="Xem, sửa hoặc xoá những điều trợ lý nhớ về bạn" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-600 px-2.5 py-1 text-[12px] text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"><Brain size={13} />Trí nhớ</button>
            {!member && <button type="button" onClick={() => setShowLive(true)} title="Nói chuyện trực tiếp bằng giọng nói, có thể chia sẻ màn hình" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-600 px-2.5 py-1 text-[12px] text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"><Radio size={13} />Nói chuyện</button>}
            {!member && (
              <button type="button" onClick={() => toggleBench(!showBench)} aria-expanded={showBench} title="Các bước Argon đã làm: đọc nguồn, chạy SQL, số liệu…"
                className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors", showBench ? "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-700" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700")}>
                <Wrench size={13} />Argon đang làm gì{steps > 0 && <span className="tabular-nums text-gray-500 dark:text-slate-400">· {steps}</span>}
                {runner.busy && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              </button>
            )}
          </div>
          {!m || !detail ? <div className="m-auto text-sm text-gray-400">Đang chuẩn bị trợ lý…</div> : (
            <div className="flex-1 min-h-0">
              <MissionChat simple quick={member ? MEMBER_QUICK : QUICK} autoSend={auto} onDraft={setDraft} basic={member} onAttach={files => void upload(files)} placeholder={member ? "Nhập câu hỏi của anh/chị… (Enter để gửi, Shift+Enter xuống dòng)" : undefined}
                aboveInput={<>
                  <UploadBanner state={up} onClose={resetUp} />
                  {member && <InlineConfirm refreshKey={runner.busy} onError={onError} />}
                  <KhoHints member={member} draft={draft} found={found} searching={searching} dismissed={dismissed} onDismiss={() => setDismissed(draft.trim())} />
                </>} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []}
                onPatch={async (id, action) => { await api(`/api/creator/argon/missions/${m.id}/patches`, jsonInit("POST", { id, action })); refresh() }}
                runs={runs} runner={runner} onPhase={async to => { await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to })); refresh() }}
                onStep={async (runId, n) => { await runner.loadSteps(runId, true); setFocus({ id: `${runId}:${n - 1}`, k: Date.now() }); if (!member) setShowBench(true) }} onError={onError} />
            </div>
          )}
        </section>
        {!member && showLive && <LiveSession title="Gấu Prime" onClose={() => setShowLive(false)} />}
        {showDocs && <MyDocs onClose={() => setShowDocs(false)} refreshKey={up.stage} onError={onError} />}
        {showMemory && <MemoryPanel api="/api/creator/assistant/memory" floating onClose={() => setShowMemory(false)} />}
        {!member && showBench && detail && (
          <aside aria-label="Argon đang làm gì" className="fixed inset-x-2 bottom-2 z-30 h-[60vh] rounded-2xl shadow-2xl lg:static lg:inset-auto lg:z-auto lg:h-auto lg:w-[360px] lg:shrink-0 lg:shadow-none ag-card ag-card-flat !bg-[var(--ag-glass-strong)] overflow-hidden flex flex-col">
            <button type="button" onClick={() => toggleBench(false)} aria-label="Đóng" className="absolute right-2 top-2 z-10 rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 lg:hidden"><X size={15} /></button>
            <Workbench steps={runner.steps} busy={runner.busy} bgActive={runner.bgActive} spentUsd={detail.spent_usd ?? 0} runCount={runs.length} focus={focus} sandbox={null} building={false} onBuild={() => {}}
              onStop={runner.stop} onOpenFile={() => {}} onLoadFull={id => void runner.loadSteps(id, true)} />
          </aside>
        )}
      </div>
    </div>
  )
}

/** Trạng thái tải tài liệu trong khung chat (lưu vào Tài liệu của tôi). */
function UploadBanner({ state, onClose }: { state: ReturnType<typeof useChatUpload>["state"]; onClose: () => void }) {
  if (state.stage === "idle") return null
  const ok = state.stage === "done"
  return (
    <div role="status" className={cn("mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]", state.stage === "error" ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100")}>
      {state.stage === "working" ? <Loader2 size={15} className="mt-0.5 animate-spin" /> : ok ? <Check size={15} className="mt-0.5" /> : <X size={15} className="mt-0.5" />}
      <span className="flex-1 min-w-0">
        {state.stage === "working" && state.text}
        {state.stage === "error" && state.text}
        {ok && <>Đã lưu vào Tài liệu của tôi: <b className="font-medium">{state.names.join(", ")}</b>. Anh/chị hỏi trợ lý về tài liệu này được rồi.{state.failed.length > 0 && <> Chưa lưu được: {state.failed.join(", ")}.</>}</>}
      </span>
      {state.stage !== "working" && <button type="button" onClick={onClose} aria-label="Đóng" className="opacity-60 hover:opacity-100"><X size={14} /></button>}
    </div>
  )
}

/** Gợi ý từ Kho ngay trên ô nhắn: gọn (tối đa ~6 dòng), tắt được, và nhắc Gấu Pro khi câu có vẻ cần thao tác. */
function KhoHints({ draft, found, searching, dismissed, onDismiss, member = false }: { member?: boolean; draft: string; found: (SearchResult & { route: RouteDecision }) | null; searching: boolean; dismissed: string; onDismiss: () => void }) {
  const q = draft.trim()
  if (q.length < 4 || dismissed === q) return null
  const lane = routeLane(q)   // việc ra ngoài (gửi tin, task, lịch, tài liệu) Argon làm qua thẻ duyệt; chỉ việc trên trình duyệt/máy của anh mới gợi ý Gấu Pro
  const handoff = !member && !lane.here
  const hasAny = !!found && (found.facts.length || found.entities.length || found.threads.length || found.chunks.length)
  if (!searching && !hasAny && !handoff) return null
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
      {handoff && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-gray-700 dark:text-slate-300">
          <Cpu size={13} className="text-violet-600" />{lane.reason}.
          <Link href={`/analytics/creator/ai?q=${encodeURIComponent(q)}`} className="font-medium text-violet-700 dark:text-violet-300 hover:underline">Mở Gấu Pro với câu này</Link>
        </div>
      )}
    </div>
  )
}
