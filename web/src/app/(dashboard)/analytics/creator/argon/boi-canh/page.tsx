"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Compass, Loader2, Moon, RefreshCw, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "../argon-types"
import { ArgonMarkdown } from "../argon-markdown"

// Bối cảnh & Kế hoạch: anh viết kế hoạch + metric bằng văn bản (brief.md của sứ mệnh "Tham mưu hằng ngày"); mỗi đêm (hoặc bấm Cập nhật ngay) Argon đọc
// toàn bộ thread/mail/file/sổ sự việc trong Kho, dựng bức tranh công ty, rồi chỉ ra tin nào ảnh hưởng tới kế hoạch và đề xuất việc — mọi ý đều kèm nguồn.
interface Doc { text: string; updatedAt: string | null }
interface Snapshot {
  missionId: string; plan: Doc; boiCanh: Doc
  tacDong: Doc & { audit: { total: number; ok: number; issues: string[]; empty: boolean } }
  nightly: boolean; running: { runId: string; since: string } | null
}
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "")
const PLAN_HINT = `Ví dụ:
## Mục tiêu quý
- Doanh thu Q4 đạt 12 tỷ, %Datapool 75%

## Metric theo dõi
- Doanh thu 7 ngày — mục tiêu 1,9 tỷ/tuần
- %Datapool — mục tiêu 75%

## Việc đang làm
- Chuyển Thái Lan sang BC Datapool
- Chốt báo giá VNPT

## Ưu tiên
- Không mở thêm vendor mới trước tháng 12`

export default function BoiCanhPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const load = useCallback(async () => {
    try {
      const s = await api<Snapshot>("/api/creator/argon/context")
      setSnap(s)
      if (!dirtyRef.current) setDraft(s.plan.text)
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { if (role === "creator") void load() }, [role, load])
  useEffect(() => {   // đang cập nhật → hỏi lại mỗi 6 giây cho tới khi xong
    if (!snap?.running) return
    const t = setInterval(() => void load(), 6000)
    return () => clearInterval(t)
  }, [snap?.running, load])

  async function savePlan() {
    setBusy("save")
    try { const s = await api<Snapshot>("/api/creator/argon/context", jsonInit("PUT", { plan: draft })); setSnap(s); setDraft(s.plan.text); setDirty(false) } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }
  async function updateNow() {
    setBusy("run")
    try { if (dirty) await savePlan(); await api("/api/creator/argon/context", jsonInit("POST", {})); await load() } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }
  async function toggleNightly() {
    if (!snap) return
    const next = !snap.nightly
    setSnap({ ...snap, nightly: next })
    try { setSnap(await api<Snapshot>("/api/creator/argon/context", jsonInit("PATCH", { nightly: next }))) } catch (e) { setErr((e as Error).message); setSnap({ ...snap, nightly: !next }) }
  }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const running = !!snap?.running
  // "Chưa có kế hoạch" = ngoài tiêu đề và dòng mẫu trong ngoặc, mục kế hoạch không có chữ nào (các mục "Cách viết" mặc định không tính)
  const planEmpty = !snap || !/\S/.test((/##\s*(Kế hoạch và metric|Target và nhiệm vụ)[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(snap.plan.text)?.[2] ?? "").replace(/^\(.*\)\s*$/gm, ""))
  const card = "rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-5 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-sm"><Compass size={22} /></div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Bối cảnh và Kế hoạch</h1>
          <p className="text-[13px] text-gray-500">Argon đọc thread, mail, tài liệu trong Kho để hiểu công ty, rồi đối chiếu với kế hoạch của anh</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer">
            <Moon size={14} className="text-violet-600" />
            <input type="checkbox" checked={!!snap?.nightly} disabled={!snap} onChange={() => void toggleNightly()} className="w-4 h-4 accent-violet-600" />Tự cập nhật mỗi đêm
          </label>
          <button type="button" onClick={() => void updateNow()} disabled={!snap || running || busy === "run"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
            <RefreshCw size={13} className={cn(running && "animate-spin")} />{running ? "Đang cập nhật…" : "Cập nhật ngay"}
          </button>
          
        </div>
      </header>
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
      {running && <div className="text-[13px] rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 px-3 py-2 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Argon đang đọc Kho và đối chiếu kế hoạch (từ {fmtAt(snap!.running!.since)}), thường mất vài phút. Xong sẽ nhắn Lark; trang tự làm mới.</div>}

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <section className={cn(card, "p-4 space-y-3")} aria-labelledby="plan-title">
          <div className="flex items-center gap-2">
            <h2 id="plan-title" className="font-semibold text-gray-900 dark:text-slate-100">Kế hoạch và metric của anh</h2>
            {snap?.plan.updatedAt && <span className="text-xs text-gray-500">lưu {fmtAt(snap.plan.updatedAt)}</span>}
          </div>
          <p className="text-[12.5px] text-gray-500 leading-relaxed">Anh viết bằng văn bản. Argon chỉ coi những gì ghi ở đây là kế hoạch của anh, không tự thêm mục tiêu hay con số.</p>
          <textarea value={draft} onChange={e => { setDraft(e.target.value); setDirty(true) }} rows={20} placeholder={PLAN_HINT} aria-label="Kế hoạch và metric"
            className="w-full text-[13px] leading-relaxed font-mono rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 p-3 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void savePlan()} disabled={!dirty || busy === "save"} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 text-white disabled:opacity-40"><Save size={13} />Lưu</button>
            <span className="text-xs text-gray-500">{dirty ? "Chưa lưu" : planEmpty ? "Chưa có kế hoạch — Argon sẽ nhắc anh điền" : "Đã lưu"}</span>
          </div>
        </section>

        <section className={cn(card, "p-4 space-y-2")} aria-labelledby="ctx-title">
          <div className="flex items-center gap-2">
            <h2 id="ctx-title" className="font-semibold text-gray-900 dark:text-slate-100">Bối cảnh công ty</h2>
            {snap?.boiCanh.updatedAt && <span className="text-xs text-gray-500">cập nhật {fmtAt(snap.boiCanh.updatedAt)}</span>}
          </div>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {snap?.boiCanh.text ? <ArgonMarkdown text={snap.boiCanh.text} />
              : <p className="text-sm text-gray-500 leading-relaxed">Chưa có. Bấm <b>Cập nhật ngay</b> để Argon đọc Kho và dựng bức tranh: tình hình từng vendor, việc đang chờ ai, thay đổi sản phẩm, rủi ro.</p>}
          </div>
        </section>

        <section className={cn(card, "p-4 space-y-2")} aria-labelledby="imp-title">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="imp-title" className="font-semibold text-gray-900 dark:text-slate-100">Tác động và đề xuất</h2>
            {snap?.tacDong.updatedAt && <span className="text-xs text-gray-500">cập nhật {fmtAt(snap.tacDong.updatedAt)}</span>}
          </div>
          {snap && !snap.tacDong.audit.empty && (
            <div className={cn("text-[12px] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5", snap.tacDong.audit.issues.length ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200")}>
              {snap.tacDong.audit.issues.length ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={13} className="mt-0.5 shrink-0" />}
              <span>Kiểm nguồn: {snap.tacDong.audit.ok}/{snap.tacDong.audit.total} đề xuất đủ nhãn chắc chắn, mức ảnh hưởng, nguồn và mục kế hoạch liên quan.{snap.tacDong.audit.issues.length ? ` ${snap.tacDong.audit.issues.join("; ")}. Anh cân nhắc kỹ trước khi làm theo.` : ""}</span>
            </div>
          )}
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {snap?.tacDong.text ? <ArgonMarkdown text={snap.tacDong.text} />
              : <p className="text-sm text-gray-500 leading-relaxed">Chưa có. Sau khi anh điền kế hoạch và bấm <b>Cập nhật ngay</b>, Argon chỉ ra tin nào ảnh hưởng tới kế hoạch và đề xuất tối đa 3 việc, mỗi việc có nguồn và mức chắc chắn.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
