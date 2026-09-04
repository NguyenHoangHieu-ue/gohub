import { vi, describe, test, expect } from "vitest"

// L2 cache (Supabase) mock: không hit sẵn (maybeSingle → null), upsert no-op → cô lập L1 in-memory.
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
  cachedQuery, isCronReq, analyticsGuard,
  excludeInactiveCustomers, buildIsStrategicSql, shipFilter, internalOpsFilter,
} from "@/lib/analytics-helpers"

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
