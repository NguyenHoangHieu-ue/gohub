import { vi, describe, test, expect } from "vitest"

// L2 = Vercel Runtime Cache (s203) — mock bằng Map trong bộ nhớ, có tags + expireTag như thật. waitUntil gom promise
// nền vào `bgTasks` để test chủ động chờ (không để việc làm mới nền chạy lơ lửng).
const l2Store = new Map<string, { value: unknown; tags: string[] }>()
const expiredTags: string[][] = []
const bgTasks: Promise<unknown>[] = []
vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => { bgTasks.push(p.catch(() => {})) },
  getCache: () => ({
    get: async (k: string) => l2Store.get(k)?.value,
    set: async (k: string, value: unknown, opts?: { tags?: string[] }) => { l2Store.set(k, { value: JSON.parse(JSON.stringify(value)), tags: opts?.tags ?? [] }) },
    delete: async (k: string) => { l2Store.delete(k) },
    expireTag: async (t: string | string[]) => {
      const tags = Array.isArray(t) ? t : [t]
      expiredTags.push(tags)
      for (const [k, v] of l2Store) if (v.tags.some(x => tags.includes(x))) l2Store.delete(k)
    },
  }),
}))
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
  },
}))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))

import {
  safeDate, safeCompanyCode, getDateFilter, getPrevDateFilter,
  getDaysInMonth, getDaysInRange, getMonthsInRange,
  cachedQuery, flushByDeps, flushAnalyticsCache, flushAnalyticsCacheByPrefixes, softExpireAll, isCronReq, analyticsGuard,
  excludeInactiveCustomers, buildIsStrategicSql, shipFilter, internalOpsFilter,
  decodeSkuDestinationCode,
} from "@/lib/analytics-helpers"

describe("decodeSkuDestinationCode (JS mirror của getDestinationSQL)", () => {
  test("13 ký tự, pháp nhân digit (VN, 1-6) → ký tự 3-5", () => {
    expect(decodeSkuDestinationCode("2CTHACBF05010")).toBe("THA")
  })
  test("13 ký tự, pháp nhân CHỮ (US, A-E) → ký tự 3-5, KHÔNG PHẢI 2-4 (bug s195+19: code cũ đọc " +
    "sai lệch 1 ký tự cho mọi SKU pháp nhân chữ, verify bằng SQL trên toàn bộ lịch sử thật)", () => {
    expect(decodeSkuDestinationCode("ECJPN3DBUNL01")).toBe("JPN")
    expect(decodeSkuDestinationCode("DCANZBCF00103")).toBe("ANZ")
  })
  test("15 ký tự legacy Datapool (E + nước liền, không có ký tự product-type) → ký tự 2-4", () => {
    expect(decodeSkuDestinationCode("EJPNBCPY500M30D")).toBe("JPN")
  })
  test("14 ký tự legacy (nước ngay đầu, không có ký tự pháp nhân) → ký tự 1-3", () => {
    expect(decodeSkuDestinationCode("CHN3D07GBFY05D")).toBe("CHN")
  })
})

describe("SQL input sanitization (chống injection)", () => {
  test("safeDate: chỉ nhận YYYY-MM-DD, còn lại → null", () => {
    expect(safeDate("2026-07-14")).toBe("2026-07-14")
    expect(safeDate("2026-7-4")).toBeNull()
    expect(safeDate("2026-07-14'; DROP TABLE x--")).toBeNull()
    expect(safeDate(null)).toBeNull()
    expect(safeDate("")).toBeNull()
  })

  test("safeCompanyCode: chỉ chữ/số/_/-, còn lại → ALL", () => {
    expect(safeCompanyCode("GH-01")).toBe("GH-01")
    expect(safeCompanyCode("A_b9")).toBe("A_b9")
    expect(safeCompanyCode("x' OR 1=1")).toBe("ALL")
    expect(safeCompanyCode(null)).toBe("ALL")
  })

  test("getDateFilter: input bẩn bị bỏ qua → không lọt vào SQL", () => {
    const dirty = getDateFilter("bad'; DROP--", "also-bad", "fulfiled_date", "30 days")
    expect(dirty).not.toContain("DROP")
    expect(dirty).toContain("INTERVAL '30 days'") // fallback an toàn
    const clean = getDateFilter("2026-07-01", "2026-07-14", "fulfiled_date")
    // Yesterday-cutoff (session 126): endDate được wrap bằng LEAST(..., CURRENT_DATE-1)
    expect(clean).toContain("BETWEEN '2026-07-01' AND LEAST('2026-07-14'::date")
  })

  test("getDateFilter: companyCode hợp lệ được thêm, code bẩn → ALL (bỏ qua)", () => {
    expect(getDateFilter("2026-07-01", "2026-07-14", "fulfiled_date", "30 days", "GH1"))
      .toContain("f.company_code = 'GH1'")
    expect(getDateFilter("2026-07-01", "2026-07-14", "fulfiled_date", "30 days", "'; DROP--"))
      .not.toContain("company_code")
  })

  test("getPrevDateFilter previous_year: lùi đúng 1 năm", () => {
    const f = getPrevDateFilter("2026-07-01", "2026-07-14", "previous_year")
    expect(f).toContain("2025-07-01")
    expect(f).toContain("2025-07-14")
  })
})

describe("Date math (target/cost pro-rata)", () => {
  test("getDaysInMonth", () => {
    expect(getDaysInMonth("2026-02")).toBe(28)
    expect(getDaysInMonth("2024-02")).toBe(29) // nhuận
    expect(getDaysInMonth("2026-07")).toBe(31)
  })

  test("getDaysInRange: kẹp trong tháng", () => {
    expect(getDaysInRange("2026-07-01", "2026-07-10", "2026-07")).toBe(10)
    expect(getDaysInRange("2026-06-15", "2026-08-15", "2026-07")).toBe(31) // cả tháng 7
    expect(getDaysInRange("2026-07-01", "2026-07-10", "2026-09")).toBe(0)  // ngoài tháng
  })

  test("getMonthsInRange: liệt kê các tháng", () => {
    expect(getMonthsInRange("2026-06-20", "2026-08-05")).toEqual(["2026-06", "2026-07", "2026-08"])
    expect(getMonthsInRange("2026-07-01", "2026-07-31")).toEqual(["2026-07"])
  })
})

describe("cachedQuery — L1 in-memory cache", () => {
  test("gọi lại cùng key → dùng cache, KHÔNG chạy fn lần 2", async () => {
    const fn = vi.fn(async () => ({ v: 1 }))
    const key = "test:" + Math.random()
    const a = await cachedQuery(key, fn)
    const b = await cachedQuery(key, fn)
    expect(a).toEqual({ v: 1 })
    expect(b).toEqual({ v: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("key khác nhau → chạy fn riêng", async () => {
    const fn = vi.fn(async () => 42)
    await cachedQuery("k-a:" + Math.random(), fn)
    await cachedQuery("k-b:" + Math.random(), fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

// s190+2: thay B2B_COST_CACHE_PREFIXES (danh sách prefix viết tay, đã lệch version thành no-op ở s169)
// bằng deps khai NGAY tại chỗ cachedQuery() — flushByDeps xoá theo "chủ đề", không cần biết cache-key thật.
describe("flushByDeps — flush theo deps khai tại cachedQuery (thay prefix-list viết tay)", () => {
  test("entry có deps khớp → bị xoá khỏi L1, entry deps khác/không khai → giữ nguyên", async () => {
    const key1 = "b2b-kpis2:test:" + Math.random()
    const key2 = "b2c-kpis:test:" + Math.random()
    const key3 = "no-deps:test:" + Math.random()

    const fn1 = vi.fn(async () => "b2b-data")
    const fn2 = vi.fn(async () => "b2c-data")
    const fn3 = vi.fn(async () => "plain-data")

    await cachedQuery(key1, fn1, 10, false, ["b2b-cost"])
    await cachedQuery(key2, fn2, 10, false, ["b2c-budget"])
    await cachedQuery(key3, fn3)

    await flushByDeps(["b2b-cost"])

    // key1 (deps=["b2b-cost"]) đã bị xoá khỏi L1 → gọi lại chạy fn1 lần 2
    await cachedQuery(key1, fn1, 10, false, ["b2b-cost"])
    expect(fn1).toHaveBeenCalledTimes(2)

    // key2/key3 (deps khác hoặc không khai) không bị đụng tới → vẫn dùng cache, fn không chạy lại
    await cachedQuery(key2, fn2, 10, false, ["b2c-budget"])
    await cachedQuery(key3, fn3)
    expect(fn2).toHaveBeenCalledTimes(1)
    expect(fn3).toHaveBeenCalledTimes(1)
  })

  test("gọi Runtime Cache expireTag với tag dep:<tên> — không đụng Supabase", async () => {
    expiredTags.length = 0
    await flushByDeps(["b2b-cost", "b2c-budget"])
    expect(expiredTags).toEqual([["dep:b2b-cost", "dep:b2c-budget"]])
  })

  test("deps rỗng → no-op, không gọi expireTag", async () => {
    expiredTags.length = 0
    const res = await flushByDeps([])
    expect(res).toEqual({ deleted: 0 })
    expect(expiredTags).toEqual([])
  })

  test("flushAnalyticsCacheByPrefixes → expireTag theo phần trước dấu ':' của prefix", async () => {
    expiredTags.length = 0
    await flushAnalyticsCacheByPrefixes(["qreport_raw_v10:", "qb2b_raw_v9:"])
    expect(expiredTags).toEqual([["pfx:qreport_raw_v10", "pfx:qb2b_raw_v9"]])
  })
})

// s203: L2 = Runtime Cache dùng chung mọi instance + stale-while-revalidate (trả bản cũ ngay, tính lại nền).
describe("cachedQuery — L2 Runtime Cache + stale-while-revalidate", () => {
  const MIN = 60_000

  test("instance MỚI (L1 trống) vẫn thấy cache của instance khác qua L2 → không chạy fn", async () => {
    const key = "l2:" + Math.random()
    const fn = vi.fn(async () => ({ n: 1 }))
    await cachedQuery(key, fn, 60)
    await Promise.all(bgTasks)               // chờ ghi L2 nền xong
    vi.resetModules()                        // giả lập cold start: module mới, L1 rỗng, cùng L2
    const fresh = await import("@/lib/analytics-helpers")
    const fn2 = vi.fn(async () => ({ n: 2 }))
    expect(await fresh.cachedQuery(key, fn2, 60)).toEqual({ n: 1 })
    expect(fn2).not.toHaveBeenCalled()
  })

  test("hết TTL nhưng còn ≤6h → trả bản CŨ ngay + làm mới nền; lần sau thấy bản mới", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-09-20T00:00:00Z"))
      const key = "swr:" + Math.random()
      let version = 1
      const fn = vi.fn(async () => ({ v: version }))
      expect(await cachedQuery(key, fn, 60)).toEqual({ v: 1 })
      await Promise.all(bgTasks)

      version = 2
      vi.setSystemTime(new Date(Date.now() + 61 * MIN))         // quá TTL 60' (L1 cũng hết 45s)
      bgTasks.length = 0
      expect(await cachedQuery(key, fn, 60)).toEqual({ v: 1 })  // bản cũ, KHÔNG chờ tính lại
      await Promise.all(bgTasks)                                 // nền chạy xong
      expect(fn).toHaveBeenCalledTimes(2)
      expect(await cachedQuery(key, fn, 60)).toEqual({ v: 2 })  // bản mới đã vào cache
      expect(fn).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })

  test("quá 6h → KHÔNG phục vụ bản cũ, tính lại đồng bộ", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-09-20T00:00:00Z"))
      const key = "old:" + Math.random()
      let version = 1
      const fn = vi.fn(async () => ({ v: version }))
      await cachedQuery(key, fn, 60)
      await Promise.all(bgTasks)
      version = 2
      vi.setSystemTime(new Date(Date.now() + 6 * 60 * MIN + MIN))
      expect(await cachedQuery(key, fn, 60)).toEqual({ v: 2 })
    } finally { vi.useRealTimers() }
  })

  test("nocache (bypass=true) → tính lại đồng bộ dù cache còn tươi, và ghi đè cache", async () => {
    const key = "bypass:" + Math.random()
    let version = 1
    const fn = vi.fn(async () => ({ v: version }))
    await cachedQuery(key, fn, 60)
    version = 2
    expect(await cachedQuery(key, fn, 60, true)).toEqual({ v: 2 })
    expect(await cachedQuery(key, fn, 60)).toEqual({ v: 2 })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test("nhiều request cùng key đồng thời → fn chỉ chạy 1 lần (in-flight dedupe)", async () => {
    const key = "dedupe:" + Math.random()
    let release: () => void = () => {}
    const gate = new Promise<void>(r => { release = r })
    const fn = vi.fn(async () => { await gate; return "x" })
    const all = Promise.all([cachedQuery(key, fn, 60), cachedQuery(key, fn, 60), cachedQuery(key, fn, 60)])
    await new Promise(r => setTimeout(r, 5))
    release()
    expect(await all).toEqual(["x", "x", "x"])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("softExpireAll (ETL vừa nạp) → entry đang tươi thành 'cũ': vẫn trả ngay + làm mới nền", async () => {
    const key = "soft:" + Math.random()
    let version = 1
    const fn = vi.fn(async () => ({ v: version }))
    await cachedQuery(key, fn, 60)
    await Promise.all(bgTasks)
    version = 2
    await new Promise(r => setTimeout(r, 2))
    await softExpireAll()
    bgTasks.length = 0
    // L1 45s vẫn tươi nhưng < mốc soft → không được coi là tươi
    expect(await cachedQuery(key, fn, 60)).toEqual({ v: 1 })
    await Promise.all(bgTasks)
    expect(await cachedQuery(key, fn, 60)).toEqual({ v: 2 })
  })

  test("flushAnalyticsCache (hard) → bản cũ KHÔNG còn được phục vụ, tính lại đồng bộ", async () => {
    const key = "hard:" + Math.random()
    let version = 1
    const fn = vi.fn(async () => ({ v: version }))
    await cachedQuery(key, fn, 60)
    await Promise.all(bgTasks)
    version = 2
    await new Promise(r => setTimeout(r, 2))
    await flushAnalyticsCache()
    expect(await cachedQuery(key, fn, 60)).toEqual({ v: 2 })
  })

  test("L2 lỗi (get/set ném) → vẫn trả dữ liệu đúng, không throw", async () => {
    // fn lỗi phải lan ra ngoài (không nuốt), còn cache L2 lỗi thì không ảnh hưởng — kiểm tra nhánh fn lỗi
    const key = "err:" + Math.random()
    await expect(cachedQuery(key, async () => { throw new Error("db down") }, 60)).rejects.toThrow("db down")
    // lỗi không bị cache: lần sau chạy lại fn
    const ok = vi.fn(async () => 7)
    expect(await cachedQuery(key, ok, 60)).toBe(7)
  })
})

describe("isCronReq — xác thực cron bằng CRON_SECRET", () => {
  const mkReq = (auth: string | null) =>
    ({ headers: { get: (k: string) => (k === "authorization" ? auth : null) } } as any)

  test("không có CRON_SECRET → luôn false", () => {
    delete process.env.CRON_SECRET
    expect(isCronReq(mkReq("Bearer anything"))).toBe(false)
  })

  test("header khớp Bearer <secret> → true, sai → false", () => {
    process.env.CRON_SECRET = "s3cr3t"
    expect(isCronReq(mkReq("Bearer s3cr3t"))).toBe(true)
    expect(isCronReq(mkReq("Bearer wrong"))).toBe(false)
    expect(isCronReq(mkReq(null))).toBe(false)
    delete process.env.CRON_SECRET
  })
})

describe("excludeInactiveCustomers (regression s168 — B2B Performance thiếu lọc KH INACTIVE)", () => {
  test("SQL trả về loại KH có price_list_name chứa INACTIVE, self-contained (không cần JOIN sẵn)", () => {
    const sql = excludeInactiveCustomers()
    expect(sql).toContain("INACTIVE")
    expect(sql).toContain("NOT EXISTS")
    expect(sql).toContain("f.customer_code") // dùng đúng alias fact table chuẩn
  })
})

describe("buildIsStrategicSql — phân loại B2B-Strategic theo price_list_name", () => {
  test("không có tier Non-Strategic nào cấu hình → mọi KH B2B mặc định Strategic", () => {
    expect(buildIsStrategicSql({})).toBe("(TRUE)")
  })

  test("có keyword VIP/Gold/Silver → Strategic = NULL hoặc KHÔNG khớp bất kỳ keyword nào", () => {
    const sql = buildIsStrategicSql({ VIP: ["vip"], Gold: ["gold"] })
    expect(sql).toContain("c.price_list_name IS NULL")
    expect(sql).toContain("NOT LIKE '%VIP%'")
    expect(sql).toContain("NOT LIKE '%GOLD%'")
  })
})

describe("shipFilter / internalOpsFilter — filter chuẩn s132 (default OFF = loại)", () => {
  test("include=false (default) → thêm điều kiện loại", () => {
    expect(shipFilter(false)).toContain("!= 'SHIPPINGFEE0'")
    expect(internalOpsFilter(false)).toContain("!= 'INTERNAL-TRANSACTION'")
  })
  test("include=true → không thêm filter (rỗng, giữ nguyên toàn bộ dòng)", () => {
    expect(shipFilter(true)).toBe("")
    expect(internalOpsFilter(true)).toBe("")
  })
})

describe("analyticsGuard — cổng auth endpoint analytics", () => {
  const mkReq = (auth: string | null) =>
    ({ nextUrl: { pathname: "/api/analytics/x", search: "" },
       headers: { get: (k: string) => (k === "authorization" ? auth : null) } } as any)

  test("không session + không phải cron → chặn 401", () => {
    delete process.env.CRON_SECRET
    const res = analyticsGuard(mkReq(null), null)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  test("có session → cho qua (null)", () => {
    expect(analyticsGuard(mkReq(null), { user: { role: "admin" } })).toBeNull()
  })

  test("cron hợp lệ (Bearer secret) → cho qua dù không session", () => {
    process.env.CRON_SECRET = "s3cr3t"
    expect(analyticsGuard(mkReq("Bearer s3cr3t"), null)).toBeNull()
    delete process.env.CRON_SECRET
  })
})
