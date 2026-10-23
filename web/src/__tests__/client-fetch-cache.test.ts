import { describe, test, expect, beforeEach, vi } from "vitest"
import { cacheKeyFor, installFetchCache, _resetFetchCacheForTest, TELEMETRY } from "../lib/client-fetch-cache"
import { readStale, writeStale } from "../lib/stale-first"

const ORIGIN = "http://app.test"

function setup() {
  const calls: string[] = []
  const nativeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = typeof input === "string" ? input : String(input)
    calls.push(url)
    return new Response(JSON.stringify({ n: calls.length }), { status: 200, headers: { "content-type": "application/json" } })
  })
  const ss = new Map<string, string>()
  const sessionStorage = {
    get length() { return ss.size }, key: (i: number) => [...ss.keys()][i] ?? null,
    getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, v), removeItem: (k: string) => void ss.delete(k),
  }
  const win = { fetch: nativeFetch, location: { origin: ORIGIN } }
  vi.stubGlobal("window", win)
  vi.stubGlobal("sessionStorage", sessionStorage)
  _resetFetchCacheForTest()
  installFetchCache()
  return { calls, win, ss }
}

describe("client-fetch-cache", () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  test("cacheKeyFor chỉ nhận GET analytics/config, loại các đường dẫn cần luôn tươi", () => {
    expect(cacheKeyFor("/api/analytics/bod-summary?a=1", undefined, ORIGIN)).toBe("/api/analytics/bod-summary?a=1")
    expect(cacheKeyFor("/api/config/squad-config", undefined, ORIGIN)).toBe("/api/config/squad-config")
    expect(cacheKeyFor("/api/analytics/bod-summary?nocache=1", undefined, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/analytics/bod-summary?refresh=1", undefined, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/analytics/my-metrics/x", undefined, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/analytics/data-freshness", undefined, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/chat/stream", undefined, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/analytics/x", { method: "POST" }, ORIGIN)).toBeNull()
    expect(cacheKeyFor("/api/analytics/x", { headers: { a: "b" } }, ORIGIN)).toBeNull()
    expect(cacheKeyFor("https://other.test/api/analytics/x", undefined, ORIGIN)).toBeNull()
  })

  test("request giống nhau chạy đồng thời chỉ gọi mạng 1 lần; lần sau trong 60s lấy từ bộ nhớ", async () => {
    const { calls, win } = setup()
    const [a, b] = await Promise.all([win.fetch("/api/analytics/x?q=1"), win.fetch("/api/analytics/x?q=1")])
    expect(await a.json()).toEqual({ n: 1 })
    expect(await b.json()).toEqual({ n: 1 })
    await win.fetch("/api/analytics/x?q=1")
    expect(calls).toHaveLength(1)
    await win.fetch("/api/analytics/x?q=2")
    expect(calls).toHaveLength(2)
  })

  test("thao tác ghi xoá bộ nhớ và dữ liệu số-cũ-trước", async () => {
    const { calls, win } = setup()
    await win.fetch("/api/analytics/x?q=1")
    writeStale("k", { v: 1 })
    expect(readStale("k")).not.toBeNull()
    await win.fetch("/api/analytics/quarterly-targets", { method: "POST", body: "{}" })
    expect(readStale("k")).toBeNull()
    await win.fetch("/api/analytics/x?q=1")
    expect(calls.filter(c => c.includes("q=1"))).toHaveLength(2)
  })

  test("nocache=1 luôn đi mạng; huỷ bởi signal chỉ huỷ người gọi đó", async () => {
    const { calls, win } = setup()
    await win.fetch("/api/analytics/x?nocache=1")
    await win.fetch("/api/analytics/x?nocache=1")
    expect(calls).toHaveLength(2)
    const ctrl = new AbortController()
    const p = win.fetch("/api/analytics/y", { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: "AbortError" })
    const other = await win.fetch("/api/analytics/y")
    expect(other.ok).toBe(true)
  })

  test("stale-first: hết hạn thì bỏ, quá lớn thì không lưu", () => {
    setup()
    writeStale("a", { v: 1 })
    expect(readStale<{ v: number }>("a")?.data.v).toBe(1)
    expect(readStale("a", -1)).toBeNull()
    writeStale("big", "x".repeat(1_300_000))
    expect(readStale("big")).toBeNull()
  })

  test("POST nền (track, heartbeat) KHÔNG xoá bộ nhớ; POST ghi dữ liệu thì xoá", async () => {
    const { calls, win } = setup()
    expect(TELEMETRY.test("/api/analytics/track")).toBe(true)
    expect(TELEMETRY.test("/api/user/heartbeat")).toBe(true)
    expect(TELEMETRY.test("/api/analytics/b2b-customer-targets")).toBe(false)
    expect(TELEMETRY.test("/api/channel-costs")).toBe(false)
    expect(TELEMETRY.test("/api/analytics/query")).toBe(true)
    expect(TELEMETRY.test("/api/analytics/vendors/report")).toBe(true)
    expect(TELEMETRY.test("/api/admin/sql-query")).toBe(true)
    expect(TELEMETRY.test("/api/analytics/quarterly-targets")).toBe(false)
    await win.fetch("/api/analytics/x?q=1")
    writeStale("k2", { v: 1 })
    await win.fetch("/api/analytics/track", { method: "POST", body: "{}" })
    await win.fetch("/api/user/heartbeat", { method: "POST" })
    expect(readStale("k2")).not.toBeNull()
    await win.fetch("/api/analytics/x?q=1")
    expect(calls.filter(c => c.includes("q=1"))).toHaveLength(1)
    await win.fetch("/api/channel-costs", { method: "POST", body: "{}" })
    expect(readStale("k2")).toBeNull()
  })
})
