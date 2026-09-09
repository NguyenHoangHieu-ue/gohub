// checkRateLimit (s183 Phase 4) — Upstash Redis khi có env, fallback in-memory khi không. Máy test/dev
// không set UPSTASH_REDIS_REST_URL/_TOKEN nên test này chạy qua nhánh fallback — đúng môi trường thật
// của session test hiện tại (không có test nào trước đây cho rate-limit.ts dù đã dùng cho /api/chat từ
// s159; thêm ở đây để khoá hành vi trước khi mở rộng áp dụng thêm 2 route mới).

import { describe, test, expect, beforeEach } from "vitest"
import { checkRateLimit } from "@/lib/rate-limit"

describe("checkRateLimit — fallback in-memory (không có Upstash env trong test)", () => {
  test("dưới limit → allowed=true, remaining giảm dần", async () => {
    const key = "test-key:" + Math.random()
    const a = await checkRateLimit(key, 3, 60_000)
    const b = await checkRateLimit(key, 3, 60_000)
    expect(a.allowed).toBe(true)
    expect(a.remaining).toBe(2)
    expect(b.allowed).toBe(true)
    expect(b.remaining).toBe(1)
  })

  test("chạm limit → request thứ N+1 bị chặn (allowed=false, remaining=0)", async () => {
    const key = "test-key:" + Math.random()
    await checkRateLimit(key, 2, 60_000)
    await checkRateLimit(key, 2, 60_000)
    const third = await checkRateLimit(key, 2, 60_000)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.resetMs).toBeGreaterThan(0)
  })

  test("key khác nhau → đếm độc lập, không ảnh hưởng nhau", async () => {
    const keyA = "a:" + Math.random()
    const keyB = "b:" + Math.random()
    await checkRateLimit(keyA, 1, 60_000)
    const blockedA = await checkRateLimit(keyA, 1, 60_000)
    const allowedB = await checkRateLimit(keyB, 1, 60_000)
    expect(blockedA.allowed).toBe(false)
    expect(allowedB.allowed).toBe(true)
  })

  test("windowMs hết hạn → đếm lại từ đầu (giả lập bằng windowMs cực ngắn)", async () => {
    const key = "expiring:" + Math.random()
    await checkRateLimit(key, 1, 20) // window 20ms
    const blocked = await checkRateLimit(key, 1, 20)
    expect(blocked.allowed).toBe(false)
    await new Promise(r => setTimeout(r, 30)) // đợi qua window
    const after = await checkRateLimit(key, 1, 20)
    expect(after.allowed).toBe(true)
  })
})
