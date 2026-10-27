import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { PARITY_LABEL, countTools, isAutoRun, median, parityOf, removalCriteria, upRate } from "@/lib/assistant/parity-pure"

export const dynamic = "force-dynamic"

// Chạy song song Gấu Pro ↔ Gấu Prime (Đợt 4): số lượt, thời gian, 👍/👎, công cụ Gấu Pro đang dùng + đã có tương đương ở Gấu Prime chưa, tiêu chí gỡ. Chỉ Creator, chỉ đọc.
const PRO_FEEDBACK = ["gau_pro", "gau-pro", "creator-ai", "gp"]
export async function GET(req: NextRequest) {
  if (!(await requireArgonUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const [gp, ar, fb] = await Promise.all([
    supabaseAdmin.from("gp_runs").select("username,steps,duration_ms,outcome,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3000),
    supabaseAdmin.from("argon_runs").select("username,prompt,status,duration_ms,cost_usd,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3000),
    supabaseAdmin.from("chat_feedback").select("agent_id,rating,created_at").gte("created_at", since).limit(5000),
  ])
  const gpRows = gp.data ?? [], arRows = ar.data ?? []
  const used = countTools(gpRows.map(r => r.steps)).map(u => ({ ...u, ...parityOf(u.tool), label: PARITY_LABEL[parityOf(u.tool).status] }))
  const fbRows = fb.data ?? []
  const tally = (pred: (a: string) => boolean) => fbRows.filter(r => pred(String(r.agent_id))).reduce((o, r) => (r.rating === 1 ? { ...o, up: o.up + 1 } : r.rating === -1 ? { ...o, down: o.down + 1 } : o), { up: 0, down: 0 })
  const prime = tally(a => a === "argon"), pro = tally(a => PRO_FEEDBACK.includes(a))
  const day = (iso: string) => iso.slice(0, 10)
  const primeDays = new Set(arRows.map(r => day(String(r.created_at)))).size
  const ok = (s: string | null) => s === "done" || s === "executed"
  return NextResponse.json({
    days,
    gauPro: { runs: gpRows.length, users: new Set(gpRows.map(r => r.username)).size, done: gpRows.filter(r => r.outcome === "done").length, medianMs: median(gpRows.map(r => Number(r.duration_ms)).filter(n => n > 0)), up: pro.up, down: pro.down, upRate: upRate(pro.up, pro.down) },
    gauPrime: { runs: arRows.length, users: new Set(arRows.map(r => r.username)).size, done: arRows.filter(r => ok(r.status)).length, medianMs: median(arRows.filter(r => !isAutoRun(r.prompt)).map(r => Number(r.duration_ms)).filter(n => n > 0)), autoRuns: arRows.filter(r => isAutoRun(r.prompt)).length, autoMedianMs: median(arRows.filter(r => isAutoRun(r.prompt)).map(r => Number(r.duration_ms)).filter(n => n > 0)), costUsd: Math.round(arRows.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0) * 100) / 100, up: prime.up, down: prime.down, upRate: upRate(prime.up, prime.down), daysWithRuns: primeDays },
    tools: used,
    criteria: removalCriteria({ primeRuns: arRows.length, daysWithPrimeRuns: primeDays, used, primeUp: prime.up, primeDown: prime.down, proUp: pro.up, proDown: pro.down }),
    errors: [gp.error, ar.error, fb.error].filter(Boolean).map(e => e!.message),
  })
}
