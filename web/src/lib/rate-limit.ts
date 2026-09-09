/**
 * Rate limiter — Upstash Redis khi có cấu hình (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` set
 * trên Vercel), fallback in-memory sliding-window khi CHƯA cấu hình (máy dev, hoặc trước khi Hiếu tạo
 * tài khoản Upstash) — hàm không throw, luôn có kết quả hợp lệ.
 *
 * Vì sao đổi (s183 Phase 4): in-memory cũ chỉ đúng trong 1 Vercel instance — nhiều instance chạy song
 * song (bình thường trên serverless) thì mỗi instance đếm riêng, giới hạn thật KHÔNG chặn đúng tổng số
 * request như tưởng (đã ghi rõ trong chính code cũ: "phù hợp internal tool, không cần persistent
 * cross-instance"). Upstash Redis là kho đếm DÙNG CHUNG mọi instance qua REST API (không cần TCP
 * connection thường trực, hợp serverless) → chặn đúng thật.
 *
 * An toàn khi Upstash lỗi/chưa cấu hình: rate-limit là lớp bảo vệ PHỤ, không được phép làm sập tính
 * năng chính khi bản thân nó lỗi — mọi nhánh lỗi đều rơi về fallback in-memory (degrade gracefully,
 * không throw ra ngoài).
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const hasUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN)

const redis = hasUpstash ? new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! }) : null

// Upstash Ratelimit instance nặng hơn 1 lệnh gọi thường (dựng sẵn Lua script) — SDK khuyến nghị tái dùng,
// không tạo mới mỗi request. Cache theo (limit, windowMs) vì mỗi route gọi checkRateLimit() với tham số
// cố định riêng (vd chat=20/60s, creator-ai=10/60s) → tối đa vài instance suốt vòng đời server.
const limiters = new Map<string, Ratelimit>()
function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`
  let rl = limiters.get(cacheKey)
  if (!rl) {
    const windowSec = Math.max(1, Math.round(windowMs / 1000))
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      analytics: false,
      prefix: "gohub-rl",
    })
    limiters.set(cacheKey, rl)
  }
  return rl
}

// ── Fallback in-memory sliding-window (bản gốc, giữ nguyên logic — dùng khi chưa có Upstash) ──────────
interface Bucket { timestamps: number[] }
const store = new Map<string, Bucket>()

function checkRateLimitInMemory(
  key: string, limit: number, windowMs: number,
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now()
  const cutoff = now - windowMs

  let bucket = store.get(key)
  if (!bucket) { bucket = { timestamps: [] }; store.set(key, bucket) }
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]
    return { allowed: false, remaining: 0, resetMs: oldest + windowMs - now }
  }
  bucket.timestamps.push(now)
  return { allowed: true, remaining: limit - bucket.timestamps.length, resetMs: windowMs }
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - 300_000
    for (const [key, bucket] of store.entries()) {
      if (bucket.timestamps.every(t => t < cutoff)) store.delete(key)
    }
  }, 300_000)
}

/**
 * @param key      user identifier (username hoặc IP)
 * @param limit    số request tối đa trong windowMs
 * @param windowMs cửa sổ thời gian (ms), default 60_000 (1 phút)
 * @returns { allowed, remaining, resetMs } — LƯU Ý: nay là async (Upstash gọi REST qua mạng), mọi chỗ
 *          gọi phải `await checkRateLimit(...)`.
 */
export async function checkRateLimit(
  key: string, limit: number, windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  if (hasUpstash && redis) {
    try {
      const rl = getLimiter(limit, windowMs)
      const { success, remaining, reset } = await rl.limit(key)
      return { allowed: success, remaining, resetMs: Math.max(0, reset - Date.now()) }
    } catch {
      // Upstash lỗi (mạng/quota/sai token) → fallback in-memory thay vì chặn cứng hoặc throw 500.
    }
  }
  return checkRateLimitInMemory(key, limit, windowMs)
}
