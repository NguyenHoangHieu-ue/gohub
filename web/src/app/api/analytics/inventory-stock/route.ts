import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cachedAnalyticsQuery } from "@/lib/analytics-helpers"

// Tồn kho thời gian thực — nguồn fact_inventory (Sapo sync, gohub_dw), thay thế phần "Số tồn thực tế" OPS
// trước phải gõ tay hàng tuần trong Kế hoạch nhập hàng. Xem docs/wiki/system/tabs/analytics-fulfillment.md.
// Đối chiếu 2 file Lark OPS đang dùng ("INVENTORY REPORT 2026" — sheet SIM + Draft v2 raw Sapo):
//   - SKU-level: Stock, hạn dùng gần nhất, tốc độ bán 15/30 ngày, ước tính ngày còn hàng.
//   - Breakdown theo kho (dim_warehouse) — OPS trước phải tự copy 1 tab mới mỗi vài ngày để lưu lịch sử;
//     fact_inventory là snapshot theo NGÀY sẵn trong DB nên trend vẽ trực tiếp, không cần copy tay nữa.

const READ_ROLES = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]

interface WarehouseRow { sku: string; warehouse_code: string; warehouse_name: string | null; warehouse_type: string | null; quantity: string; expired_date: string | null }
interface SkuMetaRow { sku: string; vendor: string | null; product_name: string | null; category_name: string | null }
interface VelocityRow { sku: string; qty30d: string }
interface TrendRow { date: string; total_qty: string }

type AlertLevel = "critical" | "warning" | "ok" | "none"

function alertFor(totalQty: number, velocityPerDay: number, daysOfCover: number | null, daysToExpiry: number | null): AlertLevel {
  if (daysOfCover != null && daysOfCover < 7) return "critical"
  if (daysToExpiry != null && daysToExpiry < 14) return "critical"
  if (totalQty <= 0) return velocityPerDay > 0 ? "critical" : "none"
  if (daysOfCover != null && daysOfCover < 14) return "warning"
  if (daysToExpiry != null && daysToExpiry < 30) return "warning"
  return "ok"
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const [asOfRows, whRows, trendRows] = await Promise.all([
      cachedAnalyticsQuery<{ d: string }>(`SELECT MAX(date)::text AS d FROM fact_inventory`),
      cachedAnalyticsQuery<WarehouseRow>(`
        SELECT TRIM(f.sku) AS sku, f.warehouse AS warehouse_code, w.name AS warehouse_name, w.type AS warehouse_type,
               f.quantity::text AS quantity, f.expired_date::text AS expired_date
        FROM fact_inventory f
        LEFT JOIN dim_warehouse w ON f.warehouse = w.code
        WHERE f.date = (SELECT MAX(date) FROM fact_inventory)
      `),
      cachedAnalyticsQuery<TrendRow>(`
        SELECT date::text AS date, SUM(quantity)::text AS total_qty
        FROM fact_inventory
        WHERE date >= CURRENT_DATE - 30
        GROUP BY date ORDER BY date
      `),
    ])

    const asOfDate = asOfRows[0]?.d ?? null
    const skuCodes = Array.from(new Set(whRows.map(r => r.sku)))

    const [metaRows, velocityRows] = await Promise.all([
      skuCodes.length ? cachedAnalyticsQuery<SkuMetaRow>(`
        SELECT TRIM(sku) AS sku, vendor, type_of_sim AS product_name, category_name
        FROM dim_sku
        WHERE TRIM(sku) IN (${skuCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")})
      `) : Promise.resolve([] as SkuMetaRow[]),
      skuCodes.length ? cachedAnalyticsQuery<VelocityRow>(`
        SELECT TRIM(sku) AS sku, SUM(fulfilled_quantity)::text AS qty30d
        FROM fact_fulfillment_revenue
        WHERE TRIM(sku) IN (${skuCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")})
          AND fulfiled_date::date >= CURRENT_DATE - 30 AND fulfiled_date::date <= CURRENT_DATE - 1
        GROUP BY TRIM(sku)
      `) : Promise.resolve([] as VelocityRow[]),
    ])

    const metaBySku = new Map(metaRows.map(m => [m.sku, m]))
    const velocityBySku = new Map(velocityRows.map(v => [v.sku, (Number(v.qty30d) || 0) / 30]))

    const warehousesSeen = new Map<string, { code: string; name: string; type: string }>()
    const bySku = new Map<string, WarehouseRow[]>()
    for (const r of whRows) {
      if (!bySku.has(r.sku)) bySku.set(r.sku, [])
      bySku.get(r.sku)!.push(r)
      if (r.warehouse_code && !warehousesSeen.has(r.warehouse_code)) {
        warehousesSeen.set(r.warehouse_code, { code: r.warehouse_code, name: r.warehouse_name ?? r.warehouse_code, type: r.warehouse_type ?? "" })
      }
    }

    const today = new Date()
    const daysUntil = (dateStr: string | null): number | null => {
      if (!dateStr) return null
      const d = new Date(dateStr)
      return Math.round((d.getTime() - today.getTime()) / 86400000)
    }

    const skus = Array.from(bySku.entries()).map(([sku, rows]) => {
      const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
      const warehouses = rows
        .filter(r => (Number(r.quantity) || 0) > 0)
        .map(r => ({
          code: r.warehouse_code, name: r.warehouse_name ?? r.warehouse_code, type: r.warehouse_type ?? "",
          quantity: Number(r.quantity) || 0, expiredDate: r.expired_date,
        }))
        .sort((a, b) => b.quantity - a.quantity)
      const nearestExpiry = warehouses
        .map(w => w.expiredDate).filter((d): d is string => !!d)
        .sort()[0] ?? null
      const meta = metaBySku.get(sku)
      const velocityPerDay = velocityBySku.get(sku) ?? 0
      const daysOfCover = velocityPerDay > 0 ? Math.round((totalQty / velocityPerDay) * 10) / 10 : null
      const daysToExpiry = daysUntil(nearestExpiry)
      return {
        sku, vendor: meta?.vendor ?? null, productName: meta?.product_name ?? null, category: meta?.category_name ?? null,
        totalQty, warehouses, nearestExpiry, daysToExpiry,
        velocityPerDay: Math.round(velocityPerDay * 10) / 10, daysOfCover,
        alert: alertFor(totalQty, velocityPerDay, daysOfCover, daysToExpiry),
      }
    }).sort((a, b) => {
      const order: Record<AlertLevel, number> = { critical: 0, warning: 1, ok: 2, none: 3 }
      if (order[a.alert] !== order[b.alert]) return order[a.alert] - order[b.alert]
      return b.totalQty - a.totalQty
    })

    const trend = trendRows.map(r => ({ date: r.date, totalQty: Math.round(Number(r.total_qty) || 0) }))

    return NextResponse.json({
      asOfDate, skus, trend,
      warehouses: Array.from(warehousesSeen.values()).sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err: any) {
    console.error("[inventory-stock]", err.message)
    return NextResponse.json({ error: "Hiếu đang fix, vui lòng đợi" }, { status: 500 })
  }
}
