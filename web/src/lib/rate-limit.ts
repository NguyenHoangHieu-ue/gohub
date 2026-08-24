/**
 * In-memory sliding-window rate limiter.
 * Phù hợp internal tool (không cần persistent cross-instance).
 * Mỗi Vercel instance có counter riêng — đủ để ngăn spam vô tình.
 * Nếu cần cross-instance strict limit → dùng Upstash Redis.
 */

interface Bucket {
  timestamps: number[]
}

const store = new Map<string, Bucket>()

/**
 * @param key      user identifier (username or IP)
 * @param limit    số request tối đa trong windowMs
 * @param windowMs cửa sổ thời gian (ms), default 60_000 (1 phút)
 * @returns { allowed, remaining, resetMs }
 */
export function checkRateLimit(
  key:      string,
  limit:    number,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now()
  const cutoff = now - windowMs

  let bucket = store.get(key)
  if (!bucket) {
    bucket = { timestamps: [] }
    store.set(key, bucket)
  }

  // Xóa timestamps ngoài cửa sổ
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]
    return { allowed: false, remaining: 0, resetMs: oldest + windowMs - now }
  }

  bucket.timestamps.push(now)
  return { allowed: true, remaining: limit - bucket.timestamps.length, resetMs: windowMs }
}

// Cleanup định kỳ để tránh memory leak (chạy mỗi 5 phút)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - 300_000
    for (const [key, bucket] of store.entries()) {
      if (bucket.timestamps.every(t => t < cutoff)) store.delete(key)
    }
  }, 300_000)
}
