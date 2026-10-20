"use client"

import { useEffect, useState } from "react"
import { Moon, Play, Save, X } from "lucide-react"
import { api, jsonInit } from "../argon-types"

interface Patrol { enabled: boolean; prompt: string; lastRunDate?: string }
interface ForecastUi { id: string; text: string; expected?: number; unit?: string; checkDate: string; status: "open" | "scored"; actual?: number; errorPct?: number; verdict?: "dung" | "gan_dung" | "sai"; note?: string }
interface Summary { scored: number; open: number; right: number; near: number; wrong: number; accuracyPct: number | null; avgErrorPct: number | null }
const VERDICT = { dung: ["Đúng", "text-emerald-700 dark:text-emerald-300"], gan_dung: ["Gần đúng", "text-amber-700 dark:text-amber-300"], sai: ["Sai", "text-red-700 dark:text-red-300"] } as const
interface Preset { id: string; label: string; prompt: string }

// Tuần tra đêm của sứ mệnh: một yêu cầu cố định, cron đêm giao Argon chạy nền (model Nhanh) khi sứ mệnh đang ở pha chạy; báo cáo vào notes/tuan-tra-<ngày>.md + tin Lark.
export function PatrolPanel({ missionId, phase, onClose, onStarted, onError }: { missionId: string; phase: string; onClose: () => void; onStarted: () => void; onError: (m: string) => void }) {
  const [p, setP] = useState<Patrol | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [forecasts, setForecasts] = useState<ForecastUi[]>([])
  const [sum, setSum] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `/api/creator/argon/missions/${missionId}/patrol`

  useEffect(() => { api<{ patrol: Patrol; presets: Preset[]; forecasts: ForecastUi[]; forecastSummary: Summary }>(url).then(r => { setP(r.patrol); setPresets(r.presets); setForecasts(r.forecasts ?? []); setSum(r.forecastSummary ?? null) }).catch(e => { onError((e as Error).message); onClose() }) }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: Patrol) {
    setBusy(true)
    try { const r = await api<{ patrol: Patrol }>(url, jsonInit("PUT", { enabled: next.enabled, prompt: next.prompt })); setP(r.patrol) } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  async function runNow() {
    if (!p) return
    setBusy(true)
    try { await api(url, jsonInit("PUT", { enabled: p.enabled, prompt: p.prompt })); await api(url, { method: "POST" }); onStarted(); onClose() } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Tuần tra đêm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <Moon size={16} className="text-violet-600" /><div className="font-semibold">Tuần tra đêm</div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        {!p ? <div className="p-6 text-sm text-gray-400">Đang tải…</div> : (
          <div className="p-4 space-y-3 text-sm">
            <p className="text-gray-600 dark:text-slate-300">Mỗi đêm Argon tự chạy nền một yêu cầu cố định cho sứ mệnh này, ghi báo cáo vào <code className="font-mono text-xs">notes/tuan-tra-&lt;ngày&gt;.md</code> và nhắn Lark cho anh. Chỉ chạy khi sứ mệnh đang ở pha <b>Đang chạy</b>, tối đa 1 lần/ngày.</p>
            {phase !== "run" && <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 px-3 py-2 text-xs">Sứ mệnh đang ở pha “{phase}”: tuần tra chưa chạy cho tới khi anh Chốt và sứ mệnh ở pha Đang chạy.</div>}
            <div className="flex flex-wrap gap-1.5">
              {presets.map(x => <button key={x.id} type="button" onClick={() => setP({ ...p, prompt: x.prompt })} className="px-2 py-0.5 text-xs rounded-full border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40">{x.label}</button>)}
            </div>
            <textarea value={p.prompt} onChange={e => setP({ ...p, prompt: e.target.value })} rows={6} aria-label="Yêu cầu tuần tra" placeholder="Yêu cầu cố định mỗi đêm, vd: Đo lại thước đo trong brief.md và so với mục tiêu…"
              className="w-full px-2.5 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent text-gray-800 dark:text-slate-100" />
            <label className="inline-flex items-center gap-2 font-medium"><input type="checkbox" checked={p.enabled} onChange={e => setP({ ...p, enabled: e.target.checked })} className="accent-violet-600" />Bật tuần tra hằng đêm</label>
            {p.lastRunDate && <div className="text-xs text-gray-500">Lần gần nhất: {p.lastRunDate}</div>}
            <div className="border-t border-gray-200 dark:border-slate-700 pt-3">
              <div className="flex items-baseline gap-2"><span className="font-medium">Sổ dự đoán của Argon</span>
                {sum && sum.scored > 0 && <span className="text-xs text-gray-500">đã chấm {sum.scored}: {sum.right} đúng · {sum.near} gần đúng · {sum.wrong} sai{sum.accuracyPct !== null ? ` → độ đúng ${sum.accuracyPct}%` : ""}{sum.avgErrorPct !== null ? `, sai số TB ${sum.avgErrorPct}%` : ""}</span>}
                {sum && sum.open > 0 && <span className="text-xs text-gray-500">{sum.open} đang chờ đến hạn</span>}
              </div>
              {forecasts.length === 0
                ? <p className="mt-1 text-xs text-gray-500">Chưa có dự đoán nào. Khi Argon đưa ra ước tính có con số (vd "chuyển sang BC thì %Datapool lên ~76%") nó ghi vào đây, tới hạn tuần tra đêm đo lại và chấm đúng/sai.</p>
                : <ul className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">{forecasts.map(f => (
                    <li key={f.id} className="text-xs rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-1.5">
                      <div className="text-gray-800 dark:text-slate-100">{f.text}</div>
                      <div className="mt-0.5 text-gray-500">{f.expected !== undefined ? `dự kiến ${f.expected}${f.unit ? " " + f.unit : ""} · ` : ""}hạn {f.checkDate} · {f.status === "open" ? "chờ chấm" : <span className={VERDICT[f.verdict ?? "sai"][1]}>{VERDICT[f.verdict ?? "sai"][0]}{f.actual !== undefined ? ` (thực tế ${f.actual}${f.errorPct !== undefined ? `, sai số ${f.errorPct}%` : ""})` : ""}</span>}</div>
                      {f.note && <div className="mt-0.5 text-gray-500">{f.note}</div>}
                    </li>))}</ul>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void save(p)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg disabled:opacity-50"><Save size={14} />Lưu</button>
              <button type="button" onClick={() => void runNow()} disabled={busy || !p.prompt.trim() || phase !== "run"} title={phase !== "run" ? "Chỉ chạy thử được khi sứ mệnh ở pha Đang chạy" : "Chạy ngay 1 lượt nền theo yêu cầu này"} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-violet-400 text-violet-700 dark:text-violet-300 rounded-lg disabled:opacity-50"><Play size={14} />Chạy thử ngay</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
