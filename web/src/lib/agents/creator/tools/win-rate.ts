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

    // VALUES CTE với window_end riêng từng SKU → đếm ĐÚNG đơn trong 14 ngày đầu từ ngày tạo
    const valuesList = newSkus.map(s => {
      const windowEnd = new Date(s.created_at)
      windowEnd.setDate(windowEnd.getDate() + winDays)
      return `('${s.sku_code}','${windowEnd.toISOString().slice(0, 10)}'::date)`
    }).join(",")

    const rows = await queryAnalytics<{
      sku: string; vendor: string; orders_in_window: string; orders_total: string
    }>(
      `WITH sku_windows(sku_code, window_end) AS (VALUES ${valuesList})
       SELECT
         TRIM(f.sku) as sku,
         MIN(TRIM(sk.vendor)) as vendor,
         COUNT(DISTINCT CASE WHEN f.fulfiled_date::date <= sw.window_end THEN f.order_code END) as orders_in_window,
         COUNT(DISTINCT f.order_code) as orders_total
       FROM fact_fulfillment_revenue f
       JOIN sku_windows sw ON TRIM(f.sku) = sw.sku_code
       LEFT JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)
       WHERE TRIM(f.sku) IN (${skuList})
         AND f.fulfiled_date::date <= CURRENT_DATE - 1
       GROUP BY TRIM(f.sku)`
    )

    const ordersMap = new Map(rows.map(r => [r.sku, {
      vendor:         r.vendor || "",
      ordersInWindow: parseInt(r.orders_in_window || "0"),
      ordersTotal:    parseInt(r.orders_total    || "0"),
    }]))

    const result = newSkus.map(s => {
      const data        = ordersMap.get(s.sku_code)
      const createdAt   = new Date(s.created_at)
      const ordersInWin = data?.ordersInWindow ?? 0
      const ordersTotal = data?.ordersTotal    ?? 0
      const agedays     = Math.floor((Date.now() - createdAt.getTime()) / 86400000)
      const won         = ordersInWin >= winOrders
      const pending     = !won && agedays < winDays
      const failed      = !won && agedays >= winDays
      const winDeadline = new Date(createdAt.getTime() + winDays * 86400000).toISOString().slice(0, 10)

      return {
        sku_code:       s.sku_code,
        vendor:         data?.vendor ?? "",
        created_at:     s.created_at.slice(0, 10),
        win_deadline:   winDeadline,
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

    // Filter vendor sau khi join dim_sku (dùng tên thực thay vì sku_code prefix)
    const filtered = args.vendor
      ? result.filter(s => s.vendor.toUpperCase().includes(args.vendor!.toUpperCase()))
      : result

    const won     = filtered.filter(r => r.status === "WIN")
    const pending = filtered.filter(r => r.status === "PENDING")
    const failed  = filtered.filter(r => r.status === "FAILED")

    return {
      config:   { lookback_days: lookback, win_threshold: winOrders, win_days: winDays },
      summary:  {
        total: filtered.length,
        win:   won.length,
        pending: pending.length,
        failed:  failed.length,
        win_rate_pct: filtered.length ? Math.round((won.length / filtered.length) * 100) : 0,
      },
      skus: filtered,
    }
  } catch (e: any) {
    return { error: e.message }
  }
}
