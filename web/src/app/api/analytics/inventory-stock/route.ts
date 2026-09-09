import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cachedAnalyticsQuery } from "@/lib/analytics-helpers"
import { mondayOf } from "@/lib/inventory-plan"
import { fetchInventoryAlertThresholds, type InventoryAlertThresholds } from "@/lib/inventory-thresholds"

// Tồn kho thời gian thực — nguồn fact_inventory (Sapo sync, gohub_dw), thay thế phần "Số tồn thực tế" OPS
// trước phải gõ tay hàng tuần trong Kế hoạch nhập hàng. Xem docs/wiki/system/tabs/analytics-fulfillment.md.
//
// s195+11 (feedback team OPS, 2026-09-09): tách theo Kho×Lô (batch — cột có trong DB nhưng ETL Sapo CHƯA
// sync, luôn NULL tại thời điểm này — code đã sẵn sàng, tự hiện khi ETL bổ sung), tách VN/US theo
// company_code THẬT (JOIN fact_fulfillment_revenue, KHÔNG đoán qua ký tự đầu SKU — đã verify trực tiếp
// trên staging: SKU cùng prefix "E" có thể thuộc CẢ VN lẫn US), tách SIM/eSIM theo dim_sku.type_of_sim,
// thêm cột "Bán dự kiến (tuần trước)", đổi cảnh báo sang 4 mức ngưỡng ngày tồn kho OPS tự cấu hình
// (xem lib/inventory-thresholds.ts + /analytics/settings).
// KHÔNG làm được: mã lô kèm "ngày nhập kho của lô" (cột không tồn tại trong fact_inventory — chỉ có
// snapshot `date` + `expired_date`) và ICCID (không có bảng tồn kho per-unit nào trong gohub_dw — ICCID
// chỉ có ở fact_data_usage/data_usage_log, dùng cho usage 3HK, khác hoàn toàn tồn kho vật lý/eSIM). Cần
// Hiếu hỏi Sapo/ETL bổ sung nguồn trước khi làm tiếp 2 mục này.

const READ_ROLES = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]

interface WarehouseRow {
  sku: string; warehouse_code: string; warehouse_name: string | null; warehouse_type: string | null
  batch: string | null; quantity: string; expired_date: string | null
}
interface SkuMetaRow { sku: string; vendor: string | null; category_name: string | null; type_of_sim: string | null }
interface VelocityRow { sku: string; qty30d: string }
interface LastWeekRow { sku: string; qty: string }
interface CompanyRow { sku: string; company_code: string | null; n: string }
interface TrendRow { date: string; total_qty: string }

type AlertLevel = "critical" | "warning" | "normal" | "safe" | "none"

function alertFor(totalQty: number, velocityPerDay: number, daysOfCover: number | null, t: InventoryAlertThresholds): AlertLevel {
  if (totalQty <= 0) return velocityPerDay > 0 ? "critical" : "none"
  if (daysOfCover == null) return "none"
  if (daysOfCover < t.warningDays) return "critical"
  if (daysOfCover < t.normalDays) return "warning"
  if (daysOfCover < t.safeDays) return "normal"
  return "safe"
}

// SKU chưa từng bán (không có fact_fulfillment_revenue) → suy company_code từ ký tự đầu SKU, quy ước đã
// dùng ở import_inventory_plan.mjs: VN = digit 1-6, US = A-E. CHỈ dùng khi không tra được company_code thật.
function guessMarketFromPrefix(sku: string): "VN" | "US" | null {
  const c = sku.trim()[0]?.toUpperCase()
  if (!c) return null
  if (/[1-6]/.test(c)) return "VN"
  if (/[A-E]/.test(c)) return "US"
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const thresholds = await fetchInventoryAlertThresholds()

    const [asOfRows, whRows, trendRows] = await Promise.all([
      cachedAnalyticsQuery<{ d: string }>(`SELECT MAX(date)::text AS d FROM fact_inventory`),
      cachedAnalyticsQuery<WarehouseRow>(`
        SELECT TRIM(f.sku) AS sku, f.warehouse AS warehouse_code, w.name AS warehouse_name, w.type AS warehouse_type,
               f.batch AS batch, f.quantity::text AS quantity, f.expired_date::text AS expired_date
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
    const skuList = skuCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")

    // Tuần liền trước (Thứ Hai → Chủ Nhật) so với hôm nay, cho cột "Bán dự kiến (tuần trước)".
    const lastMonday = new Date(mondayOf(new Date()))
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7)
    const lastSunday = new Date(lastMonday)
    lastSunday.setUTCDate(lastSunday.getUTCDate() + 6)
    const toYmd = (d: Date) => d.toISOString().slice(0, 10)

    const [metaRows, velocityRows, lastWeekRows, companyRows] = await Promise.all([
      skuCodes.length ? cachedAnalyticsQuery<SkuMetaRow>(`
        SELECT TRIM(sku) AS sku, vendor, category_name, type_of_sim
        FROM dim_sku
        WHERE TRIM(sku) IN (${skuList})
      `) : Promise.resolve([] as SkuMetaRow[]),
      skuCodes.length ? cachedAnalyticsQuery<VelocityRow>(`
        SELECT TRIM(sku) AS sku, SUM(fulfilled_quantity)::text AS qty30d
        FROM fact_fulfillment_revenue
        WHERE TRIM(sku) IN (${skuList})
          AND fulfiled_date::date >= CURRENT_DATE - 30 AND fulfiled_date::date <= CURRENT_DATE - 1
        GROUP BY TRIM(sku)
      `) : Promise.resolve([] as VelocityRow[]),
      skuCodes.length ? cachedAnalyticsQuery<LastWeekRow>(`
        SELECT TRIM(sku) AS sku, SUM(fulfilled_quantity)::text AS qty
        FROM fact_fulfillment_revenue
        WHERE TRIM(sku) IN (${skuList})
          AND fulfiled_date::date BETWEEN '${toYmd(lastMonday)}' AND '${toYmd(lastSunday)}'
        GROUP BY TRIM(sku)
      `) : Promise.resolve([] as LastWeekRow[]),
      skuCodes.length ? cachedAnalyticsQuery<CompanyRow>(`
        SELECT TRIM(sku) AS sku, company_code, COUNT(*)::text AS n
        FROM fact_fulfillment_revenue
        WHERE TRIM(sku) IN (${skuList}) AND company_code IS NOT NULL
        GROUP BY TRIM(sku), company_code
      `) : Promise.resolve([] as CompanyRow[]),
    ])

    const metaBySku = new Map(metaRows.map(m => [m.sku, m]))
    const velocityBySku = new Map(velocityRows.map(v => [v.sku, (Number(v.qty30d) || 0) / 30]))
    const lastWeekBySku = new Map(lastWeekRows.map(v => [v.sku, Math.round(Number(v.qty) || 0)]))

    // Market thật = company_code xuất hiện NHIỀU nhất trong lịch sử bán của SKU đó (đề phòng dữ liệu lẫn).
    const companyCountBySku = new Map<string, Map<string, number>>()
    for (const r of companyRows) {
      if (!r.company_code) continue
      const m = companyCountBySku.get(r.sku) ?? new Map<string, number>()
      m.set(r.company_code, Number(r.n) || 0)
      companyCountBySku.set(r.sku, m)
    }
    const marketBySku = (sku: string): "VN" | "US" | null => {
      const counts = companyCountBySku.get(sku)
      if (counts && counts.size > 0) {
        const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        if (best === "VN" || best === "US") return best
      }
      return guessMarketFromPrefix(sku)
    }

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
      // Group theo kho×lô — hiện batch luôn null (ETL chưa sync) nên collapse về 1 dòng/kho như trước;
      // khi ETL bổ sung batch, tự tách nhiều dòng/kho mà không cần đổi code.
      const lotMap = new Map<string, { code: string; name: string; type: string; batch: string | null; quantity: number; expiredDate: string | null }>()
      for (const r of rows) {
        const qty = Number(r.quantity) || 0
        if (qty <= 0) continue
        const key = `${r.warehouse_code}::${r.batch ?? ""}::${r.expired_date ?? ""}`
        const ex = lotMap.get(key)
        if (ex) ex.quantity += qty
        else lotMap.set(key, {
          code: r.warehouse_code, name: r.warehouse_name ?? r.warehouse_code, type: r.warehouse_type ?? "",
          batch: r.batch, quantity: qty, expiredDate: r.expired_date,
        })
      }
      const warehouses = Array.from(lotMap.values()).sort((a, b) => b.quantity - a.quantity)
      const nearestExpiry = warehouses
        .map(w => w.expiredDate).filter((d): d is string => !!d)
        .sort()[0] ?? null
      const meta = metaBySku.get(sku)
      const velocityPerDay = velocityBySku.get(sku) ?? 0
      const daysOfCover = velocityPerDay > 0 ? Math.round((totalQty / velocityPerDay) * 10) / 10 : null
      const daysToExpiry = daysUntil(nearestExpiry)
      return {
        sku, vendor: meta?.vendor ?? null, productName: meta?.category_name ?? null,
        simType: meta?.type_of_sim ?? null, market: marketBySku(sku),
        totalQty, warehouses, nearestExpiry, daysToExpiry,
        velocityPerDay: Math.round(velocityPerDay * 10) / 10, daysOfCover,
        lastWeekSales: lastWeekBySku.get(sku) ?? 0,
        alert: alertFor(totalQty, velocityPerDay, daysOfCover, thresholds),
      }
    }).sort((a, b) => {
      const order: Record<AlertLevel, number> = { critical: 0, warning: 1, normal: 2, safe: 3, none: 4 }
      if (order[a.alert] !== order[b.alert]) return order[a.alert] - order[b.alert]
      return b.totalQty - a.totalQty
    })

    const trend = trendRows.map(r => ({ date: r.date, totalQty: Math.round(Number(r.total_qty) || 0) }))

    return NextResponse.json({
      asOfDate, skus, trend, thresholds,
      warehouses: Array.from(warehousesSeen.values()).sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err: any) {
    console.error("[inventory-stock]", err.message)
    return NextResponse.json({ error: "Hiếu đang fix, vui lòng đợi" }, { status: 500 })
  }
}
