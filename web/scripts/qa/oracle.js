// G0.3 — Bộ đối chứng SQL độc lập (oracle) cho QA tab Analyst.
// Dùng: dán toàn bộ file này vào console/javascript_tool của một tab đã đăng nhập (phiên Creator) rồi gọi:
//   await QA.run("rev_by_group", { start: "2026-07-01", end: "2026-09-30" })
//   await QA.run("rev_by_group", { start: "...", end: "...", ship: true, internal: true, ops: true })
// SQL ở đây được viết LẠI độc lập, không import hàm lọc của hệ thống. Gửi qua POST /api/analytics/query
// (chỉ SELECT, câu lệnh PHẢI bắt đầu bằng SELECT hoặc WITH; giới hạn 60 lần/phút/người; kết quả cache theo nội dung SQL nên mỗi lần gọi thêm chú thích duy nhất Ở CUỐI).
// Cờ lọc: ship=true → GỒM phí ship (mặc định loại); internal=true → GỒM nhóm INTERNAL-TRANSACTION (mặc định loại);
// ops=true → GỒM khách trong danh sách loại trừ; inactive=true → GỒM khách Inactive; company = "VN" | "US".
;(function () {
  const esc = s => String(s).replace(/'/g, "''")
  const q = {} // tên → (p) => sql

  // ── mảnh WHERE ─────────────────────────────────────────────────────────────
  const F = {
    date: (p, col = "fulfiled_date") => `f.${col}::date BETWEEN '${esc(p.start)}'::date AND '${esc(p.end)}'::date`,
    ship: p => (p.ship ? "" : "AND f.sku <> 'SHIPPINGFEE0'"),
    internal: p => (p.internal ? "" : "AND COALESCE(UPPER(s.group_name),'') <> 'INTERNAL-TRANSACTION'"),
    inactive: p => (p.inactive ? "" : "AND NOT EXISTS (SELECT 1 FROM dim_customer ic WHERE ic.code = TRIM(f.customer_code) AND UPPER(COALESCE(ic.price_list_name,'')) LIKE '%INACTIVE%')"),
    // danh sách loại trừ (tên HOẶC mã) chỉ áp trong nhóm B2B (đúng nghĩa Quarter Report); p.excluded = mảng chuỗi
    ops: p => {
      if (p.ops || !p.excluded || !p.excluded.length) return ""
      const l = p.excluded.map(x => `'${esc(x)}'`).join(",")
      return `AND NOT (UPPER(COALESCE(s.group_name,'')) = 'B2B' AND (TRIM(f.customer_code) IN (${l}) OR EXISTS (SELECT 1 FROM dim_customer cx WHERE cx.code = TRIM(f.customer_code) AND cx.name IN (${l}))))`
    },
    company: p => (p.company && p.company !== "ALL" ? `AND f.company_code = '${esc(p.company)}'` : ""),
    groups: p => (p.anyGroup ? "" : "AND UPPER(COALESCE(s.group_name,'')) IN ('B2B','B2C')"),
  }
  const where = p => [F.date(p, p.dateCol || "fulfiled_date"), F.ship(p), F.internal(p), F.inactive(p), F.ops(p), F.company(p), F.groups(p)].filter(Boolean).join(" ")
  const FROM = p => `FROM ${p.dateCol === "created_date" ? "fact_sales_revenue" : "fact_fulfillment_revenue"} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code`
  const REV = p => (p.dateCol === "created_date" ? "f.sales_revenue_amount_vnd" : "f.fulfilled_revenue_amount_vnd")
  const GP = p => (p.dateCol === "created_date" ? "0" : "f.gross_profit_vnd")
  const QTY = p => (p.dateCol === "created_date" ? "f.quantity" : "f.fulfilled_quantity")
  const V3HK = "(SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL')"

  // ── câu truy vấn ───────────────────────────────────────────────────────────
  q.rev_total = p => `SELECT SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(${QTY(p)}) AS units, COUNT(DISTINCT f.order_code) AS orders ${FROM(p)} WHERE ${where(p)}`
  q.rev_by_group = p => `SELECT UPPER(COALESCE(s.group_name,'')) AS grp, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(${QTY(p)}) AS units, COUNT(DISTINCT f.order_code) AS orders ${FROM(p)} WHERE ${where({ ...p, anyGroup: true })} GROUP BY 1 ORDER BY 1`
  q.rev_by_channel = p => `SELECT TRIM(s.channel_name) AS channel, UPPER(COALESCE(s.group_name,'')) AS grp, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(${QTY(p)}) AS units, COUNT(DISTINCT f.order_code) AS orders ${FROM(p)} WHERE ${where(p)} GROUP BY 1,2 ORDER BY 3 DESC`
  q.rev_by_month_group = p => `SELECT TO_CHAR(f.${p.dateCol || "fulfiled_date"}::date,'YYYY-MM') AS month, UPPER(COALESCE(s.group_name,'')) AS grp, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp FROM ${p.dateCol === "created_date" ? "fact_sales_revenue" : "fact_fulfillment_revenue"} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${where(p)} GROUP BY 1,2 ORDER BY 1,2`
  q.rev_by_day = p => `SELECT f.${p.dateCol || "fulfiled_date"}::date AS d, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp ${FROM(p)} WHERE ${where(p)} GROUP BY 1 ORDER BY 1`
  q.hk3_by_group = p => `SELECT UPPER(COALESCE(s.group_name,'')) AS grp, SUM(${REV(p)}) AS revenue, SUM(CASE WHEN TRIM(f.sku) IN ${V3HK} THEN ${REV(p)} ELSE 0 END) AS hk3 ${FROM(p)} WHERE ${where(p)} GROUP BY 1 ORDER BY 1`
  q.rev_by_customer = p => `SELECT TRIM(f.customer_code) AS code, MAX(c.name) AS name, MAX(c.price_list_name) AS price_list, MAX(c.organization) AS org, MAX(c.sales_pic_code) AS pic, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(CASE WHEN TRIM(f.sku) IN ${V3HK} THEN ${REV(p)} ELSE 0 END) AS hk3 ${FROM(p)} LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code WHERE ${where({ ...p, group: "B2B" })} AND UPPER(COALESCE(s.group_name,'')) = 'B2B' GROUP BY 1 ORDER BY 6 DESC`
  q.rev_by_customer_month = p => `SELECT TRIM(f.customer_code) AS code, TO_CHAR(f.fulfiled_date::date,'YYYY-MM') AS month, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${where(p)} AND UPPER(COALESCE(s.group_name,'')) = 'B2B' GROUP BY 1,2 ORDER BY 1,2`
  q.rev_by_staff = p => `SELECT COALESCE(NULLIF(TRIM(dc.sales_pic_code),''), NULLIF(TRIM(f.staff_code),'')) AS staff, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, COUNT(DISTINCT TRIM(f.customer_code)) AS customers FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code LEFT JOIN dim_customer dc ON TRIM(f.customer_code) = dc.code WHERE ${where(p)} GROUP BY 1 ORDER BY 2 DESC`
  q.rev_by_vendor = p => `SELECT TRIM(k.vendor) AS vendor, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(${QTY(p)}) AS units, COUNT(DISTINCT f.order_code) AS orders ${FROM(p)} LEFT JOIN (SELECT TRIM(sku) AS sku, MAX(vendor) AS vendor FROM dim_sku GROUP BY TRIM(sku)) k ON TRIM(f.sku) = k.sku WHERE ${where(p)} GROUP BY 1 ORDER BY 2 DESC`
  q.rev_by_sku = p => `SELECT TRIM(f.sku) AS sku, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, SUM(${QTY(p)}) AS units, COUNT(DISTINCT f.order_code) AS orders ${FROM(p)} WHERE ${where(p)} GROUP BY 1 ORDER BY 2 DESC LIMIT ${p.limit || 50}`
  // nhóm nội bộ: doanh thu 0, GP âm
  q.internal_group = p => `SELECT SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, COUNT(*) AS rows FROM ${p.dateCol === "created_date" ? "fact_sales_revenue" : "fact_fulfillment_revenue"} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${F.date(p, p.dateCol || "fulfiled_date")} AND UPPER(COALESCE(s.group_name,'')) = 'INTERNAL-TRANSACTION'`
  q.ship_total = p => `SELECT SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp FROM ${p.dateCol === "created_date" ? "fact_sales_revenue" : "fact_fulfillment_revenue"} f WHERE ${F.date(p, p.dateCol || "fulfiled_date")} AND f.sku = 'SHIPPINGFEE0'`
  q.raw_total = p => `SELECT SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp, COUNT(*) AS rows FROM ${p.dateCol === "created_date" ? "fact_sales_revenue" : "fact_fulfillment_revenue"} f WHERE ${F.date(p, p.dateCol || "fulfiled_date")}`
  q.inactive_customers = () => `SELECT code, name, price_list_name FROM dim_customer WHERE UPPER(COALESCE(price_list_name,'')) LIKE '%INACTIVE%' ORDER BY code`
  q.excluded_revenue = p => { const l = (p.excluded || []).map(x => `'${esc(x)}'`).join(",") || "''"; return `SELECT TRIM(f.customer_code) AS code, MAX(c.name) AS name, UPPER(COALESCE(s.group_name,'')) AS grp, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code WHERE ${F.date(p)} AND (TRIM(f.customer_code) IN (${l}) OR c.name IN (${l})) GROUP BY 1,3 ORDER BY 4 DESC` }
  // đơn hàng: số đơn phân biệt + tổng
  q.orders_count = p => `SELECT COUNT(DISTINCT f.order_code) AS orders, SUM(${REV(p)}) AS revenue, SUM(${GP(p)}) AS gp ${FROM(p)} WHERE ${where({ ...p, anyGroup: true, ship: p.ship, internal: p.internal, inactive: true, ops: true })}`
  // nước đích theo SKU (đúng quy tắc độ dài 13/14/15 — viết lại độc lập)
  q.rev_by_dest = p => `SELECT CASE LENGTH(TRIM(f.sku)) WHEN 14 THEN SUBSTRING(TRIM(f.sku),1,3) WHEN 15 THEN SUBSTRING(TRIM(f.sku),2,3) ELSE SUBSTRING(TRIM(f.sku),3,3) END AS dest, SUM(${REV(p)}) AS revenue, SUM(${QTY(p)}) AS units ${FROM(p)} WHERE ${where(p)} GROUP BY 1 ORDER BY 2 DESC LIMIT 30`
  // khách mới/cũ B2B theo ngày đơn đầu tiên toàn lịch sử
  q.b2b_first_order = p => `SELECT SUM(CASE WHEN fo.first_d BETWEEN '${esc(p.start)}'::date AND '${esc(p.end)}'::date THEN 1 ELSE 0 END) AS new_customers, COUNT(*) AS active_customers FROM (SELECT TRIM(f.customer_code) AS code FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${where(p)} AND UPPER(COALESCE(s.group_name,'')) = 'B2B' GROUP BY 1) a JOIN (SELECT TRIM(customer_code) AS code, MIN(fulfiled_date::date) AS first_d FROM fact_fulfillment_revenue GROUP BY 1) fo ON fo.code = a.code`
  // 3HK usage — bundle trong kỳ (khớp NCC)
  q.usage_bundles = p => `WITH pr AS (SELECT iccid, order_code, sku, sku_type, total_data_gb, data_amount_gb FROM fact_data_usage WHERE sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL') AND first_report_date >= '${esc(p.start)}' AND first_report_date <= '${esc(p.end)}' AND NOT (LENGTH(sku)=13 AND SUBSTRING(sku,8,1)='K')), b AS (SELECT iccid, order_code, MAX(sku) AS sku, SUM(total_data_gb) AS used, MAX(data_amount_gb) AS plan FROM pr GROUP BY 1,2) SELECT COUNT(*) AS sims, SUM(used) AS usage_gb, SUM(plan) AS plan_gb FROM b`
  q.usage_by_class = p => `WITH pr AS (SELECT iccid, order_code, sku, sku_type, total_data_gb, data_amount_gb FROM fact_data_usage WHERE sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL') AND first_report_date >= '${esc(p.start)}' AND first_report_date <= '${esc(p.end)}' AND NOT (LENGTH(sku)=13 AND SUBSTRING(sku,8,1)='K')), b AS (SELECT iccid, order_code, MAX(sku) AS sku, MAX(sku_type) AS st, SUM(total_data_gb) AS used, MAX(data_amount_gb) AS plan FROM pr GROUP BY 1,2) SELECT CASE WHEN LENGTH(sku)=13 THEN CASE WHEN SUBSTRING(sku,8,1) IN ('A','B','C','D','E','G','H','L','X') THEN 'Unlimited Data' WHEN SUBSTRING(sku,8,1) IN ('F','Y') THEN 'Fixed Data' WHEN SUBSTRING(sku,8,1) IN ('P','Z','T') THEN 'Daily Data' ELSE st END WHEN UPPER(sku) LIKE '%UNL%' THEN 'Unlimited Data' ELSE st END AS cls, COUNT(*) AS sims, SUM(used) AS usage_gb, SUM(plan) AS plan_gb FROM b GROUP BY 1 ORDER BY 2 DESC`
  q.usage_by_country_month = p => `SELECT country, TO_CHAR(report_date::date,'YYYY-MM') AS month, SUM(data_gb)/1024.0 AS tb FROM data_usage_log WHERE report_date::date BETWEEN '${esc(p.start)}'::date AND '${esc(p.end)}'::date GROUP BY 1,2 ORDER BY 1,2`
  // tồn kho: ngày chụp mới nhất, tổng theo SKU
  q.inventory_latest = p => `SELECT TRIM(i.sku) AS sku, SUM(i.quantity) AS stock, MIN(i.expired_date) AS next_expiry FROM fact_inventory i WHERE i.date = (SELECT MAX(date) FROM fact_inventory) GROUP BY 1 ORDER BY 2 DESC LIMIT ${p.limit || 50}`
  q.inventory_velocity = p => `SELECT TRIM(f.sku) AS sku, SUM(f.fulfilled_quantity) AS qty30 FROM fact_fulfillment_revenue f WHERE f.fulfiled_date::date BETWEEN (CURRENT_DATE - 30) AND (CURRENT_DATE - 1) GROUP BY 1 ORDER BY 2 DESC LIMIT ${p.limit || 50}`
  q.latest_dates = () => `SELECT (SELECT MAX(fulfiled_date)::date FROM fact_fulfillment_revenue) AS fulfilled, (SELECT MAX(created_date)::date FROM fact_sales_revenue) AS created, (SELECT MAX(first_report_date)::date FROM fact_data_usage) AS usage, (SELECT MAX(date)::date FROM fact_inventory) AS inventory`

  // ── bộ chạy ────────────────────────────────────────────────────────────────
  let seq = 0
  async function sqlPost(sql) {
    const res = await fetch("/api/analytics/query", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `${sql} /* qa ${Date.now()}-${++seq} */` }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(`${res.status} ${body.error || ""}`)
    return body
  }
  async function loadExcluded() {
    if (QA.excluded) return QA.excluded
    const j = await fetch("/api/analytics/quarterly-settings").then(r => r.json())
    QA.excluded = j.excludedCustomers || j.excluded_customers || (j.settings && j.settings.excludedCustomers) || []
    return QA.excluded
  }
  const num = v => (v === null || v === undefined ? null : Number(v))
  const QA = {
    queries: q,
    excluded: null,
    sql: (name, p = {}) => q[name](p),
    async run(name, p = {}) {
      if (!q[name]) throw new Error("không có truy vấn " + name + ". Có: " + Object.keys(q).join(", "))
      if (!p.excluded) p = { ...p, excluded: await loadExcluded() }
      const rows = await sqlPost(q[name](p))
      return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, /^(revenue|gp|units|orders|hk3|sims|usage_gb|plan_gb|stock|tb|qty30|customers|new_customers|active_customers|rows)$/.test(k) ? num(v) : v])))
    },
    // so hai số với dung sai (đồng)
    cmp(a, b, tol = 5) { return { a, b, diff: a - b, ok: Math.abs(a - b) <= tol } },
    sum: (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0),
  }
  if (typeof window !== "undefined") window.QA = QA
  if (typeof module !== "undefined") module.exports = QA
})()
