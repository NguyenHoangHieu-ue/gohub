import { describe, it, expect, vi, beforeEach } from "vitest"

const store = new Map<string, string>()          // app_settings giả: key → value
const deleted: { table: string; filters: Record<string, unknown> }[] = []

function table(name: string) {
  const filters: Record<string, unknown> = {}
  const c: any = {
    select: () => c,
    eq: (k: string, v: unknown) => { filters[k] = v; return c },
    order: () => c,
    maybeSingle: async () => ({ data: name === "app_settings" && store.has(String(filters.key)) ? { value: store.get(String(filters.key)) } : null, error: null }),
    upsert: async (row: { key: string; value: string }) => { store.set(row.key, row.value); return { error: null } },
    delete: () => {
      const d: any = {
        eq: (k: string, v: unknown) => { filters[k] = v; return d },
        select: async () => {
          deleted.push({ table: name, filters: { ...filters } })
          if (name === "app_settings") store.delete(String(filters.key))
          return { data: name === "assistant_memory" ? [{ id: 1 }, { id: 2 }] : [{ conversation_id: "a" }], error: null }
        },
        then: (res: (v: unknown) => unknown) => { deleted.push({ table: name, filters: { ...filters } }); if (name === "app_settings") store.delete(String(filters.key)); return Promise.resolve({ error: null }).then(res) },
      }
      return d
    },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
  }
  return c
}
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: (t: string) => table(t) } }))

import { isMemoryOff, setMemoryOff, eraseMemory, deleteMemoryItem, exportMemory } from "@/lib/assistant-memory-rights"

describe("quyền của người dùng với trí nhớ (P2)", () => {
  beforeEach(() => { store.clear(); deleted.length = 0 })

  it("tắt rồi bật lại trí nhớ", async () => {
    expect(await isMemoryOff("an")).toBe(false)
    await setMemoryOff("an", true)
    expect(await isMemoryOff("an")).toBe(true)
    expect(store.get("assistant_memory_off:an")).toBe("1")
    await setMemoryOff("an", false)
    expect(await isMemoryOff("an")).toBe(false)
  })

  it("không có username → coi như chưa tắt (không lỗi)", async () => {
    expect(await isMemoryOff(undefined)).toBe(false)
    expect(await isMemoryOff("")).toBe(false)
  })

  it("xoá tất cả chỉ xoá theo username của người gọi", async () => {
    const r = await eraseMemory("binh")
    expect(r).toEqual({ memories: 2, summaries: 1 })
    expect(deleted.every(d => d.filters.username === "binh")).toBe(true)
    expect(deleted.map(d => d.table).sort()).toEqual(["assistant_memory", "gp_conversation_memory"])
  })

  it("xoá 1 mục kèm điều kiện username (không xoá được mục người khác)", async () => {
    expect(await deleteMemoryItem("binh", 7)).toBe(true)
    expect(deleted[0].filters).toEqual({ id: 7, username: "binh" })
  })

  it("xuất dữ liệu theo username", async () => {
    const out = await exportMemory("binh")
    expect(out.username).toBe("binh")
    expect(out.memories).toEqual([])
    expect(out.conversation_summaries).toEqual([])
  })
})
