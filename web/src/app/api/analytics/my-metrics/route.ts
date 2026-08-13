import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
import { canWriteTab } from "@/lib/writable-tabs"

const READ_ROLES = ["admin", "creator", "bod"]

// Quarter date range helper
function quarterRange(q: string, year: number) {
  const qNum = parseInt(q.replace("Q", "")) || 3
  const startMonth = (qNum - 1) * 3      // 0-indexed
  const endMonth   = startMonth + 2
  const start = new Date(year, startMonth, 1)
  const end   = new Date(year, endMonth + 1, 0) // last day of last month
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
  return { start: fmt(start), end: fmt(end), months: [startMonth, startMonth+1, startMonth+2] }
}

// GET ?quarter=Q3&year=2026
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = parseInt(req.nextUrl.searchParams.get("year") ?? "2026")
  const { start, end } = quarterRange(quarter, year)

  // ── 1. 3HK % Revenue (gohub_dw) ──────────────────────────────────────────
  let hk3Data: { month: string; hk3_rev: number; total_rev: number }[] = []
  try {
    const rows = await queryAnalytics<{ month: string; hk3_rev: string; total_rev: string }>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', f.fulfiled_date::date), 'YYYY-MM') AS month,
        SUM(CASE WHEN TRIM(f.sku) IN (
          SELECT DISTINCT TRIM(sku) FROM dim_sku
          WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
        ) THEN f.fulfilled_revenue_amount_vnd ELSE 0 END)::bigint AS hk3_rev,
        SUM(f.fulfilled_revenue_amount_vnd)::bigint                AS total_rev
      FROM fact_fulfillment_revenue f
      WHERE f.fulfiled_date IS NOT NULL
        AND f.fulfiled_date::date BETWEEN '${start}' AND '${end}'
        AND f.fulfiled_date::date <= CURRENT_DATE - 1
      GROUP BY 1
      ORDER BY 1
    `)
    hk3Data = rows.map(r => ({
      month:     r.month,
      hk3_rev:   Number(r.hk3_rev)   || 0,
      total_rev: Number(r.total_rev) || 0,
    }))
  } catch {}

  const hk3TotalRev = hk3Data.reduce((a, r) => a + r.total_rev, 0)
  const hk3Rev      = hk3Data.reduce((a, r) => a + r.hk3_rev,   0)
  const hk3Pct      = hk3TotalRev > 0 ? (hk3Rev / hk3TotalRev) * 100 : 0

  // ── 2. SKU Gross Margin (gohub_dw) ────────────────────────────────────────
  let gmData: { month: string; gp: number; rev: number; gm_pct: number }[] = []
  try {
    const gmRows = await queryAnalytics<{ month: string; gp: string; rev: string }>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', fulfiled_date::date), 'YYYY-MM') AS month,
        SUM(gross_profit_vnd)::bigint              AS gp,
        SUM(fulfilled_revenue_amount_vnd)::bigint  AS rev
      FROM fact_fulfillment_revenue
      WHERE fulfiled_date IS NOT NULL
        AND fulfiled_date::date BETWEEN '${start}' AND '${end}'
        AND fulfiled_date::date <= CURRENT_DATE - 1
        AND fulfilled_revenue_amount_vnd > 0
      GROUP BY 1
      ORDER BY 1
    `)
    gmData = gmRows.map(r => {
      const gp  = Number(r.gp)  || 0
      const rev = Number(r.rev) || 0
      return { month: r.month, gp, rev, gm_pct: rev > 0 ? +(gp/rev*100).toFixed(2) : 0 }
    })
  } catch {}

  const gmTotalGP  = gmData.reduce((a, r) => a + r.gp,  0)
  const gmTotalRev = gmData.reduce((a, r) => a + r.rev, 0)
  const gmQtdPct   = gmTotalRev > 0 ? +(gmTotalGP / gmTotalRev * 100).toFixed(2) : 0

  // ── 3. Bé Gấu task count (Supabase) ──────────────────────────────────────
  const startISO = `${start}T00:00:00.000Z`
  const endISO   = `${end}T23:59:59.999Z`

  const { data: allTasks } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, user_email, created_at")
    .eq("event_type", "chat")
    .not("ai_response", "is", null)
    .gte("created_at", startISO)
    .lte("created_at", endISO)

  const tasks     = allTasks ?? []
  const taskTotal = tasks.length
  const taskLark  = tasks.filter(t => (t.user_email ?? "").startsWith("lark:")).length
  const taskWeb   = taskTotal - taskLark

  // Monthly breakdown
  const taskByMonth: Record<string, { total: number; web: number; lark: number }> = {}
  for (const t of tasks) {
    const m = (t.created_at as string).slice(0, 7) // YYYY-MM
    if (!taskByMonth[m]) taskByMonth[m] = { total: 0, web: 0, lark: 0 }
    taskByMonth[m].total++
    if ((t.user_email ?? "").startsWith("lark:")) taskByMonth[m].lark++
    else taskByMonth[m].web++
  }

  return NextResponse.json({
    quarter, year, start, end,
    hk3: {
      pct:       +hk3Pct.toFixed(2),
      hk3_rev:   hk3Rev,
      total_rev: hk3TotalRev,
      monthly:   hk3Data,
    },
    gm: {
      qtd_pct:   gmQtdPct,
      total_gp:  gmTotalGP,
      total_rev: gmTotalRev,
      monthly:   gmData,
      baseline:  36.7,  // T08/2026 baseline từ image
    },
    begau: {
      total:   taskTotal,
      web:     taskWeb,
      lark:    taskLark,
      monthly: taskByMonth,
    },
  })
}
