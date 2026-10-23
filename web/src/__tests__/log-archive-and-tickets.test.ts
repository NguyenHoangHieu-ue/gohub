import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn(), tursoConfigured: () => true }))
vi.mock("@/lib/lark", () => ({ getLarkToken: vi.fn() }))

import { toArchiveRow, cutoffIso, ARCHIVE_SOURCES } from "../lib/log-archive"
import { mapLarkTicket, larkString } from "../lib/lark-cs-tickets"

describe("log-archive (thuần)", () => {
  const msgSrc = ARCHIVE_SOURCES.find(s => s.table === "conversation_messages")!

  it("toArchiveRow giữ nguyên toàn bộ dòng dạng JSON, lấy id/ngày/ref (conversation_id)", () => {
    const row = { id: "m1", conversation_id: "c9", role: "user", content: "xin chào", created_at: "2026-10-05T01:00:00Z" }
    const a = toArchiveRow(msgSrc, row)
    expect(a).toMatchObject({ id: "m1", created_at: "2026-10-05T01:00:00Z", ref: "c9" })
    expect(JSON.parse(a.data)).toEqual(row)
  })

  it("id số (app_usage_events) thành chuỗi; thiếu cột ref thì ref rỗng", () => {
    const usage = ARCHIVE_SOURCES.find(s => s.table === "app_usage_events")!
    expect(toArchiveRow(usage, { id: 42, created_at: "2026-08-01T00:00:00Z", user_name: null }).id).toBe("42")
    expect(toArchiveRow(usage, { id: 42, created_at: "2026-08-01T00:00:00Z", user_name: null }).ref).toBe("")
    expect(toArchiveRow(usage, { id: 1, created_at: "x", user_name: "Hiếu" }).ref).toBe("Hiếu")
  })

  it("cutoffIso lùi đúng số ngày", () => {
    expect(cutoffIso(120, Date.parse("2026-10-23T00:00:00Z"))).toBe("2026-06-25T00:00:00.000Z")
  })

  it("hạn giữ: app_usage_events dài nhất trong nhóm quý; mỗi nguồn có hạn dương", () => {
    expect(ARCHIVE_SOURCES.every(s => s.keepDays >= 30)).toBe(true)
    expect(ARCHIVE_SOURCES.find(s => s.table === "app_usage_events")!.keepDays).toBeGreaterThanOrEqual(120)
  })
})

describe("lark-cs-tickets (thuần)", () => {
  it("larkString đọc chuỗi, mảng văn bản, object", () => {
    expect(larkString("  a ")).toBe("a")
    expect(larkString([{ text: "Vendor A" }])).toBe("Vendor A")
    expect(larkString({ name: "X" })).toBe("X")
    expect(larkString(null)).toBe("")
  })

  it("mapLarkTicket đổi bản ghi Lark thành ticket; ngày dạng số ms, leadtime dạng chuỗi", () => {
    const t = mapLarkTicket({
      record_id: "rec1",
      fields: {
        "Ticket No.": "T-1", "Order No.": "SO-9", SKU: [{ text: "3ETHNWMF01010" }], "Ticket Type": "Troubleshoot", "Issue Detail": "No signal",
        Vendor: "3HK", "Product Action": "Replacement", "Money Action": "GH - Full Refund", "Creation Date": 1760000000000,
        "Leadtime Done Ticket (Minutes)": "45 phút", "Source-1": "B2C", Source: "Web",
      },
    })
    expect(t).toMatchObject({ lark_record_id: "rec1", ticket_no: "T-1", sku: "3ETHNWMF01010", ticket_type: "Troubleshoot", creation_date: 1760000000000, leadtime_minutes: 45, source_1: "B2C" })
  })

  it("bản ghi không có record_id bị bỏ; ngày lỗi về 0", () => {
    expect(mapLarkTicket({ fields: {} })).toBeNull()
    expect(mapLarkTicket({ record_id: "r", fields: { "Creation Date": "không phải ngày" } })?.creation_date).toBe(0)
  })
})
