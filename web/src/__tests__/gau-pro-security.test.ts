/**
 * Regression test cho fix bảo mật s196+5 (P0): querySupabase/listSupabaseTables trước đây cho MỌI
 * user Gấu Pro (kể cả gp_allowed_users non-creator) đọc bảng nhạy cảm (app_settings/conversations/...).
 * Không cần DB/Gemini thật — mock supabaseAdmin + data-explorer table lists.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/agents/data-explorer", () => ({
  SUPABASE_TABLES:  { products: "Sản phẩm" },
  SENSITIVE_TABLES: { app_settings: "Cấu hình hệ thống (chứa policy/secret)", conversations: "Hội thoại (PII)" },
}))

function makeChain(result: any) {
  const chain: any = {
    select: () => chain, filter: () => chain, in: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

const fromMock = vi.fn(() => makeChain({ data: [{ ok: true }], count: 1, error: null }))
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => fromMock() } }))
vi.mock("@/lib/web-search", () => ({ runWebSearch: vi.fn(), runWebSearchTool: vi.fn() }))
vi.mock("@/lib/ga4", () => ({ runGA4Report: vi.fn(), runGSC: vi.fn(), ga4Sites: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/lark", () => ({ getLarkToken: vi.fn(), getLarkUserToken: vi.fn() }))

import { runQuerySupabase, visibleTables } from "@/lib/agents/creator/tools/supabase"
import { dispatchTool } from "@/lib/agents/creator/tools/dispatch"

describe("Gấu Pro — bảo mật querySupabase (s196+5 P0)", () => {
  it("visibleTables(false) KHÔNG chứa bảng nhạy cảm", () => {
    const t = visibleTables(false)
    expect(t.app_settings).toBeUndefined()
    expect(t.conversations).toBeUndefined()
    expect(t.products).toBeTruthy()
  })

  it("visibleTables(true) chứa cả bảng nhạy cảm", () => {
    const t = visibleTables(true)
    expect(t.app_settings).toBeTruthy()
    expect(t.conversations).toBeTruthy()
  })

  it("non-creator query bảng nhạy cảm (app_settings) → lỗi rõ ràng, KHÔNG trả data", async () => {
    const r = await runQuerySupabase({ table: "app_settings" }, false)
    expect(r.error).toBeTruthy()
    expect(r.error).toMatch(/creator/i)
    expect(r.rows).toBeUndefined()
  })

  it("creator query bảng nhạy cảm (app_settings) → cho phép, không lỗi", async () => {
    const r = await runQuerySupabase({ table: "app_settings" }, true)
    expect(r.error).toBeUndefined()
    expect(r.rows).toBeDefined()
  })

  it("non-creator query bảng thường (products) → cho phép bình thường", async () => {
    const r = await runQuerySupabase({ table: "products" }, false)
    expect(r.error).toBeUndefined()
  })

  it("dispatchTool: querySupabase bảng nhạy cảm + ctx.isCreator=false → chặn end-to-end", async () => {
    const r = await dispatchTool({ name: "querySupabase", args: { table: "conversations" } }, undefined, [], { isCreator: false })
    expect(r.functionResponse.response.error).toMatch(/creator/i)
  })

  it("dispatchTool: listSupabaseTables + ctx.isCreator=false → không liệt kê bảng nhạy cảm", async () => {
    const r = await dispatchTool({ name: "listSupabaseTables", args: {} }, undefined, [], { isCreator: false })
    expect(r.functionResponse.response.tables.app_settings).toBeUndefined()
  })

  it("dispatchTool: listSupabaseTables + ctx.isCreator=true → liệt kê đủ cả bảng nhạy cảm", async () => {
    const r = await dispatchTool({ name: "listSupabaseTables", args: {} }, undefined, [], { isCreator: true })
    expect(r.functionResponse.response.tables.app_settings).toBeTruthy()
  })
})
