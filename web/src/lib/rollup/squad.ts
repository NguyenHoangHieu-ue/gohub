import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của khối cachedQuery trong /api/analytics/squad-progress: doanh thu B2B theo khách (tách tháng), danh sách PIC, doanh thu quý trước theo khách.
// Đường thô luôn bỏ SHIPPINGFEE0, chỉ nhóm B2B, loại INACTIVE và danh sách loại trừ; công ty lọc theo companyCode.
export type SquadCustRow = Record<string, string>
export interface SquadPic { code: string; name: string }
export interface SquadRaw { custRows: SquadCustRow[]; picRows: SquadPic[]; prevCustRevRows: { customer_code: string; revenue: string }[] }
export interface SquadArgs { companyCode: string; excludedCustomers: string[]; months: string[]; qStart: string; qEnd: string; prevQStartDate: string; prevQEndDate: string }

const n = (v: unknown) => String(Number(v ?? 0))
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
// Đường thô ORDER BY name theo collation Postgres, SQLite so nhị phân → sắp lại bằng Intl.Collator (xem b2bcust.ts).
const collator = new Intl.Collator("en")

export async function fetchSquadRollup(a: SquadArgs): Promise<SquadRaw> {
  const f = custFilterSql({ companyCode: a.companyCode, includeShip: false, includeInternalOps: true, inactive: true, excludedCustomers: a.excludedCustomers })
  const monthCols = a.months.map((m, i) => `
      SUM(CASE WHEN substr(r.day, 1, 7) = '${m}' THEN r.revenue_vnd ELSE 0 END) AS rev_m${i},
      SUM(CASE WHEN substr(r.day, 1, 7) = '${m}' THEN r.gp_vnd ELSE 0 END) AS gm_m${i},
      SUM(CASE WHEN substr(r.day, 1, 7) = '${m}' THEN r.hk3_rev_vnd ELSE 0 END) AS hk3_m${i}`).join(",")
  const [cur, pics, prev] = await Promise.all([
    rq(`SELECT r.customer AS customer_code, COALESCE(c.name, r.customer) AS customer_name, TRIM(c.sales_pic_code) AS sales_pic_code, c.price_list_name AS price_list_name, c.currency_code AS currency_code,
        COALESCE(NULLIF(TRIM(c.organization), ''), r.customer) AS org_key, COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, r.customer)) AS org_name,
        SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS gm, SUM(r.hk3_rev_vnd) AS hk3, ${monthCols}
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f}
        GROUP BY 1, 2, 3, 4, 5, 6, 7`, [a.qStart, a.qEnd]),
    rq(`SELECT DISTINCT TRIM(c.sales_pic_code) AS code, COALESCE(st.name, TRIM(c.sales_pic_code)) AS name FROM dm_customer c LEFT JOIN dm_staff st ON TRIM(c.sales_pic_code) = TRIM(st.code)
        WHERE c.sales_pic_code IS NOT NULL AND TRIM(c.sales_pic_code) != '' AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')`),
    rq(`SELECT r.customer AS customer_code, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f} GROUP BY 1`, [a.prevQStartDate, a.prevQEndDate]),
  ])
  const numKeys = new Set(["revenue", "gm", "hk3", ...a.months.flatMap((_, i) => [`rev_m${i}`, `gm_m${i}`, `hk3_m${i}`])])
  return {
    custRows: cur.map(r => {
      const o: SquadCustRow = {}
      for (const [k, v] of Object.entries(r)) o[k] = numKeys.has(k) ? n(v) : (v == null ? (null as unknown as string) : String(v))
      return o
    }),
    picRows: pics.map(r => ({ code: String(r.code), name: String(r.name) })).sort((x, y) => collator.compare(x.name, y.name)),
    prevCustRevRows: prev.map(r => ({ customer_code: String(r.customer_code), revenue: n(r.revenue) })),
  }
}

export function diffSquad(raw: SquadRaw, ru: SquadRaw) {
  const mk = Object.keys(raw.custRows[0] ?? {}).filter(k => /^(revenue|gm|hk3|rev_m\d+|gm_m\d+|hk3_m\d+)$/.test(k))
  const cur = diffRows(raw.custRows, ru.custRows, r => `${r.customer_code}|${r.sales_pic_code ?? ""}|${r.price_list_name ?? ""}|${r.currency_code ?? ""}|${r.org_key}`, mk)
  const prev = diffRows(raw.prevCustRevRows, ru.prevCustRevRows, r => r.customer_code, ["revenue"])
  const picA = raw.picRows.map(p => `${p.code}:${p.name}`).sort().join("|"), picB = ru.picRows.map(p => `${p.code}:${p.name}`).sort().join("|")
  return { ok: cur.ok && prev.ok && picA === picB, cur, prev, picsEqual: picA === picB }
}
