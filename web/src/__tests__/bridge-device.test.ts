import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))

import { parseDeviceInfo, clientIp } from "@/lib/bridge-device"

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64")

describe("bridge-device — parseDeviceInfo", () => {
  it("header rỗng / base64 hỏng / không phải object → null", () => {
    expect(parseDeviceInfo(null)).toBeNull()
    expect(parseDeviceInfo("###")).toBeNull()
    expect(parseDeviceInfo(b64("chuỗi"))).toBeNull()
  })

  it("giữ đúng field hợp lệ, hỗ trợ tiếng Việt UTF-8", () => {
    const info = parseDeviceInfo(b64({ os: "win", arch: "x86-64", chrome_email: "nguyễn@gohub.vn", cpu_cores: 8, memory_gb: 16 }))
    expect(info).toMatchObject({ os: "win", arch: "x86-64", chrome_email: "nguyễn@gohub.vn", cpu_cores: 8, memory_gb: 16 })
  })

  it("cắt chuỗi quá dài, bỏ số không hợp lệ và field lạ", () => {
    const info = parseDeviceInfo(b64({ os: "x".repeat(500), cpu_cores: -1, memory_gb: "8", secret: "abc" }))!
    expect(info.os).toHaveLength(40)
    expect(info.cpu_cores).toBeUndefined()
    expect(info.memory_gb).toBeUndefined()
    expect((info as any).secret).toBeUndefined()
  })
})

describe("bridge-device — clientIp", () => {
  const req = (h: Record<string, string>) => ({ headers: { get: (k: string) => h[k.toLowerCase()] ?? null } }) as any

  it("ưu tiên IP đầu trong x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4")
  })
  it("rơi về x-real-ip, không có thì null", () => {
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    expect(clientIp(req({}))).toBeNull()
  })
})
