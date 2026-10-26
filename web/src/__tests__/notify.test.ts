import { describe, expect, it } from "vitest"
import { formatNotice, isQuietHour, mergeQueued, vnDay } from "@/lib/notify-pure"

// 2026-10-26 02:00 UTC = 09:00 giờ VN
const AT_9H_VN = Date.UTC(2026, 9, 26, 2, 0)

describe("notify-pure", () => {
  it("đầu tin theo khuôn [Loại · Nguồn] Tiêu đề — dd/MM", () => {
    const t = formatNotice({ kind: "Báo cáo", source: "Gấu Pro", title: "Digest sáng", body: "Doanh thu hôm qua: 1", link: { label: "Xem", url: "https://x/y" } }, AT_9H_VN)
    expect(t.split("\n")[0]).toBe("📊 [Báo cáo · Gấu Pro] Digest sáng — 26/10")
    expect(t).toContain("Doanh thu hôm qua: 1")
    expect(t.endsWith("Xem: https://x/y")).toBe(true)
  })

  it("tiêu đề nhiều dòng được gộp một dòng; không body/link thì chỉ có đầu tin", () => {
    expect(formatNotice({ kind: "Tin", source: "Hệ thống", title: "a\n  b" }, AT_9H_VN)).toBe("🔔 [Tin · Hệ thống] a b — 26/10")
  })

  it("ngày theo giờ VN (qua nửa đêm UTC)", () => {
    expect(vnDay(Date.UTC(2026, 9, 25, 18, 0))).toBe("26/10")
  })

  it("giờ yên lặng 22:00–07:00 giờ VN", () => {
    expect(isQuietHour(Date.UTC(2026, 9, 26, 15, 0))).toBe(true)   // 22:00 VN
    expect(isQuietHour(Date.UTC(2026, 9, 26, 23, 59))).toBe(true)  // 06:59 VN
    expect(isQuietHour(Date.UTC(2026, 9, 27, 0, 0))).toBe(false)   // 07:00 VN
    expect(isQuietHour(Date.UTC(2026, 9, 26, 14, 59))).toBe(false) // 21:59 VN
  })

  it("gom hàng đợi: 1 tin giữ nguyên, nhiều tin → một tin gộp theo người nhận", () => {
    const out = mergeQueued([
      { to: "a", text: "T1", at: 2 }, { to: "b", text: "Tb", at: 1 }, { to: "a", text: "T0", at: 1 },
    ], AT_9H_VN)
    expect(out.find(o => o.to === "b")?.text).toBe("Tb")
    const a = out.find(o => o.to === "a")!.text
    expect(a.split("\n")[0]).toBe("🔔 [Tin gom · Hệ thống] 2 tin trong giờ yên lặng — 26/10")
    expect(a.indexOf("T0")).toBeLessThan(a.indexOf("T1"))
  })
})
