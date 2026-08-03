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
      // gohub_dw max_connections=100 (chia cho NHIỀU serverless instance). max:10 × nhiều instance + idle 30s
      // → cạn slot → 500 "remaining connection slots" (Quarter Report ~7 query song song). Hạ max=5 + idle 10s
      // để mỗi instance giữ ÍT kết nối và GIẢI PHÓNG nhanh; cache giảm hit nên tốc độ vẫn ổn.
      max:                5,
      idleTimeoutMillis:  10000,
      connectionTimeoutMillis: 8000,
    })
    _pool.on("error", (err) => {
      console.error("[analytics-db] Pool error:", err.message)
      _pool = null
    })
  }
  return _pool
}

// Lỗi cạn kết nối gohub_dw (max_connections server) hoặc pool timeout → thử lại có backoff.
// Nhiều query song song (Quarter Report ~7 query) + nhiều serverless instance có thể chạm trần 100 kết nối
// → "remaining connection slots..." → 500. Retry cho các slot được giải phóng khi query khác xong.
function isTransientConnError(e: any): boolean {
  const m = String(e?.message || "").toLowerCase()
  return m.includes("remaining connection slots") || m.includes("too many clients")
      || m.includes("connection terminated") || m.includes("timeout exceeded when trying to connect")
      || m.includes("econnreset") || m.includes("connection timeout")
}

export async function queryAnalytics<T = Record<string, unknown>>(
  sql:    string,
  params?: unknown[]
): Promise<T[]> {
  if (!process.env.ANALYTICS_DB_PASSWORD) {
    throw new Error("ANALYTICS_DB_PASSWORD chưa được cấu hình — không thể truy vấn dữ liệu phân tích. Vui lòng báo Hiếu kiểm tra cài đặt môi trường.")
  }
  let lastErr: any
  for (let attempt = 0; attempt < 3; attempt++) {
    let client: pg.PoolClient | null = null
    try {
      client = await getAnalyticsPool().connect()
      const result = await client.query(sql, params)
      return result.rows as T[]
    } catch (e: any) {
      lastErr = e
      if (attempt === 2 || !isTransientConnError(e)) throw e
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)))   // 400ms, 800ms backoff
    } finally {
      client?.release()
    }
  }
  throw lastErr
}

export async function queryAnalyticsOne<T = Record<string, unknown>>(
  sql:    string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await queryAnalytics<T>(sql, params)
  return rows[0] ?? null
}
