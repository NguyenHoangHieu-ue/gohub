import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin }  from "@/lib/supabase"

export async function runTrackSKUWinRate(args: {
  days_since_created?: number   // lookback (default 90)
  vendor?: string               // filter vendor optional
  win_threshold?: number        // orders to "win" (default 5)
  win_days?: number             // days window (default 14)
}): Promise<any> {
  const lookback       = Math.min(args.days_since_created ?? 90, 365)
  const winOrders      = args.win_threshold ?? 5
  const winDays        = args.win_days ?? 14
  const sinceDate      = new Date()
  sinceDate.setDate(sinceDate.getDate() - lookback)
  const sinceDateStr   = sinceDate.toISOString().slice(0, 10)

  // Lấy SKU mới tạo trong N ngày từ Supabase
  try {
    let q = supabaseAdmin.from("skus")
      .select("sku_code, status, created_at")
      .gte("created_at", sinceDateStr)
      .eq("status", "active")
      .limit(500)
    if (args.vendor) q = q.ilike("sku_code", `%${args.vendor.slice(0, 2).toUpperCase()}%`)
    const { data: newSkus, error: skuErr } = await q
    if (skuErr) return { error: skuErr.message }
    if (!newSkus?.length) return { message: `Không có SKU active nào được tạo trong ${lookback} ngày qua.`, skus: [] }

    // Tính số đơn trong 14 ngày đầu sau khi tạo
    const skuCodes = newSkus.map(s => s.sku_code)
    const skuList  = skuCodes.map(c => `'${c}'`).join(",")

    const rows = await queryAnalytics<{
      sku: string; orders_in_window: string; first_order_date: string
    }>(
      `SELECT
         TRIM(f.sku) as sku,
         COUNT(DISTINCT f.order_code) as orders_in_window,
         MIN(f.fulfiled_date::date) as first_order_date
       FROM fact_fulfillment_revenue f
       WHERE TRIM(f.sku) IN (${skuList})
         AND f.fulfiled_date::date <= CURRENT_DATE - 1
       GROUP BY TRIM(f.sku)`
    )

    const ordersMap = new Map(rows.map(r => [r.sku, { orders: parseInt(r.orders_in_window || "0"), firstOrder: r.first_order_date }]))

    const result = newSkus.map(s => {
      const data         = ordersMap.get(s.sku_code)
      const createdAt    = new Date(s.created_at)
      const ordersTotal  = data?.orders ?? 0
      const firstOrder   = data?.firstOrder
      // Đếm đơn trong 14 ngày đầu từ khi tạo
      const windowEnd    = new Date(createdAt)
      windowEnd.setDate(windowEnd.getDate() + winDays)
      const isInWindow   = !firstOrder || new Date(firstOrder) <= windowEnd
      const ordersInWin  = isInWindow ? ordersTotal : 0
      const agedays      = Math.floor((Date.now() - createdAt.getTime()) / 86400000)
      const won          = ordersInWin >= winOrders
      const pending      = !won && agedays < winDays
      const failed       = !won && agedays >= winDays

      return {
        sku_code:       s.sku_code,
        created_at:     s.created_at.slice(0, 10),
        age_days:       agedays,
        orders_14d:     ordersInWin,
        total_orders:   ordersTotal,
        status:         won ? "WIN" : pending ? "PENDING" : "FAILED",
        win_pct:        Math.min(100, Math.round((ordersInWin / winOrders) * 100)),
      }
    }).sort((a, b) => {
      const order = ["FAILED", "PENDING", "WIN"]
      return order.indexOf(a.status) - order.indexOf(b.status)
    })

    const won     = result.filter(r => r.status === "WIN")
    const pending = result.filter(r => r.status === "PENDING")
    const failed  = result.filter(r => r.status === "FAILED")

    return {
      config:   { lookback_days: lookback, win_threshold: winOrders, win_days: winDays },
      summary:  {
        total: result.length,
        win:   won.length,
        pending: pending.length,
        failed:  failed.length,
        win_rate_pct: result.length ? Math.round((won.length / result.length) * 100) : 0,
      },
      skus: result,
    }
  } catch (e: any) {
    return { error: e.message }
  }
}
