import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/lark", () => ({ getLarkUserToken: vi.fn() }))

import { parseLarkRef } from "@/lib/agents/creator/tools/lark-docs"

describe("parseLarkRef", () => {
  it("nhận link docx/sheets/wiki", () => {
    expect(parseLarkRef("https://gohub.sg.larksuite.com/docx/AbC123xyz?from=x")).toEqual({ type: "docx", token: "AbC123xyz" })
    expect(parseLarkRef("https://gohub.sg.larksuite.com/sheets/Shx9?sheet=abc")).toEqual({ type: "sheet", token: "Shx9" })
    expect(parseLarkRef("https://gohub.sg.larksuite.com/wiki/WkNode1")).toEqual({ type: "wiki", token: "WkNode1" })
  })
  it("token trần → unknown", () => {
    expect(parseLarkRef("  AbC123xyz ")).toEqual({ type: "unknown", token: "AbC123xyz" })
  })
})
