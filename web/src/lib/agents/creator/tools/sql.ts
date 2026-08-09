import { createHash } from "crypto"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery }    from "@/lib/analytics-helpers"

export async function runExecuteSQL(sql: string): Promise<any> {
  const norm = sql.trim().toLowerCase()
  if (!norm.startsWith("select") && !norm.startsWith("with"))
    return { error: "Only SELECT and WITH queries are allowed." }
  if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1)
    return { error: "Multiple statements not allowed." }

  try {
    console.log(`[CreatorAI] SQL: ${sql.substring(0, 200)}`)
    const sqlHash = createHash("md5").update(sql).digest("hex").slice(0, 16)
    const rows = await cachedQuery(`gp-sql:${sqlHash}`, () => queryAnalytics(sql), 5)
    const limited = rows.slice(0, 200)
    const response: any = { result: limited, rowCount: rows.length }

    if (rows.length === 0) {
      response.auto_retry_suggested = true
      response.retry_hint = "0 rows. Sửa & chạy lại: (1) fulfiled_date::DATE cast (một chữ 'l'), (2) ILIKE thay vì =, (3) bỏ bớt 1 filter, (4) SELECT MAX(fulfiled_date::date) FROM fact_fulfillment_revenue xem ngày mới nhất."
    }
    const firstRow = limited[0] as any
    if (firstRow) {
      const nums = Object.values(firstRow)
        .filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v))))
        .map(v => Number(v))
      if (nums.some(n => n > 1e12)) {
        response.auto_retry_suggested = true
        response.retry_hint = "Giá trị bất thường lớn (>1 nghìn tỷ VND) — nghi THIẾU JOIN gây nhân dòng (row multiplication). Kiểm tra JOIN + GROUP BY rồi chạy lại."
      }
      if (nums.some(n => n < 0 && sql.toLowerCase().includes("revenue")))
        response.warning = "Có revenue âm — nghi data issue hoặc aggregation sai."
    }
    return response
  } catch (err: any) {
    console.error("[CreatorAI] SQL error:", err.message)
    return {
      error: err.message,
      fix_hint: "Fix the SQL error and retry immediately. Common causes: wrong column name (query information_schema.columns to check), missing ::DATE cast on fulfiled_date, using sku_code instead of sku in dim_sku.",
    }
  }
}
