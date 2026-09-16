import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { detectAnomalies, type DailyPoint } from "@/lib/data-health-anomaly"

export const maxDuration = 30

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role !== "creator") throw new Error("Creator only")
  return session
}

export async function GET(req: NextRequest) {
  try {
    await requireCreator()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days") || 30)
  const days = Math.min(60, Math.max(14, Number.isFinite(daysParam) ? daysParam : 30))

  const data = await cachedQuery(
    `data-health:anomalies:v1:${days}`,
    async () => {
      // 1 query GROUP BY ngày × nhóm — không loop theo ngày (đúng rule N+1).
      const rows = await queryAnalytics<{ d: string; grp: string; revenue: string; orders: string }>(`
        SELECT f.fulfiled_date::date::text AS d,
               CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN 'B2B'
                    WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN 'B2C'
                    ELSE 'Khác' END AS grp,
               SUM(f.fulfilled_revenue_amount_vnd) AS revenue,
               COUNT(DISTINCT f.order_code) AS orders
        FROM fact_fulfillment_revenue f
        LEFT JOIN dim_order_source s ON f.order_source_code = s.code
        WHERE f.fulfiled_date::date >= CURRENT_DATE - ${days + 8}
          AND f.fulfiled_date::date <= CURRENT_DATE - 1
          ${shipFilter(false)} ${internalOpsFilter(false)}
        GROUP BY 1, 2
        ORDER BY 1
      `)

      const byGroup: Record<string, DailyPoint[]> = { Tổng: [], B2B: [], B2C: [] }
      const byDate = new Map<string, { B2B: number; B2C: number; Khác: number }>()
      for (const r of rows) {
        const d = byDate.get(r.d) ?? { B2B: 0, B2C: 0, Khác: 0 }
        d[r.grp as "B2B" | "B2C" | "Khác"] = Number(r.revenue) || 0
        byDate.set(r.d, d)
      }
      const sortedDates = [...byDate.keys()].sort()
      for (const d of sortedDates) {
        const v = byDate.get(d)!
        byGroup["Tổng"].push({ date: d, value: v.B2B + v.B2C + v.Khác })
        byGroup["B2B"].push({ date: d, value: v.B2B })
        byGroup["B2C"].push({ date: d, value: v.B2C })
      }

      // Chỉ trả về `days` ngày gần nhất hiển thị (phần đầu chỉ dùng làm baseline).
      const trim = (arr: DailyPoint[]) => detectAnomalies(arr).slice(-days)
      return {
        series: {
          "Tổng": trim(byGroup["Tổng"]),
          "B2B": trim(byGroup["B2B"]),
          "B2C": trim(byGroup["B2C"]),
        },
      }
    },
    15,
  )

  return NextResponse.json({ checkedAt: new Date().toISOString(), days, ...data })
}
