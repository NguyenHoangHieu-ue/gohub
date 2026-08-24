import pg from "pg"
const { Pool } = pg

let _pool: pg.Pool | null = null

export function getAnalyticsPool(): pg.Pool {
  if (!_pool) {
    // Tất cả DB credentials bắt buộc qua env — không fallback hardcode để tránh infra disclosure.
    const host = process.env.ANALYTICS_DB_HOST
    const database = process.env.ANALYTICS_DB_NAME
    const user = process.env.ANALYTICS_DB_USER
    if (!host || !database || !user) {
      throw new Error("ANALYTICS_DB_HOST / ANALYTICS_DB_NAME / ANALYTICS_DB_USER chưa set trong Vercel env.")
    }
    _pool = new Pool({
      host,
      port:               parseInt(process.env.ANALYTICS_DB_PORT ?? "5432"),
      database,
      user,
      password:           process.env.ANALYTICS_DB_PASSWORD,
      // Nếu có ANALYTICS_DB_SSL_CA (cert từ GCP Cloud SQL) → verify đầy đủ.
      // Chưa set → fallback rejectUnauthorized:false (backward-compat) nhưng log cảnh báo.
      ssl: process.env.ANALYTICS_DB_SSL_CA
        ? { rejectUnauthorized: true, ca: process.env.ANALYTICS_DB_SSL_CA }
        : (() => { console.warn("[analytics-db] SSL: rejectUnauthorized=false. Hãy set ANALYTICS_DB_SSL_CA để enable cert verification."); return { rejectUnauthorized: false } })(),
      // ⚠️ TOÁN CONNECTION TRÊN SERVERLESS: Vercel chạy NHIỀU instance, MỖI instance có pool RIÊNG.
      // Tổng kết nối gohub_dw ≈ (số instance ấm) × max. gohub_dw dùng chung nhiều service → slot hữu hạn →
      // "remaining connection slots reserved for superuser". App phải dùng ÍT + NHẢ NHANH:
      //   max=3: route nặng bắn 5-8 query song song sẽ TỰ cap ở 3 (pool xếp hàng phần dư) → KHÔNG cần đổi
      //     từng route. quarterly runLimited(2) ⊂ 3. (Nâng 8 = sai lầm "mấy bữa nay" → cạn slot nhanh, đã hạ.)
      //   ⭐ options '-c idle_session_timeout=90000': ép POSTGRES tự đóng session idle >90s. GỐC của tích tụ
      //     connection: Vercel FREEZE instance sau request → timer idleTimeoutMillis của pool KHÔNG chạy → conn
      //     idle sống mãi tới khi instance chết (đo thực tế: 9 conn app idle 3-6 PHÚT). idle_session_timeout là
      //     server-side → đóng được conn dù client đóng băng → nhả slot. (idleTimeoutMillis chỉ hiệu quả khi
      //     instance còn thức.) Conn bị đóng → lần dùng sau pool tự reconnect (retry ở queryAnalytics).
      //   statement_timeout=25s + query_timeout=25s: query KHÔNG treo vô hạn khi DB contended → route fail
      //     nhanh, trả lỗi rõ thay vì để Vercel giết ở maxDuration (FUNCTION_INVOCATION_TIMEOUT).
      //   connectionTimeoutMillis=8s: chờ slot tối đa 8s rồi lỗi (kèm retry backoff ở queryAnalytics).
      max:                3,
      idleTimeoutMillis:  8000,
      connectionTimeoutMillis: 8000,
      statement_timeout:  25000,
      query_timeout:      25000,
      options:            "-c idle_session_timeout=90000",
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
