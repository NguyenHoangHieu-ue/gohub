"use client"

import "@xyflow/react/dist/style.css"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ReactFlow, Background, Controls, Handle, Position, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { ArrowLeft, Atom, Network, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "../argon-types"
import { AGENTS, applyEvents, emptyActivity, isActive, isErrored, type ActivityState, type MapEdge, type MapNode } from "@/lib/system-map"
import type { AgentEvent, AgentId } from "@/lib/agent-events"

// Bản đồ vận hành: sơ đồ Bé Gấu · Gấu Pro · Phòng Argon. Nút và cạnh SÁNG khi có lượt đang chạy (sự kiện từ vòng lặp agent, chỉ gồm tên bước + thời gian),
// bấm một lượt gần đây để phát lại. Đồ thị dựng từ danh sách công cụ thật của từng trợ lý nên tự theo code.
interface MapData { nodes: MapNode[]; edges: MapEdge[]; now: number; eventsEnabled: boolean; toolCounts: Record<AgentId, number>; runs: RunRow[] }
interface RunRow { run: string; agent: AgentId; startedAt: number; endedAt: number | null; tools: number; errors: number }
const AGENT_LABEL = Object.fromEntries(AGENTS.map(a => [a.id, a.label])) as Record<AgentId, string>
const AGENT_COLOR = Object.fromEntries(AGENTS.map(a => [a.id, a.color])) as Record<AgentId, string>
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const fmtDur = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)
const KIND_STYLE: Record<MapNode["kind"], string> = {
  entry: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  agent: "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-semibold",
  core: "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100",
  group: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100",
  store: "border-gray-300 bg-gray-100 text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100",
}

type NodeData = { node: MapNode; active: boolean; errored: boolean; selected: boolean }
const MapNodeView = memo(function MapNodeView({ data }: NodeProps<Node<NodeData>>) {
  const { node, active, errored, selected } = data
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-[12.5px] leading-tight shadow-sm w-[190px] transition-all duration-300", KIND_STYLE[node.kind],
      active && "ring-4 ring-amber-300 shadow-lg scale-[1.04]", errored && "ring-4 ring-red-400", selected && "outline outline-2 outline-violet-500")}
      style={node.kind === "agent" ? { borderColor: node.color, borderWidth: 2 } : undefined}>
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-gray-400" />
      <div className="flex items-center gap-1.5">
        {node.kind === "agent" && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: node.color }} />}
        <span className="truncate">{node.label}</span>
        {node.count != null && <span className="ml-auto shrink-0 rounded-full bg-white/70 dark:bg-black/30 px-1.5 text-[10.5px]">{node.count}</span>}
      </div>
      {node.sub && <div className="mt-0.5 text-[10.5px] opacity-70 truncate">{node.sub}</div>}
      <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !bg-gray-400" />
    </div>
  )
})
const nodeTypes = { map: MapNodeView }

export default function BanDoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [data, setData] = useState<MapData | null>(null)
  const [activity, setActivity] = useState<ActivityState>(emptyActivity())
  const [now, setNow] = useState(Date.now())
  const [log, setLog] = useState<AgentEvent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [replay, setReplay] = useState<{ run: string; total: number; done: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const since = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const replaying = useRef(false)
  replaying.current = !!replay

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const load = useCallback(async () => {
    try { const d = await api<MapData>("/api/creator/argon/map"); setData(d); if (!since.current) since.current = d.now } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { if (role === "creator") void load() }, [role, load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 400); return () => clearInterval(t) }, [])

  const feed = useCallback((events: AgentEvent[]) => {
    if (!events.length) return
    const t = Date.now()
    setActivity(a => applyEvents(a, events, t))
    setLog(l => [...events.filter(e => e.kind === "tool" || e.kind === "start" || e.kind === "end").reverse(), ...l].slice(0, 40))
  }, [])

  useEffect(() => {   // sự kiện trực tiếp: hỏi mỗi 2 giây, chỉ khi không đang phát lại và tab đang hiện
    if (role !== "creator") return
    const t = setInterval(async () => {
      if (replaying.current || document.hidden || !since.current) return
      try {
        const r = await api<{ events: AgentEvent[]; now: number }>(`/api/creator/argon/map?since=${since.current}`)
        if (r.events.length) since.current = Math.max(...r.events.map(e => e.at))
        feed(r.events)
      } catch { /* mất mạng tạm thời: lần sau */ }
    }, 2000)
    return () => clearInterval(t)
  }, [role, feed])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function stopReplay() { timers.current.forEach(clearTimeout); timers.current = []; setReplay(null); setActivity(emptyActivity()) }
  async function startReplay(run: string) {
    stopReplay()
    try {
      const { events } = await api<{ events: AgentEvent[] }>(`/api/creator/argon/map?run=${run}`)
      if (!events.length) { setErr("Lượt này không còn sự kiện (giữ 3 ngày)."); return }
      const SPEED = 4, t0 = events[0].at
      setReplay({ run, total: events.length, done: 0 })
      events.forEach((e, i) => timers.current.push(setTimeout(() => {
        feed([e]); setReplay(r => (r ? { ...r, done: i + 1 } : r))
        if (i === events.length - 1) timers.current.push(setTimeout(() => setReplay(null), 2500))
      }, Math.min((e.at - t0) / SPEED, 90_000))))
    } catch (e) { setErr((e as Error).message) }
  }

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] }
    const act = (id: string) => isActive(activity, id, now)
    const ns: Node<NodeData>[] = data.nodes.map(n => ({ id: n.id, type: "map", position: { x: n.x, y: n.y }, data: { node: n, active: act(n.id), errored: isErrored(activity, n.id, now), selected: selected === n.id }, draggable: false }))
    const es: Edge[] = data.edges.map(e => {
      const on = act(e.id)
      return { id: e.id, source: e.source, target: e.target, animated: on, style: { stroke: on ? "#f59e0b" : e.color, strokeWidth: on ? 3.2 : 1.4, opacity: on ? 1 : 0.4, strokeDasharray: e.dashed && !on ? "5 4" : undefined } }
    })
    return { nodes: ns, edges: es }
  }, [data, activity, now, selected])

  const sel = data?.nodes.find(n => n.id === selected)
  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const running = Object.values(activity.until).some(u => u > now)

  return (
    <div className="max-w-[1700px] mx-auto px-4 py-4 space-y-3">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-sm"><Network size={20} /></div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Bản đồ vận hành</h1>
          <p className="text-[13px] text-gray-500">Bé Gấu, Gấu Pro, Argon làm việc thế nào; nút sáng khi đang chạy</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 text-[12.5px]", running ? "text-amber-600" : "text-gray-500")}><span className={cn("w-2 h-2 rounded-full", running ? "bg-amber-500 animate-pulse" : "bg-gray-300")} />{replay ? `Phát lại ${replay.done}/${replay.total}` : running ? "Đang có lượt chạy" : "Đang chờ lượt chạy mới"}</span>
          {replay && <button type="button" onClick={stopReplay} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12.5px] rounded-lg border border-gray-300 dark:border-slate-600"><Pause size={12} />Dừng phát lại</button>}
          <Link href="/analytics/creator/argon" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"><ArrowLeft size={14} /><Atom size={14} />Về Argon</Link>
        </div>
      </header>
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
      {data && !data.eventsEnabled && <div className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Chưa cấu hình ARGON_TURSO_URL / ARGON_TURSO_AUTH_TOKEN nên chưa ghi được sự kiện chạy: sơ đồ vẫn hiện nhưng không sáng.</div>}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden h-[72vh] min-h-[480px]">
          {data ? (
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }} minZoom={0.3} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false}
              onNodeClick={(_, n) => setSelected(s => (s === n.id ? null : n.id))} onPaneClick={() => setSelected(null)} proOptions={{ hideAttribution: true }}>
              <Background gap={22} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : <div className="h-full flex items-center justify-center text-sm text-gray-400">Đang dựng sơ đồ…</div>}
        </div>

        <aside className="space-y-3 min-w-0">
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 space-y-2" aria-label="Chú thích">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Trợ lý</div>
            {AGENTS.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-[12.5px]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} /><span className="font-medium">{a.label}</span><span className="text-gray-500 truncate">{data ? `${data.toolCounts[a.id]} công cụ` : ""}</span></div>
            ))}
            <div className="text-[11.5px] text-gray-500 leading-snug pt-1">Bấm một nút để xem công cụ trong nhóm. Nút vàng = đang chạy, đỏ = công cụ vừa lỗi.</div>
          </section>

          {sel && (
            <section className="rounded-2xl border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-800 shadow-sm p-3 space-y-1.5">
              <div className="font-semibold text-[13.5px]">{sel.label}</div>
              {sel.sub && <div className="text-[12px] text-gray-500">{sel.sub}</div>}
              {sel.tools && <div className="flex flex-wrap gap-1 pt-1">{sel.tools.map(t => <code key={t} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[11px]">{t}</code>)}</div>}
            </section>
          )}

          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 space-y-1.5" aria-label="Diễn biến">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Diễn biến gần nhất</div>
            {log.length === 0 && <div className="text-[12px] text-gray-400 py-2">Chưa có lượt chạy mới. Hỏi Bé Gấu / Gấu Pro / Argon một câu rồi quay lại xem sơ đồ sáng lên.</div>}
            <div className="max-h-[22vh] overflow-y-auto space-y-1">
              {log.map((e, i) => (
                <div key={`${e.id ?? e.at}-${i}`} className="flex items-center gap-1.5 text-[12px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AGENT_COLOR[e.agent] }} />
                  <span className="text-gray-400 shrink-0">{fmtTime(e.at)}</span>
                  <span className={cn("truncate", e.ok === false && "text-red-600")}>{e.kind === "start" ? `${AGENT_LABEL[e.agent]} bắt đầu` : e.kind === "end" ? `${AGENT_LABEL[e.agent]} xong` : e.name}</span>
                  {e.ms != null && <span className="ml-auto text-gray-400 shrink-0">{fmtDur(e.ms)}</span>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 space-y-1.5" aria-label="Lượt gần đây">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Lượt gần đây (bấm để phát lại)</div>
            {(data?.runs.length ?? 0) === 0 && <div className="text-[12px] text-gray-400 py-2">Chưa có lượt nào được ghi.</div>}
            <div className="max-h-[26vh] overflow-y-auto space-y-1">
              {data?.runs.map(r => (
                <button key={r.run} type="button" onClick={() => void startReplay(r.run)} className={cn("w-full flex items-center gap-1.5 text-left text-[12px] rounded-lg px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-slate-700", replay?.run === r.run && "bg-violet-50 dark:bg-violet-950/40")}>
                  <Play size={11} className="text-gray-400 shrink-0" /><span className="w-2 h-2 rounded-full shrink-0" style={{ background: AGENT_COLOR[r.agent] }} />
                  <span className="shrink-0">{AGENT_LABEL[r.agent]}</span><span className="text-gray-400 shrink-0">{fmtTime(r.startedAt)}</span>
                  <span className="ml-auto text-gray-500 shrink-0">{r.tools} bước{r.errors ? <b className="text-red-600"> · {r.errors} lỗi</b> : ""}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load()} className="text-[11.5px] text-violet-700 dark:text-violet-300 hover:underline">Làm mới danh sách</button>
          </section>
        </aside>
      </div>
    </div>
  )
}
