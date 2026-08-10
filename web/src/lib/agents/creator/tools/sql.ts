import { createHash } from "crypto"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery }    from "@/lib/analytics-helpers"

// Detect aggregate query (có SUM/COUNT/AVG + GROUP BY) → không cắt rows
function isAggregateQuery(sql: string): boolean {
  const s = sql.toLowerCase()
  return /\b(sum|count|avg|min|max)\s*\(/.test(s) && /\bgroup\s+by\b/.test(s)
}

// pg driver trả numeric/bigint/decimal dưới dạng string → convert sang number
// Tránh Gemini concat "234" + "567" = "234567" thay vì cộng 801
function coerceNumerics(rows: any[]): any[] {
  return rows.map(row => {
    const out: any = {}
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && v !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
        out[k] = Number(v)
      } else {
        out[k] = v
      }
    }
    return out
  })
}

export async function runExecuteSQL(sql: string, bypassCache = false): Promise<any> {
  const norm = sql.trim().toLowerCase()
  if (!norm.startsWith("select") && !norm.startsWith("with"))
    return { error: "Only SELECT and WITH queries are allowed." }
  if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1)
    return { error: "Multiple statements not allowed." }

  try {
    console.log(`[CreatorAI] SQL (bypass=${bypassCache}): ${sql.substring(0, 200)}`)
    const sqlHash = createHash("md5").update(sql).digest("hex").slice(0, 16)
    const rawRows = await cachedQuery(`gp-sql:${sqlHash}`, () => queryAnalytics(sql), 5, bypassCache)

    // Fix #1: convert numeric strings → number (pg returns numeric/bigint as string)
    const rows = coerceNumerics(rawRows)

    // Fix #2: higher row caps — aggregate queries rarely have >100 rows; detail up to 500
    const isAgg = isAggregateQuery(sql)
    const CAP   = isAgg ? 1000 : 500
    const limited = rows.slice(0, CAP)

    const response: any = {
      sql_used:   sql,          // Fix #4: always expose SQL so Gemini shows it for verification
      result:     limited,
      rowCount:   rows.length,
      truncated:  rows.length > CAP,
      query_type: isAgg ? "aggregate" : "detail",
    }
    if (response.truncated) {
      response.truncation_warning = `Kết quả bị cắt tại ${CAP} / ${rows.length} rows. Nếu cần tổng, hãy dùng SUM/COUNT trong SQL thay vì tính trên kết quả trả về.`
    }

    if (rows.length === 0) {
      response.auto_retry_suggested = true
      response.retry_hint = "0 rows returned. Check: (1) fulfiled_date::DATE cast (one 'l'), (2) ILIKE instead of =, (3) remove one filter to narrow down, (4) run SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue to verify latest date."
    }

    const firstRow = limited[0] as any
    if (firstRow) {
      const nums = Object.values(firstRow)
        .filter(v => typeof v === "number")
        .map(v => v as number)

      // Fix #3a: lower threshold — GoHub quarterly max ~15 tỷ, yearly ~60 tỷ; >100 tỷ trong 1 metric = nghi
      if (nums.some(n => n > 1e11)) {
        response.auto_retry_suggested = true
        response.retry_hint = "Giá trị > 100 tỷ VND trên 1 metric — nghi row multiplication do JOIN sai. Kiểm tra: (1) tất cả JOIN có ON condition đúng không, (2) thêm DISTINCT vào COUNT, (3) chạy SELECT COUNT(*) riêng xem có bất thường không."
      }

      // Fix #3b: aggregate query mà ra quá nhiều rows → GROUP BY có vấn đề
      if (isAgg && rows.length > 5000) {
        response.warning_rowcount = `Aggregate query trả ${rows.length} rows — bất thường. Kiểm tra GROUP BY có đủ dimension chưa hay bị thiếu một cột.`
      }

      // Fix #3c: revenue âm
      if (nums.some(n => n < 0) && sql.toLowerCase().includes("revenue")) {
        response.warning_negative = "Có revenue âm — thường do Internal-Transaction group (COGS thật, revenue=0 → GP âm). Nếu cố ý exclude: thêm WHERE UPPER(s.group_name) NOT IN ('INTERNAL-TRANSACTION')."
      }

      // Fix #3d: 3HK filter dùng sai pattern
      const sqlL = sql.toLowerCase()
      if ((sqlL.includes("3hk") || sqlL.includes("datapool")) &&
          !sqlL.includes("replace(upper(trim")) {
        response.business_rule_warning = "3HK filter không đúng chuẩn. Phải dùng: REPLACE(UPPER(TRIM(vendor)),' ','')='3HKDATAPOOL'. LIKE '3HK%' bao gồm thừa 61 SKU vendor '3HK' không phải datapool → số lệch."
      }
    }

    return response
  } catch (err: any) {
    console.error("[CreatorAI] SQL error:", err.message)
    return {
      error:    err.message,
      sql_used: sql,
      fix_hint: "Fix the SQL and retry immediately. Common: wrong column name → query information_schema.columns; missing ::DATE on fulfiled_date; sku_code vs sku in dim_sku; missing JOIN condition.",
    }
  }
}
