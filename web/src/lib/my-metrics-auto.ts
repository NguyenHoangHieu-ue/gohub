// KPI tự động của My Metrics: %Datapool (3HK + BC) và số task Bé Gấu — tách từ route my-metrics (s227) để "Đánh giá hôm nay"
// + Lark DM hằng ngày dùng chung đúng một công thức. Không đổi logic.
import { queryAnalytics } from "@/lib/analytics-db"
import { quarterRange, OKR_GM_BASELINE, OKR_HK3_BASELINE } from "@/lib/okr-helpers"
import { loadChatEvents, isCountedTask } from "@/lib/task-events"

export async function loadAutoMetrics(quarter: string, year: number) {
  const { start, end } = quarterRange(quarter, year)

  // ── 1. %3HK + Other Datapool Vendor Revenue (gohub_dw) ─────────────────────
  // Đúng theo tên KPI offer letter "%3HK + Other Datapool Vendor" — gộp CẢ 3HK Datapool
  // VÀ BC Datapool (vendor "BC Datapool" trong dim_sku, xác nhận qua SQL Explorer với Hiếu
  // 2026-08-27), không chỉ riêng 3HK như bản v1. Tách riêng 2 cột (Hiếu yêu cầu xem breakdown
  // từng vendor) — %KPI vẫn tính trên tổng cả 2. Chỉ áp DUY NHẤT ở My Metrics — KPI "3HK
  // Contribution %" ở BOD/Dashboard/Quarterly là chỉ số khác (chỉ 3HK), KHÔNG đổi theo đây.
  let hk3Data: { month: string; hk3_rev: number; bc_rev: number; total_rev: number }[] = []
  try {
    // Dùng 1 CASE duy nhất trên vendor ĐÃ DEDUPE (DISTINCT ON) thay vì 2 IN-subquery độc lập: nếu
    // dim_sku có dòng trùng SKU với vendor khác nhau (dữ liệu lỗi — cùng lý do sku-scan/datapool-detail
    // phải DISTINCT ON), 2 IN-subquery riêng biệt sẽ đếm cùng 1 đồng doanh thu vào CẢ hk3_rev lẫn
    // bc_rev (không loại trừ lẫn nhau) → thổi phồng %3HK+Datapool. 1 CASE trên vendor đã chọn ĐÚNG 1
    // dòng/SKU loại trừ khả năng này by construction.
    const rows = await queryAnalytics<{ month: string; hk3_rev: string; bc_rev: string; total_rev: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', f.fulfiled_date::date), 'YYYY-MM') AS month,
         SUM(CASE WHEN v.vendor_norm = '3HKDATAPOOL' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END)::bigint AS hk3_rev,
         SUM(CASE WHEN v.vendor_norm LIKE 'BCDATAPOOL%' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END)::bigint AS bc_rev,
         SUM(f.fulfilled_revenue_amount_vnd)::bigint AS total_rev
       FROM fact_fulfillment_revenue f
       LEFT JOIN (
         SELECT DISTINCT ON (TRIM(sku)) TRIM(sku) AS sku, REPLACE(UPPER(TRIM(vendor)),' ','') AS vendor_norm
         FROM dim_sku ORDER BY TRIM(sku)
       ) v ON TRIM(f.sku) = v.sku
       WHERE f.fulfiled_date IS NOT NULL
         AND f.fulfiled_date::date BETWEEN $1::date AND $2::date
         AND f.fulfiled_date::date <= CURRENT_DATE - 1
       GROUP BY 1
       ORDER BY 1`,
      [start, end]
    )
    hk3Data = rows.map(r => ({
      month:     r.month,
      hk3_rev:   Number(r.hk3_rev)   || 0,
      bc_rev:    Number(r.bc_rev)    || 0,
      total_rev: Number(r.total_rev) || 0,
    }))
  } catch {}

  const hk3TotalRev  = hk3Data.reduce((a, r) => a + r.total_rev, 0)
  const hk3OnlyRev    = hk3Data.reduce((a, r) => a + r.hk3_rev,   0)
  const bcOnlyRev     = hk3Data.reduce((a, r) => a + r.bc_rev,    0)
  const hk3Rev        = hk3OnlyRev + bcOnlyRev
  const hk3Pct        = hk3TotalRev > 0 ? (hk3Rev / hk3TotalRev) * 100 : 0

  // ── 2. SKU Gross Margin — blended TOÀN CÔNG TY (gohub_dw) ─────────────────
  // ⚠️ Đây là số MACRO (bị nhiễu bởi channel-mix/khuyến mãi), KHÔNG PHẢI KPI chính —
  // chỉ hiển thị làm CONTEXT. Số KPI chính = /api/analytics/my-metrics/sku-tags (verified per-SKU).
  let gmData: { month: string; gp: number; rev: number; gm_pct: number }[] = []
  try {
    const gmRows = await queryAnalytics<{ month: string; gp: string; rev: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', fulfiled_date::date), 'YYYY-MM') AS month,
         SUM(gross_profit_vnd)::bigint              AS gp,
         SUM(fulfilled_revenue_amount_vnd)::bigint  AS rev
       FROM fact_fulfillment_revenue
       WHERE fulfiled_date IS NOT NULL
         AND fulfiled_date::date BETWEEN $1::date AND $2::date
         AND fulfiled_date::date <= CURRENT_DATE - 1
         AND fulfilled_revenue_amount_vnd > 0
       GROUP BY 1
       ORDER BY 1`,
      [start, end]
    )
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
  const { rows: events } = await loadChatEvents("id, user_email, user_role, created_at, ai_response, used_db_tool", start, end)
  // Task "tính KPI" (s195+18-B, đổi định nghĩa) = ĐÃ THẬT SỰ gọi tool đọc dữ liệu DB (executeSQL/
  // querySupabase/queryProduct/listSupabaseTables — xem DB_TASK_TOOLS trong okr-helpers.ts), KHÔNG
  // còn chỉ dựa vào độ dài response (trước đây trả lời chay/chào hỏi dài cũng bị tính nhầm là task).
  // Giữ thêm điều kiện độ dài làm lưới an toàn phụ (loại nốt trường hợp lỗi cụt hiếm gặp).
  const tasks     = events.filter(isCountedTask)
  const taskTotal = tasks.length
  const taskLark  = tasks.filter(t => (t.user_email ?? "").startsWith("lark:")).length
  const taskWeb   = taskTotal - taskLark
  const excludedShort = events.length - tasks.length

  // Monthly breakdown
  const taskByMonth: Record<string, { total: number; web: number; lark: number }> = {}
  for (const t of tasks) {
    const m = (t.created_at as string).slice(0, 7) // YYYY-MM
    if (!taskByMonth[m]) taskByMonth[m] = { total: 0, web: 0, lark: 0 }
    taskByMonth[m].total++
    if ((t.user_email ?? "").startsWith("lark:")) taskByMonth[m].lark++
    else taskByMonth[m].web++
  }

  // Breakdown theo phòng ban/role sử dụng (khớp câu offer letter: Sales/CSKH/Ops...)
  const taskByRole: Record<string, number> = {}
  for (const t of tasks) {
    const r = (t.user_role as string) || "khác"
    taskByRole[r] = (taskByRole[r] || 0) + 1
  }

  return {
    quarter, year, start, end,
    data_cutoff: "gohub_dw cập nhật tới CURRENT_DATE - 1 (ETL chạy ~08:00 ICT hôm sau)",
    generated_at: new Date().toISOString(),
    hk3: {
      pct:         +hk3Pct.toFixed(2),
      hk3_rev:     hk3Rev,          // = hk3_only_rev + bc_only_rev (tổng datapool, dùng tính %)
      hk3_only_rev: hk3OnlyRev,     // riêng 3HK Datapool
      bc_only_rev:  bcOnlyRev,      // riêng BC Datapool
      total_rev:   hk3TotalRev,
      monthly:     hk3Data,
      baseline:    OKR_HK3_BASELINE,
    },
    gm: {
      qtd_pct:   gmQtdPct,
      total_gp:  gmTotalGP,
      total_rev: gmTotalRev,
      monthly:   gmData,
      baseline:  OKR_GM_BASELINE,
    },
    begau: {
      total:   taskTotal,
      web:     taskWeb,
      lark:    taskLark,
      excluded_short: excludedShort,
      by_role: taskByRole,
      monthly: taskByMonth,
    },
  }
}
