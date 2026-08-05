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
      // gohub_dw HAY cạn slot ("remaining connection slots reserved for superuser") vì DB dùng chung nhiều
      // service + nhiều Vercel instance. App phải là GOOD CITIZEN — dùng ÍT kết nối:
      //   max=4: đủ cho route nặng nhất (quarterly chạy ≤2 query đồng thời) + headroom; KHÔNG ngốn slot DB.
      //     (từng nâng lên 8 → làm cạn slot NHANH hơn → sai lầm, đã hạ lại.)
      //   statement_timeout=25s + query_timeout=25s: query KHÔNG treo vô hạn khi DB contended → route fail
      //     nhanh, trả lỗi rõ thay vì để Vercel giết ở maxDuration (FUNCTION_INVOCATION_TIMEOUT). ⭐ FIX GỐC.
      //   connectionTimeoutMillis=8s: chờ slot pool tối đa 8s rồi lỗi (kèm retry backoff ở queryAnalytics).
      max:                4,
      idleTimeoutMillis:  30000,
      connectionTimeoutMillis: 8000,
      statement_timeout:  25000,
      query_timeout:      25000,
      keepAlive:          true,
      application_name:   "gohub-intel-web",
    })
    // RÒ RỈ KẾT NỐI (fix s131): trước đây _pool=null ở đây → tạo pool MỚI ở lần gọi sau, nhưng pool CŨ vẫn
    // giữ các kết nối gohub_dw đang mở → tích tụ nhiều pool "ma" → cạn slot. pg.Pool tự loại client idle lỗi,
    // KHÔNG cần tạo lại pool. Chỉ log, GIỮ nguyên _pool.
    _pool.on("error", (err) => {
      console.error("[analytics-db] Pool idle client error (bỏ qua, pg tự xử lý):", err.message)
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
