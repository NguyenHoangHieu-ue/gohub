import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery, QUERY_TTL_MIN, decodeSkuDestinationCode, getCountryMappings, getMonthsInRange } from "@/lib/analytics-helpers"
import { parseQuarterLabel, prevQuarterLabel, currentQuarterLabel } from "@/lib/okr-helpers"
import { decodeSkuAttributes, classifyService, type MarketData, type MarketCell, type MarketSku } from "@/lib/market-breakdown"

export function parseMarketParams(sp: URLSearchParams): { quarter: string; group: MarketData["group"] } {
  const qp = sp.get("quarter") ?? currentQuarterLabel()
  const g = (sp.get("group") ?? "ALL").toUpperCase()
  return { quarter: /^Q[1-4]-\d{4}$/.test(qp) ? qp : currentQuarterLabel(), group: (g === "B2B" || g === "B2C" ? g : "ALL") as MarketData["group"] }
}

/** Doanh thu theo SKU × tháng (quý này + quý trước) + thuộc tính SKU — dùng chung route market + market/quotes (cùng cache). */
export async function loadMarketData(quarter: string, group: MarketData["group"], bypass = false): Promise<MarketData> {
  const { start: curStart, end: curEnd } = parseQuarterLabel(quarter)
  const prevQuarter = prevQuarterLabel(quarter)
  const { start: prevStart, end: prevEnd } = parseQuarterLabel(prevQuarter)
  return cachedQuery<MarketData>(`market:v1:${quarter}:${group}`, async () => {
      const groupSql = group === "ALL" ? "IN ('B2B','B2C')" : `= '${group}'`
      const rows = await queryAnalytics<{ sku: string; m: string; vendor: string | null; rev: string; gp: string; units: string }>(
        `SELECT TRIM(f.sku) AS sku, TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') AS m, MAX(v.vendor) AS vendor,
                SUM(f.fulfilled_revenue_amount_vnd)::bigint AS rev,
                SUM(f.gross_profit_vnd)::bigint            AS gp,
                SUM(f.fulfilled_quantity)::bigint           AS units
         FROM fact_fulfillment_revenue f
         JOIN dim_order_source s ON s.code = f.order_source_code
         LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) TRIM(sku) AS sku, vendor FROM dim_sku ORDER BY TRIM(sku)) v ON v.sku = TRIM(f.sku)
         WHERE f.fulfiled_date IS NOT NULL
           AND f.fulfiled_date::date BETWEEN $1::date AND $2::date
           AND f.fulfiled_date::date <= CURRENT_DATE - 1
           AND UPPER(s.group_name) ${groupSql}
           AND f.sku != 'SHIPPINGFEE0'
         GROUP BY 1, 2`,
        [prevStart, curEnd],
      )

      const codes = Array.from(new Set(rows.map(r => r.sku)))
      const productCodes = Array.from(new Set(codes.map(c => c.slice(0, 8))))
      const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
      // Catalog Supabase theo lô (không N+1): skus.call + products.local_phone_number → loại dịch vụ.
      const [countryMap, skuRows, prodRows] = await Promise.all([
        getCountryMappings(),
        Promise.all(chunk(codes, 400).map(c => supabaseAdmin.from("skus").select("sku_code,call").in("sku_code", c)))
          .then(rs => rs.flatMap(r => r.data ?? [])),
        Promise.all(chunk(productCodes, 400).map(c => supabaseAdmin.from("products").select("product_code,local_phone_number").in("product_code", c)))
          .then(rs => rs.flatMap(r => r.data ?? [])),
      ])
      const callBy = new Map(skuRows.map(r => [String(r.sku_code), r.call as string | null]))
      const localBy = new Map(prodRows.map(r => [String(r.product_code), r.local_phone_number as string | null]))

      const months = getMonthsInRange(prevStart, curEnd)
      const curMonths = getMonthsInRange(curStart, curEnd)
      const skuIdx = new Map<string, number>()
      const skus: MarketSku[] = []
      const cells: MarketCell[] = []
      for (const r of rows) {
        let si = skuIdx.get(r.sku)
        if (si === undefined) {
          const attrs = decodeSkuAttributes(r.sku)
          const cc = decodeSkuDestinationCode(r.sku)
          const known = callBy.has(r.sku)
          skus.push({
            sku: r.sku, vendor: (r.vendor ?? "").trim() || "(không rõ)",
            country_code: cc, country: r.sku.length === 13 ? (countryMap[cc] ?? cc) : "(mã khác)",
            ...attrs,
            service: classifyService(callBy.get(r.sku), localBy.get(attrs.product_code), known),
          })
          si = skus.length - 1
          skuIdx.set(r.sku, si)
        }
        const mi = months.indexOf(r.m)
        if (mi < 0) continue
        cells.push([si, mi, Number(r.rev) || 0, Number(r.gp) || 0, Number(r.units) || 0])
      }
      return {
        quarter, prevQuarter, curStart, curEnd, prevStart, prevEnd, months, curMonths, group, skus, cells,
        cutoff: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      }
  }, QUERY_TTL_MIN, bypass)
}
