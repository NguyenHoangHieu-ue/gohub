import pg from "pg"
const { Pool } = pg

let _pool: pg.Pool | null = null

export function getAnalyticsPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      host:               process.env.ANALYTICS_DB_HOST     ?? "34.61.204.98",
      port:               parseInt(process.env.ANALYTICS_DB_PORT ?? "5432"),
      database:           process.env.ANALYTICS_DB_NAME     ?? "gohub_dw",
      user:               process.env.ANALYTICS_DB_USER     ?? "gohub_dw_user",
      password:           process.env.ANALYTICS_DB_PASSWORD,
      ssl:                { rejectUnauthorized: false },
      // max:2 cũ → 1 trang analytics bắn 40-80 query qua 1 instance bị xếp hàng qua 2 kết nối (chậm 25-50s).
      // 10 cho phép nhiều query chạy song song; gohub_dw default max_connections=100 + cache giảm hit nên an toàn.
      max:                10,
      idleTimeoutMillis:  30000,
      connectionTimeoutMillis: 8000,
    })
    _pool.on("error", (err) => {
      console.error("[analytics-db] Pool error:", err.message)
      _pool = null
    })
  }
  return _pool
}

export async function queryAnalytics<T = Record<string, unknown>>(
  sql:    string,
  params?: unknown[]
): Promise<T[]> {
  if (!process.env.ANALYTICS_DB_PASSWORD) {
    throw new Error("ANALYTICS_DB_PASSWORD chưa được cấu hình — không thể truy vấn dữ liệu phân tích. Vui lòng báo Hiếu kiểm tra cài đặt môi trường.")
  }
  const client = await getAnalyticsPool().connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryAnalyticsOne<T = Record<string, unknown>>(
  sql:    string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await queryAnalytics<T>(sql, params)
  return rows[0] ?? null
}
