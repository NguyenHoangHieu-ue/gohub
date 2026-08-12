/**
 * Test suite cho Gấu Pro creator/ modules (Phase 2).
 * Chỉ test các hàm THUẦN (không cần DB/Gemini).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Types & constants ────────────────────────────────────────────────────────

import { TOOL_STATUS }          from "@/lib/agents/creator/types"
import { ALL_TOOL_DECLARATIONS } from "@/lib/agents/creator/declarations"
import { buildDateContext }     from "@/lib/agents/creator/build-date-context"

describe("TOOL_STATUS", () => {
  it("có entry cho các tools thường dùng", () => {
    expect(TOOL_STATUS.executeSQL).toBeTruthy()
    expect(TOOL_STATUS.querySupabase).toBeTruthy()
    expect(TOOL_STATUS.generateImage).toBeTruthy()
    expect(TOOL_STATUS.readKnowledgeBase).toBeTruthy()
    expect(TOOL_STATUS.writeKnowledgeBase).toBeTruthy()
    expect(TOOL_STATUS.getTrendSnapshots).toBeTruthy()
    expect(TOOL_STATUS.listLarkTasks).toBeTruthy()
    // Phase 4 tools
    expect(TOOL_STATUS.sendLarkMessage).toBeTruthy()
    expect(TOOL_STATUS.compareVendorQuotes).toBeTruthy()
    expect(TOOL_STATUS.trackSKUWinRate).toBeTruthy()
    expect(TOOL_STATUS.browsePortal).toBeUndefined()  // handled specially
    expect(TOOL_STATUS.webSearch).toBeUndefined()     // handled specially
  })

  it("không có trailing whitespace trong values", () => {
    Object.values(TOOL_STATUS).forEach(v => {
      expect(v).toBe(v.trim())
    })
  })
})

// ─── Declarations ─────────────────────────────────────────────────────────────

describe("ALL_TOOL_DECLARATIONS", () => {
  it("có đúng 29 declarations (22 gốc + 3 Phase 4 + 4 Phase 3+KB)", () => {
    expect(ALL_TOOL_DECLARATIONS).toHaveLength(29)
  })

  it("mỗi declaration có name, description, parameters", () => {
    for (const decl of ALL_TOOL_DECLARATIONS) {
      expect(decl.name, `${decl.name}: thiếu name`).toBeTruthy()
      expect(decl.description, `${decl.name}: thiếu description`).toBeTruthy()
      expect(decl.parameters, `${decl.name}: thiếu parameters`).toBeDefined()
    }
  })

  it("tên declarations không bị trùng", () => {
    const names = ALL_TOOL_DECLARATIONS.map(d => d.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it("executeSQL có required = ['sql']", () => {
    const decl = ALL_TOOL_DECLARATIONS.find(d => d.name === "executeSQL")
    expect((decl?.parameters as any)?.required).toContain("sql")
  })

  it("querySupabase có required = ['table']", () => {
    const decl = ALL_TOOL_DECLARATIONS.find(d => d.name === "querySupabase")
    expect((decl?.parameters as any)?.required).toContain("table")
  })

  it("generateImage có required = ['prompt']", () => {
    const decl = ALL_TOOL_DECLARATIONS.find(d => d.name === "generateImage")
    expect((decl?.parameters as any)?.required).toContain("prompt")
  })

  it("browsePortal có required = ['portal_name']", () => {
    const decl = ALL_TOOL_DECLARATIONS.find(d => d.name === "browsePortal")
    expect((decl?.parameters as any)?.required).toContain("portal_name")
  })

  it("managePortalCredentials có required = ['action']", () => {
    const decl = ALL_TOOL_DECLARATIONS.find(d => d.name === "managePortalCredentials")
    expect((decl?.parameters as any)?.required).toContain("action")
  })

  it("danh sách tools gồm đủ Lark tools", () => {
    const names = ALL_TOOL_DECLARATIONS.map(d => d.name)
    expect(names).toContain("listLarkTasks")
    expect(names).toContain("listLarkTasklists")
    expect(names).toContain("getLarkTask")
    expect(names).toContain("createLarkTask")
    expect(names).toContain("updateLarkTask")
    expect(names).toContain("queryLarkBase")
  })
})

// ─── buildDateContext ─────────────────────────────────────────────────────────

describe("buildDateContext", () => {
  it("trả về string không rỗng", () => {
    const ctx = buildDateContext()
    expect(typeof ctx).toBe("string")
    expect(ctx.length).toBeGreaterThan(100)
  })

  it("chứa năm hiện tại", () => {
    const ctx = buildDateContext()
    expect(ctx).toContain(new Date().getFullYear().toString())
  })

  it("chứa 'Hôm nay:'", () => {
    expect(buildDateContext()).toContain("Hôm nay:")
  })

  it("chứa 'MTD'", () => {
    expect(buildDateContext()).toContain("MTD")
  })

  it("chứa 'YTD'", () => {
    expect(buildDateContext()).toContain("YTD")
  })

  it("chứa 'tháng trước'", () => {
    expect(buildDateContext()).toContain("tháng trước")
  })

  it("chứa 'CURRENT_DATE-1' (data cutoff hint)", () => {
    expect(buildDateContext()).toContain("CURRENT_DATE-1")
  })
})

// ─── SQL guard (runExecuteSQL, không cần DB) ──────────────────────────────────

import { runExecuteSQL } from "@/lib/agents/creator/tools/sql"

// Mock queryAnalytics và cachedQuery để không hit DB
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/analytics-helpers", () => ({
  cachedQuery: vi.fn((_key: string, fn: () => Promise<any>) => fn()),
  getDaysInMonth: vi.fn(), getDaysInRange: vi.fn(),
  getMonthsInRange: vi.fn(), getChannelCostsForMonths: vi.fn(),
}))

describe("runExecuteSQL — SQL guards", () => {
  it("chặn non-SELECT: DROP TABLE", async () => {
    const r = await runExecuteSQL("DROP TABLE users")
    expect(r.error).toContain("SELECT")
  })

  it("chặn non-SELECT: INSERT", async () => {
    const r = await runExecuteSQL("INSERT INTO foo VALUES (1)")
    expect(r.error).toContain("SELECT")
  })

  it("chặn multi-statement", async () => {
    const r = await runExecuteSQL("SELECT 1; DROP TABLE users;")
    expect(r.error).toContain("Multiple")
  })

  it("chấp nhận SELECT", async () => {
    const r = await runExecuteSQL("SELECT 1")
    expect(r.error).toBeUndefined()
  })

  it("chấp nhận WITH ... SELECT (CTE)", async () => {
    const r = await runExecuteSQL("WITH x AS (SELECT 1) SELECT * FROM x")
    expect(r.error).toBeUndefined()
  })
})

// ─── dispatchTool — unknown tool ──────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) } }))
vi.mock("@/lib/agents/data-explorer", () => ({ SUPABASE_TABLES: {}, SENSITIVE_TABLES: {} }))
vi.mock("@/lib/web-search", () => ({ runWebSearch: vi.fn(), runWebSearchTool: vi.fn() }))
vi.mock("@/lib/ga4", () => ({ runGA4Report: vi.fn(), runGSC: vi.fn(), ga4Sites: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/lark", () => ({ getLarkToken: vi.fn(), getLarkUserToken: vi.fn() }))

import { dispatchTool } from "@/lib/agents/creator/tools/dispatch"

describe("dispatchTool", () => {
  it("unknown tool → response.error = 'Unknown tool'", async () => {
    const r = await dispatchTool({ name: "nonExistentTool_xyz", args: {} }, undefined, [])
    expect(r.functionResponse.response.error).toBe("Unknown tool")
  })

  it("functionResponse.name khớp với call.name", async () => {
    const r = await dispatchTool({ name: "nonExistentTool_xyz", args: {} }, undefined, [])
    expect(r.functionResponse.name).toBe("nonExistentTool_xyz")
  })

  it("gọi onEvent với status message trước khi execute", async () => {
    const events: any[] = []
    const onEvent = (e: any) => events.push(e)
    await dispatchTool({ name: "listSupabaseTables", args: {} }, onEvent, [])
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe("status")
    expect(events[0].text).toBeTruthy()
  })

  it("listSupabaseTables → trả tables object", async () => {
    const r = await dispatchTool({ name: "listSupabaseTables", args: {} }, undefined, [])
    expect(r.functionResponse.response).toHaveProperty("tables")
  })
})
