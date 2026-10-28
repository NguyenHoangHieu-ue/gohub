import { describe, expect, it } from "vitest"
import { ACT_NAME, ACT_TOOLS, MAX_PROPOSALS_PER_RUN, MEMBER_ACT_TOOLS, execActTool, validateProposal } from "@/lib/argon/act-tool"
import { TOOL_LEVELS } from "@/lib/argon/run-safety"
import { MEMBER_BLOCKED_TOOLS } from "@/lib/argon/access-pure"
import { FAST_TOOL_NAMES, routeRun } from "@/lib/argon/run-route"
import { PARALLEL_SAFE } from "@/lib/argon/parallel-tools"

describe("deXuatThaoTac — hành động ra ngoài chỉ qua thẻ duyệt", () => {
  it("bậc L3 (chỉ tạo đề xuất), thành viên dùng được (giới hạn công cụ), không chạy ở đường nhanh, không song song", () => {
    expect(TOOL_LEVELS[ACT_NAME]).toBe("L3")
    expect(MEMBER_BLOCKED_TOOLS).not.toContain(ACT_NAME)
    expect(FAST_TOOL_NAMES).not.toContain(ACT_NAME)
    expect(PARALLEL_SAFE.has(ACT_NAME)).toBe(false)
  })
  it("chỉ cho đề xuất các công cụ ghi đã chọn — không có trình duyệt/máy/portal", () => {
    expect(ACT_TOOLS).toEqual(["sendLarkMessage", "createLarkTask", "updateLarkTask", "scheduleTask", "larkDocs", "googleWorkspace", "devTicket", "localFiles"])
    for (const n of ["controlMyBrowser", "browsePortal", "managePortalCredentials", "writeKnowledgeBase"]) {
      expect(validateProposal(n, { action: "x" }), n).toMatch(/không nằm trong danh sách/)
    }
  })
  it("thành viên chỉ đề xuất task Lark/lịch/phiếu — không gửi tin, Lark Doc, Google, tệp máy", () => {
    expect(MEMBER_ACT_TOOLS).toEqual(["createLarkTask", "updateLarkTask", "scheduleTask", "devTicket"])
    for (const n of ["sendLarkMessage", "larkDocs", "googleWorkspace", "localFiles"]) expect(validateProposal(n, { content: "x", lark_id: "ou_1", action: "create_doc", path: "a" }, true), n).toMatch(/chỉ Creator/)
    expect(validateProposal("createLarkTask", { summary: "x" }, true)).toBeNull()
    expect(validateProposal("sendLarkMessage", { content: "x", lark_id: "ou_1" }, false)).toBeNull()
  })
  it("kiểm tham số tối thiểu từng công cụ", () => {
    expect(validateProposal("sendLarkMessage", { content: "hi" })).toMatch(/chat_id hoặc lark_id/)
    expect(validateProposal("sendLarkMessage", { content: "hi", lark_id: "ou_1" })).toBeNull()
    expect(validateProposal("sendLarkMessage", { chat_id: "oc_1" })).toMatch(/content/)
    expect(validateProposal("createLarkTask", {})).toMatch(/summary/)
    expect(validateProposal("createLarkTask", { summary: "Gọi lại HTHK" })).toBeNull()
    expect(validateProposal("scheduleTask", { action: "list" })).toMatch(/không phải list/)
    expect(validateProposal("larkDocs", { action: "read" })).toMatch(/chỉ đề xuất ghi/)
    expect(validateProposal("larkDocs", { action: "create_doc", title: "x", content: "y" })).toBeNull()
    expect(validateProposal("googleWorkspace", { action: "read" })).toMatch(/ghi\/tạo/)
    expect(validateProposal("localFiles", { action: "read", path: "C:/a.txt" })).toMatch(/docTepMay/)
    expect(validateProposal("localFiles", { action: "write", path: "C:/a.txt", content: "x" })).toBeNull()
    expect(validateProposal("localFiles", { action: "write", path: "C:/a.txt" })).toMatch(/content/)
    expect(validateProposal("localFiles", { action: "edit", path: "C:/a.txt", find: "a", replace: "b" })).toBeNull()
    expect(validateProposal("devTicket", { action: "create", title: "t" })).toMatch(/plan/)
    expect(validateProposal("devTicket", { action: "create", title: "t", plan: "p" })).toBeNull()
  })
  it("tham số hỏng → từ chối trước khi chạm DB", async () => {
    const o = { username: "u", used: 0, tainted: false }
    expect((await execActTool({ tool: "sendLarkMessage", argsJson: "không phải json" }, o)).ok).toBe(false)
    expect((await execActTool({ tool: "sendLarkMessage", argsJson: "[1]" }, o)).ok).toBe(false)
    expect((await execActTool({ tool: "sendLarkMessage", argsJson: "{\"content\":\"x\"}" }, o)).result).toMatch(/lark_id/)
    expect((await execActTool({ tool: "localFiles", argsJson: "{}" }, o)).ok).toBe(false)
  })
  it("áp trần số đề xuất mỗi lượt", async () => {
    const r = await execActTool({ tool: "createLarkTask", argsJson: "{\"summary\":\"x\"}" }, { username: "u", used: MAX_PROPOSALS_PER_RUN, tainted: false })
    expect(r.ok).toBe(false)
    expect(r.result).toMatch(/chờ anh duyệt/)
  })
  it("câu nhờ làm việc ra ngoài không đi đường nhanh", () => {
    for (const q of ["Gửi tin cho Romy hỏi tiến độ", "Tạo task nhắc tôi gọi HTHK", "Đặt lịch nhắc mai 10h"]) expect(routeRun(q, { mission: true }).route, q).toBe("full")
  })
})
