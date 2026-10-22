"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Atom, ChevronDown, Compass, Database, Moon, RefreshCw, Settings2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit, type Run } from "./argon-types"
import type { MissionDetail, MissionRowUi, WsFile } from "./missions/mission-types"
import { MissionChat } from "./missions/mission-chat"
import { Workbench } from "./missions/workbench"
import { useMissionRunner } from "./missions/use-mission-runner"
import { ArgonMarkdown } from "./argon-markdown"
import { BRIEFING_MARK, BRIEFING_SECTION, BRIEF_TEXT, DAILY_GOAL, DAILY_MISSION_NAME as DAILY_NAME, NIGHTLY_PROMPT as NIGHT_PROMPT } from "@/lib/argon/context-pure"

// Phòng Argon (gọn): một trợ lý tham mưu chạy liền. Trang này = "Đề xuất hôm nay" + khung hỏi đáp. Bên dưới vẫn là sứ mệnh
// "Tham mưu hằng ngày" (tự tạo, luôn ở pha chạy); các pha, workspace, Bàn làm việc đầy đủ nằm ở /nang-cao, nguồn dữ liệu ở /kho-nguon.
const BRIEFING_PROMPT = "Cập nhật bản tin hôm nay"
const QUICK = ["Tuần này có gì đáng chú ý?", "So với target quý, chỗ nào đang chậm?", "Có tin mới nào từ Lark em nên báo anh không?"]
const BRIEFING_RE = /^notes\/(tin-hom-nay|tuan-tra-)/

const fmtAt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })

export default function ArgonHomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [briefing, setBriefing] = useState<{ text: string; at: string; path: string } | null>(null)
  const [autoSend, setAutoSend] = useState<{ text: string; k: number } | null>(null)
  const [nightly, setNightly] = useState<boolean | null>(null)
  const [showBrief, setShowBrief] = useState(false)
  const [briefText, setBriefText] = useState("")
  const [briefDirty, setBriefDirty] = useState(false)
  const [showBench, setShowBench] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [setting, setSetting] = useState(false)
  const loadSeq = useRef(0)
  const busyRef = useRef(false)
  const onError = useCallback((m: string) => setErr(m), [])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  // Tìm sứ mệnh "Tham mưu hằng ngày"; chưa có thì tạo, Chốt luôn và ghi brief mẫu (chỉ lần đầu).
  const ensureMission = useCallback(async () => {
    setSetting(true)
    try {
      const list = await api<{ missions: MissionRowUi[] }>("/api/creator/argon/missions")
      let m = list.missions.find(x => x.name === DAILY_NAME)
      if (!m) {
        m = (await api<{ mission: MissionRowUi }>("/api/creator/argon/missions", jsonInit("POST", { name: DAILY_NAME, goal: DAILY_GOAL }))).mission
        await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to: "plan" }))
        await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to: "run" }))
        await api(`/api/creator/argon/missions/${m.id}/files`, jsonInit("PUT", { path: "brief.md", content: BRIEF_TEXT + BRIEFING_SECTION }))
      } else {
        // Brief cũ (tạo trước khi có mục bản tin) → thêm mục hướng dẫn để câu "Cập nhật bản tin hôm nay" đủ ý.
        const f = await api<{ file: WsFile }>(`/api/creator/argon/missions/${m.id}/files?path=brief.md`).catch(() => null)
        if (f && !(f.file.content ?? "").includes(BRIEFING_MARK)) await api(`/api/creator/argon/missions/${m.id}/files`, jsonInit("PUT", { path: "brief.md", content: (f.file.content ?? "") + BRIEFING_SECTION }))
      }
      if (m.phase !== "run") {
        if (m.phase === "done" || m.phase === "paused") await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to: "run" }))
      }
      setMissionId(m.id)
    } catch (e) { onError((e as Error).message) } finally { setSetting(false) }
  }, [onError])
  useEffect(() => { if (role === "creator") void ensureMission() }, [role, ensureMission])

  const loadDetail = useCallback((id: string) => {
    const seq = ++loadSeq.current
    api<MissionDetail>(`/api/creator/argon/missions/${id}`).then(r => {
      if (seq !== loadSeq.current) return
      setDetail(r)
      if (!busyRef.current) setRuns(r.runs)
    }).catch(e => onError(e.message))
  }, [onError])
  useEffect(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])

  // Bản tin = file ghi gần nhất trong notes/ (bản tin hôm nay hoặc tuần tra đêm).
  const latest = useMemo(() => (detail?.files ?? []).filter(f => BRIEFING_RE.test(f.path)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0], [detail?.files])
  useEffect(() => {
    if (!missionId || !latest) { setBriefing(null); return }
    api<{ file: WsFile }>(`/api/creator/argon/missions/${missionId}/files?path=${encodeURIComponent(latest.path)}`)
      .then(r => setBriefing({ text: r.file.content ?? "", at: latest.updated_at, path: latest.path })).catch(() => setBriefing(null))
  }, [missionId, latest?.path, latest?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!missionId) return
    api<{ patrol: { enabled: boolean } }>(`/api/creator/argon/missions/${missionId}/patrol`).then(r => setNightly(!!r.patrol?.enabled)).catch(() => setNightly(false))
  }, [missionId])
  async function toggleNightly() {
    if (!missionId || nightly == null) return
    const next = !nightly
    setNightly(next)
    try { await api(`/api/creator/argon/missions/${missionId}/patrol`, jsonInit("PUT", { enabled: next, prompt: NIGHT_PROMPT })) } catch (e) { setNightly(!next); onError((e as Error).message) }
  }

  const loadBriefText = useCallback(async () => {
    if (!missionId) return
    try { const r = await api<{ file: WsFile }>(`/api/creator/argon/missions/${missionId}/files?path=brief.md`); setBriefText(r.file.content ?? ""); setBriefDirty(false) } catch (e) { onError((e as Error).message) }
  }, [missionId, onError])
  useEffect(() => { if (showBrief) void loadBriefText() }, [showBrief, loadBriefText])
  async function saveBrief() {
    if (!missionId) return
    try { await api(`/api/creator/argon/missions/${missionId}/files`, jsonInit("PUT", { path: "brief.md", content: briefText })); setBriefDirty(false) } catch (e) { onError((e as Error).message) }
  }

  const refresh = useCallback(() => { if (missionId) loadDetail(missionId) }, [missionId, loadDetail])
  const runner = useMissionRunner({
    projectId: detail?.mission.project_id ?? null, runs, setRuns, onError,
    onWorkspaceChanged: refresh, onFinished: refresh, onPoll: refresh,
  })
  busyRef.current = runner.busy
  const [focus, setFocus] = useState<{ id: string; k: number } | null>(null)
  async function showStep(runId: string, n: number) { await runner.loadSteps(runId, true); setFocus({ id: `${runId}:${n - 1}`, k: Date.now() }); setShowBench(true) }
  async function decidePatch(id: string, action: "approve" | "reject") {
    if (!missionId) return
    await api(`/api/creator/argon/missions/${missionId}/patches`, jsonInit("POST", { id, action }))
    refresh()
  }
  const updateBriefing = () => { setAutoSend({ text: BRIEFING_PROMPT, k: Date.now() }) }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const m = detail?.mission

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-5 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-sm"><Atom size={22} /></div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Argon</h1>
          <p className="text-[13px] text-gray-500">Trợ lý tham mưu: đọc số liệu và tin mới, đề xuất việc nên làm</p>
        </div>
        <nav className="ml-auto flex items-center gap-2" aria-label="Chức năng khác">
          <Link href="/analytics/creator/argon/boi-canh" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"><Compass size={14} />Bối cảnh và Kế hoạch</Link>
          <Link href="/analytics/creator/argon/kho-nguon" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"><Database size={14} />Nguồn dữ liệu</Link>
          <Link href="/analytics/creator/argon/nang-cao" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"><Settings2 size={14} />Nâng cao</Link>
        </nav>
      </header>
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4 min-w-0">
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden" aria-labelledby="dx-title">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-white dark:from-slate-800 dark:to-slate-800">
              <Sparkles size={16} className="text-violet-600" />
              <h2 id="dx-title" className="font-semibold text-gray-900 dark:text-slate-100">Đề xuất hôm nay</h2>
              {briefing && <span className="text-xs text-gray-500">cập nhật {fmtAt(briefing.at)}</span>}
              <button type="button" onClick={updateBriefing} disabled={runner.busy || !detail || setting}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
                <RefreshCw size={13} className={cn(runner.busy && "animate-spin")} />{runner.busy ? "Đang cập nhật…" : "Cập nhật bản tin"}
              </button>
            </div>
            <div className="px-4 py-4 max-h-[52vh] overflow-y-auto">
              {setting && !detail ? <p className="text-sm text-gray-400">Đang chuẩn bị Argon…</p>
                : briefing ? <ArgonMarkdown text={briefing.text} />
                : <div className="text-sm text-gray-500 leading-relaxed">Chưa có bản tin. Bấm <b>Cập nhật bản tin</b> để Argon đọc số liệu và tin mới rồi đề xuất việc nên làm. Làm một lần mất vài phút.</div>}
            </div>
            <label className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer">
              <Moon size={14} className="text-violet-600" />
              <input type="checkbox" checked={!!nightly} disabled={nightly == null} onChange={toggleNightly} className="w-4 h-4 accent-violet-600" />
              Tự cập nhật mỗi đêm và nhắn Lark khi xong
            </label>
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <button type="button" onClick={() => setShowBrief(v => !v)} aria-expanded={showBrief} className="w-full flex items-center gap-2 px-4 py-3 text-left">
              <span className="font-semibold text-gray-900 dark:text-slate-100">Target và nhiệm vụ của anh</span>
              <span className="text-xs text-gray-500">Argon đọc phần này trước khi trả lời</span>
              <ChevronDown size={16} className={cn("ml-auto text-gray-400 transition-transform", showBrief && "rotate-180")} />
            </button>
            {showBrief && (
              <div className="px-4 pb-4 space-y-2">
                <textarea value={briefText} onChange={e => { setBriefText(e.target.value); setBriefDirty(true) }} rows={12} aria-label="Target và nhiệm vụ"
                  className="w-full text-[13px] leading-relaxed font-mono rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 p-3 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveBrief} disabled={!briefDirty} className="px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 text-white disabled:opacity-40">Lưu</button>
                  <span className="text-xs text-gray-500">{briefDirty ? "Chưa lưu" : "Đã lưu"}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[60vh] lg:h-[calc(100vh-11rem)] min-w-0" aria-label="Hỏi Argon">
          {!m || !detail ? <div className="m-auto text-sm text-gray-400">Đang tải…</div> : (
            <>
              <div className="flex-1 min-h-0">
                <MissionChat simple quick={QUICK} autoSend={autoSend} phase={m.phase} pendingAsk={detail.pendingAsk} patches={detail.patches ?? []} onPatch={decidePatch}
                  runs={runs} runner={runner} onPhase={async to => { await api(`/api/creator/argon/missions/${m.id}/phase`, jsonInit("POST", { to })); refresh() }} onStep={showStep} onError={onError} />
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
    </div>
  )
}
