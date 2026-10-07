import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { noCache, cachedQuery } from "@/lib/analytics-helpers"
import { queryAnalytics } from "@/lib/analytics-db"
import { isQuarterLocked, parseQuarterLabel } from "@/lib/okr-helpers"
import { loadMarketData } from "@/lib/market-data"
import { PLAN_KINDS, buildMeasureContext, evaluate, measure, newSkuCandidates, planOptions, type PlanItem, type PlanKind } from "@/lib/okr-plan"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]
const MARKET_KINDS: PlanKind[] = ["vendor_share", "market_gm", "market_datapool", "vendor_dependency", "new_markets", "new_skus"]
const validQuarter = (q: string | null) => !!q && /^Q[1-4]-\d{4}$/.test(q)

async function pendingQuotes(): Promise<number | null> {
  const { count, error } = await supabaseAdmin.from("vendor_quotes").select("id", { count: "exact", head: true }).eq("status", "reviewing")
  return error ? null : count ?? 0
}

// GET ?quarter=Q4-2026[&options=1] — việc trong kế hoạch quý + số tự đo + đánh giá tiến độ.
// Doanh thu theo SKU chỉ nạp khi có việc cần đo (hoặc form cần danh sách thị trường/vendor) — lần đầu nguội 20–40s, sau đó cache chung tab Thị trường.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWriteTab(session.user.username, "my-metrics", READ_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter")
  if (!validQuarter(quarter)) return NextResponse.json({ error: "quarter dạng Q4-2026" }, { status: 400 })
  const wantOptions = req.nextUrl.searchParams.get("options") === "1"

  const { data: rows, error } = await supabaseAdmin
    .from("okr_plan_items").select("*").eq("quarter", quarter).order("sort").order("created_at")
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /okr_plan_items/.test(error.message)
    return NextResponse.json({ error: missing ? "Chưa chạy migration v70_okr_plan_items.sql (Supabase) — chạy xong nhớ Reload schema." : error.message }, { status: 500 })
  }
  const items = (rows ?? []) as PlanItem[]

  const needMarket = wantOptions || items.some(i => !i.dropped && MARKET_KINDS.includes(i.kind))
  const needQuotes = items.some(i => !i.dropped && i.kind === "quotes_review")
  const [market, quotes] = await Promise.all([
    needMarket ? loadMarketData(quarter!, "ALL", noCache(req)).catch(() => null) : Promise.resolve(null),
    needQuotes ? pendingQuotes() : Promise.resolve(null),
  ])
  const ctx = buildMeasureContext(market)

  // "SKU mới" = lần đầu có doanh thu: ứng viên (quý này có, quý trước không) còn phải chưa từng bán trước quý trước.
  let soldBefore = new Set<string>()
  if (ctx && market && items.some(i => !i.dropped && i.kind === "new_skus")) {
    const cand = newSkuCandidates(ctx)
    if (cand.length) {
      const rows = await cachedQuery(`okr_plan_sold_before:v1:${quarter}:${market.cutoff}:${cand.length}`, () =>
        queryAnalytics<{ sku: string }>(
          `SELECT DISTINCT TRIM(sku) AS sku FROM fact_fulfillment_revenue
           WHERE TRIM(sku) = ANY($1::text[]) AND fulfiled_date::date < $2::date AND fulfilled_revenue_amount_vnd > 0`,
          [cand, market.prevStart]), 720).catch(() => [] as { sku: string }[])
      soldBefore = new Set(rows.map(r => r.sku))
    }
  }

  const { start, end } = parseQuarterLabel(quarter!)
  const today = market?.cutoff ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const evaluated = items.map(i => ({ ...i, eval: evaluate(i, measure(i, ctx, quotes, soldBefore), start, end, today) }))

  return NextResponse.json({
    quarter, start, end, today,
    locked: isQuarterLocked(quarter!),
    market_loaded: !!market,
    items: evaluated,
    kinds: PLAN_KINDS,
    options: wantOptions ? planOptions(ctx) : undefined,
  })
}

type Body = Partial<Omit<PlanItem, "id">> & { id?: string }

function clean(b: Body) {
  const num = (v: unknown) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null
  const out: Record<string, unknown> = {}
  if (b.kind !== undefined) out.kind = b.kind
  if (b.title !== undefined) out.title = String(b.title).trim().slice(0, 300)
  if (b.scope !== undefined) out.scope = { country: b.scope?.country || undefined, vendor: b.scope?.vendor || undefined }
  if (b.baseline !== undefined) out.baseline = num(b.baseline)
  if (b.target !== undefined) out.target = num(b.target)
  if (b.due_date !== undefined) out.due_date = b.due_date || null
  if (b.done !== undefined) out.done = !!b.done
  if (b.dropped !== undefined) out.dropped = !!b.dropped
  if (b.note !== undefined) out.note = b.note?.trim() || null
  if (b.sort !== undefined) out.sort = Number(b.sort) || 0
  return out
}

async function guardWrite(req: NextRequest) {
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
  const g = await guardWrite(req); if (g.err) return g.err
  const b = await req.json() as Body
  if (!validQuarter(b.quarter ?? null)) return NextResponse.json({ error: "quarter dạng Q4-2026" }, { status: 400 })
  if (!b.kind || !(b.kind in PLAN_KINDS)) return NextResponse.json({ error: "Loại việc không hợp lệ" }, { status: 400 })
  const missing = PLAN_KINDS[b.kind].needs.filter(n => !b.scope?.[n])
  if (missing.length) return NextResponse.json({ error: `Thiếu ${missing.map(n => n === "country" ? "thị trường" : "vendor").join(", ")}` }, { status: 400 })
  if (b.kind !== "manual" && (b.target === null || b.target === undefined || (b.target as unknown) === ""))
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
  const g = await guardWrite(req); if (g.err) return g.err
  const b = await req.json() as Body
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const locked = await lockedErr(b.id, undefined); if (locked) return locked
  const { quarter: _q, ...rest } = b
  const { error } = await supabaseAdmin.from("okr_plan_items").update({ ...clean(rest), updated_at: new Date().toISOString() }).eq("id", b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= — xoá hẳn (nhập nhầm). Muốn giữ lịch sử thì PATCH dropped=true.
export async function DELETE(req: NextRequest) {
  const g = await guardWrite(req); if (g.err) return g.err
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const locked = await lockedErr(id, undefined); if (locked) return locked
  const { error } = await supabaseAdmin.from("okr_plan_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
