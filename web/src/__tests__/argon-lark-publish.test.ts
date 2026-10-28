import { describe, expect, it } from "vitest"
import type { FactRow } from "@/lib/argon/facts-pure"
import type { MailThreadRow } from "@/lib/argon/mail-status-pure"
import { contentHash, factsFor, indexMarkdown, profileMarkdown, threadsFor, vendorTargets, wikiNodesFor, memoriesFor } from "@/lib/argon/lark-publish-pure"

const F = (id: string, o: Partial<FactRow> = {}): FactRow => ({
  id, username: "u", type: "doi_gia", vendor: "3HK", subject: "Thái Lan", attribute: "", value: "", summary: "Giá 3.5 HKD/GB", evidence: "", effective_from: "2026-11-15", expires_at: null, status: "active", origin: "auto", edited: false,
  source_id: "s", source_name: "Mail 3HK", superseded_by: null, remind_days: 3, reminded_at: null, announced_at: null, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
  source_date: "2026-10-20", recorded_at: "2026-10-20T00:00:00Z", expired_at: null, change_note: "", needs_review: false, ...o,
})
const T = (o: Partial<MailThreadRow> = {}): MailThreadRow => ({ id: "t", username: "u", thread_id: "x", subject: "Re: 3HK top-up", counterparty: "Romy <romy@hthk.com>", last_message_id: "m", last_at: "2026-10-20T00:00:00Z", last_from_me: true, message_count: 2, status: "waiting_partner", status_by: "auto", summary: "", next_action: "Chờ Romy báo tiến độ", nudged_at: null, created_at: "", updated_at: "", ...o })

describe("profileMarkdown", () => {
  it("có đủ các mục và không chứa ngày giờ chạy (băm ổn định)", () => {
    const md = profileMarkdown({ name: "3HK", kind: "vendor", aliases: ["Three HK"], facts: [F("1", { needs_review: true })], changes: [F("1", { change_note: "giá: 3.0 → 3.5" })],
      related: [{ name: "Thái Lan", kind: "market", rels: ["bán ở"] }], mentions: [{ sourceName: "Mail 3HK", sourceDate: "2026-10-20", snippet: "Báo giá mới" }], threads: [T()] }, Date.UTC(2026, 9, 26))
    for (const h of ["## Sự việc đang hiệu lực", "## Thay đổi so với tin cũ", "## Luồng mail đang mở", "## Liên quan", "## Nằm ở đâu trong Kho"]) expect(md).toContain(h)
    expect(md).toContain("(chờ xác nhận)"); expect(md).toContain("giá: 3.0 → 3.5"); expect(md).toContain("Chờ đối tác"); expect(md).toContain("còn gọi: Three HK")
    expect(contentHash(md)).toBe(contentHash(md))
  })
  it("không có sự việc/luồng thì ghi rõ, bỏ các mục rỗng; ký tự | trong ô được thay để bảng không vỡ", () => {
    const md = profileMarkdown({ name: "X", kind: "market", aliases: [], facts: [], changes: [], related: [], mentions: [], threads: [] })
    expect(md).toContain("Không có sự việc nào đang hiệu lực."); expect(md).not.toContain("## Luồng mail"); expect(md).not.toContain("## Liên quan")
    expect(profileMarkdown({ name: "X", kind: "vendor", aliases: [], facts: [F("1", { summary: "a | b" })], changes: [], related: [], mentions: [], threads: [] })).toContain("a / b")
  })
})

describe("chọn dữ liệu liên quan", () => {
  it("factsFor: vendor trùng tên/bí danh; thực thể không phải vendor khớp đối tượng; bỏ sự việc không còn hiệu lực", () => {
    const facts = [F("1"), F("2", { vendor: "BC", subject: "Thái Lan Daily" }), F("3", { status: "superseded" })]
    expect(factsFor({ name: "3HK", kind: "vendor", aliases: [] }, facts).map(f => f.id)).toEqual(["1"])
    expect(factsFor({ name: "Three HK", kind: "vendor", aliases: ["3hk"] }, facts).map(f => f.id)).toEqual(["1"])
    expect(factsFor({ name: "Thái Lan", kind: "market", aliases: [] }, facts).map(f => f.id).sort()).toEqual(["1", "2"])
  })
  it("threadsFor khớp tên/bí danh trong tiêu đề, đối tác hoặc tóm tắt; bỏ khoá quá ngắn", () => {
    expect(threadsFor({ name: "3HK", aliases: [] }, [T(), T({ id: "o", subject: "Khác", counterparty: "a@b.c" })]).map(t => t.id)).toEqual(["t"])
    expect(threadsFor({ name: "HK", aliases: [] }, [T()])).toEqual([])
  })
})

describe("mục lục + băm", () => {
  it("indexMarkdown xếp theo số sự việc giảm dần và có link", () => {
    const md = indexMarkdown([{ name: "A", kind: "vendor", url: "https://a", facts: 1, mentions: 5 }, { name: "B", kind: "vendor", url: "https://b", facts: 3, mentions: 1 }])
    expect(md.indexOf("[B](https://b)")).toBeLessThan(md.indexOf("[A](https://a)"))
  })
  it("contentHash đổi khi nội dung đổi", () => { expect(contentHash("a")).not.toBe(contentHash("b")); expect(contentHash("a")).toBe(contentHash("a")) })
})

describe("vendorTargets", () => {
  it("lấy danh sách từ ref_vendors, gộp trùng tên, ghép thực thể theo tên/bí danh chính xác, bỏ thực thể không có trong DB", () => {
    const db = [{ vendor_code: "SI", name: "Simstore" }, { vendor_code: "SS", name: "Simstore" }, { vendor_code: "WM", name: "WORLDMOVE" }, { vendor_code: "3H", name: "3HK" }]
    const ents = [{ id: 1, name: "WorldMove", aliases: ["WM"], mentions: 9 }, { id: 2, name: "Công ty lạ", aliases: [], mentions: 50 }]
    const t = vendorTargets(db, ents)
    expect(t.map(x => x.name)).toEqual(["Simstore", "WORLDMOVE", "3HK"])
    expect(t[0].codes).toEqual(["SI", "SS"])
    expect(t[1].entity).toEqual({ id: 1, aliases: ["WM"], mentions: 9 })
    expect(t[2].entity).toBeNull()
  })
})

describe("Wiki + trí nhớ theo vendor", () => {
  const nodes = [
    { title: "3HK", nodeToken: "a", objType: "docx", parent: null }, { title: "Chính sách hoàn tiền", nodeToken: "b", objType: "docx", parent: "a" },
    { title: "Hợp đồng 3HK Datapool", nodeToken: "c", objType: "docx", parent: null }, { title: "Bảng giá", nodeToken: "d", objType: "sheet", parent: "a" },
    { title: "Elite", nodeToken: "e", objType: "docx", parent: null },
  ]
  it("wikiNodesFor: khớp theo từ trong tiêu đề, lấy cả trang con, chỉ docx", () => {
    expect(wikiNodesFor({ name: "3HK", aliases: [] }, nodes).map(n => n.nodeToken).sort()).toEqual(["a", "b", "c"])
    expect(wikiNodesFor({ name: "Elite", aliases: [] }, nodes).map(n => n.nodeToken)).toEqual(["e"])
    expect(wikiNodesFor({ name: "Joytel", aliases: [] }, nodes)).toEqual([])
  })
  it("memoriesFor: chỉ loại cho phép và phải nhắc đúng tên vendor theo từ", () => {
    const m = [{ kind: "decision", content: "Với 3HK luôn đặt trước 2 ngày" }, { kind: "preference", content: "3HK em trả lời ngắn" }, { kind: "other", content: "Elite chậm phản hồi" }, { kind: "decision", content: "Nhật dùng KDDI" }]
    expect(memoriesFor({ name: "3HK", aliases: [] }, m)).toEqual(["Với 3HK luôn đặt trước 2 ngày"])
    expect(memoriesFor({ name: "Elite", aliases: [] }, m)).toEqual(["Elite chậm phản hồi"])
  })
})
