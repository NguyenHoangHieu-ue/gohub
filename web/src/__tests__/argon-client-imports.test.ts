import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

// Client component KHÔNG được import "@/lib/supabase" (tạo client admin cần SUPABASE_SERVICE_KEY, chỉ có ở server → sập trắng cả trang khi nạp).
// Dùng "@/lib/supabase-browser". (Sự cố 2026-10-14: Phòng Argon trắng trang trên staging.)
const DIR = path.resolve(__dirname, "../app/(dashboard)/analytics/creator/argon")

describe("Phòng Argon: file giao diện", () => {
  const walk = (d: string): string[] => fs.readdirSync(path.join(DIR, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []))
  const files = walk("")
  it("có file giao diện để kiểm tra", () => { expect(files.length).toBeGreaterThan(3) })
  for (const f of files) {
    it(`${f} không import @/lib/supabase (server-only)`, () => {
      const src = fs.readFileSync(path.join(DIR, f), "utf8")
      expect(/from\s+["']@\/lib\/supabase["']/.test(src)).toBe(false)
      expect(/from\s+["']@\/lib\/(argon\/(server|context|ingest|lark|lark-sync|mail|mail-sync)|lark)["']/.test(src)).toBe(false)
    })
  }
})
