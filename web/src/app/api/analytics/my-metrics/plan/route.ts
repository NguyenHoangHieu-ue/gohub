import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { noCache } from "@/lib/analytics-helpers"
import { isQuarterLocked, prevQuarterLabel, currentQuarterLabel } from "@/lib/okr-helpers"
import { loadMarketData } from "@/lib/market-data"
import { loadQuoteCompare } from "@/lib/quote-sources"
import { buildProposals, analysisQuarterFor } from "@/lib/okr-proposals"
import { loadPlan, pendingQuotes } from "@/lib/okr-plan-server"
import { PLAN_KINDS, type PlanItem } from "@/lib/okr-plan"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]
const validQuarter = (q: string | null) => !!q && /^Q[1-4]-\d{4}$/.test(q)

// GET ?quarter=Q4-2026[&proposals=1] — kế hoạch quý + số tự đo + đánh giá; proposals=1 kèm đề xuất tự động (lần đầu nguội 20–60s).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWriteTab(session.user.username, "my-metrics", READ_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter")
  if (!validQuarter(quarter)) return NextResponse.json({ error: "quarter dạng Q4-2026" }, { status: 400 })
  const bypass = noCache(req)
  try {
    const plan = await loadPlan(quarter!, bypass)

    // Đề xuất tự động: phân tích quý đủ dữ liệu gần nhất + so giá vendor; bỏ đề xuất đã duyệt/bỏ qua (khoá trong scope.proposal).
    let proposals: ReturnType<typeof buildProposals> | undefined
    let analysisQuarter: string | undefined
    if (req.nextUrl.searchParams.get("proposals") === "1") {
      const curQ = currentQuarterLabel()
      analysisQuarter = analysisQuarterFor(quarter!, curQ, prevQuarterLabel)
      const [analysis, compare, current] = await Promise.all([
        loadMarketData(analysisQuarter, "ALL", bypass),
        loadQuoteCompare(analysisQuarter, "ALL", bypass).catch(() => null),
        curQ !== analysisQuarter ? loadMarketData(curQ, "ALL", bypass).catch(() => null) : Promise.resolve(null),
      ])
      const decided = new Set(plan.items.map(i => i.scope?.proposal).filter(Boolean))
      proposals = buildProposals({ analysis, compare, current }).filter(p => !decided.has(p.key))
    }

    return NextResponse.json({
      quarter, start: plan.start, end: plan.end, today: plan.today, analysis_quarter: analysisQuarter, proposals,
      locked: isQuarterLocked(quarter!),
      items: plan.items,
      kinds: PLAN_KINDS,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

type Body = Partial<Omit<PlanItem, "id">> & { id?: string }

function clean(b: Body) {
  const num = (v: unknown) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null
  const out: Record<string, unknown> = {}
  if (b.kind !== undefined) out.kind = b.kind
  if (b.title !== undefined) out.title = String(b.title).trim().slice(0, 300)
  if (b.scope !== undefined) out.scope = { country: b.scope?.country || undefined, vendor: b.scope?.vendor || undefined, proposal: b.scope?.proposal || undefined }
  if (b.baseline !== undefined) out.baseline = num(b.baseline)
  if (b.target !== undefined) out.target = num(b.target)
  if (b.due_date !== undefined) out.due_date = b.due_date || null
  if (b.done !== undefined) out.done = !!b.done
  if (b.dropped !== undefined) out.dropped = !!b.dropped
  if (b.note !== undefined) out.note = b.note?.trim() || null
  if (b.sort !== undefined) out.sort = Number(b.sort) || 0
  return out
}

async function guardWrite() {
  const session = await getServerSession(authOptions)
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)))
    return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { name: session.user.name ?? session.user.username }
}

async function lockedErr(id: string | undefined, quarter: string | undefined) {
  let q = quarter
  if (!q && id) q = (await supabaseAdmin.from("okr_plan_items").select("quarter").eq("id", id).maybeSingle()).data?.quarter
  return q && isQuarterLocked(q) ? NextResponse.json({ error: "Quý này đã đóng — không sửa kế hoạch được nữa." }, { status: 403 }) : null
}

// POST — tạo việc mới { quarter, kind, title, scope, baseline?, target?, due_date?, note? }
export async function POST(req: NextRequest) {
  const g = await guardWrite(); if (g.err) return g.err
  const b = await req.json() as Body
  if (!validQuarter(b.quarter ?? null)) return NextResponse.json({ error: "quarter dạng Q4-2026" }, { status: 400 })
  if (!b.kind || !(b.kind in PLAN_KINDS)) return NextResponse.json({ error: "Loại việc không hợp lệ" }, { status: 400 })
  const missing = PLAN_KINDS[b.kind].needs.filter(n => !b.scope?.[n])
  if (missing.length) return NextResponse.json({ error: `Thiếu ${missing.map(n => n === "country" ? "thị trường" : "vendor").join(", ")}` }, { status: 400 })
  if (b.kind !== "manual" && !b.dropped && (b.target === null || b.target === undefined || (b.target as unknown) === ""))
    return NextResponse.json({ error: "Cần nhập mục tiêu" }, { status: 400 })
  const locked = await lockedErr(undefined, b.quarter); if (locked) return locked

  const row: Record<string, unknown> = { ...clean(b), quarter: b.quarter, title: (b.title?.trim() || PLAN_KINDS[b.kind].label).slice(0, 300), created_by: g.name }
  // Báo giá chờ xử lý không có "số quý trước" — chụp số lúc tạo việc làm mốc để có tiến độ.
  if (b.kind === "quotes_review" && (b.baseline === null || b.baseline === undefined)) row.baseline = await pendingQuotes()
  const { data, error } = await supabaseAdmin.from("okr_plan_items").insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

// PATCH { id, ...fields } — sửa/tick xong/bỏ việc
export async function PATCH(req: NextRequest) {
  const g = await guardWrite(); if (g.err) return g.err
  const b = await req.json() as Body
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const locked = await lockedErr(b.id, undefined); if (locked) return locked
  const { error } = await supabaseAdmin.from("okr_plan_items").update({ ...clean(b), updated_at: new Date().toISOString() }).eq("id", b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= — xoá hẳn (nhập nhầm). Muốn giữ lịch sử thì PATCH dropped=true.
export async function DELETE(req: NextRequest) {
  const g = await guardWrite(); if (g.err) return g.err
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const locked = await lockedErr(id, undefined); if (locked) return locked
  const { error } = await supabaseAdmin.from("okr_plan_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
