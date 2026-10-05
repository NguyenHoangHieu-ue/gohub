import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { BRIDGE_LATEST_VERSION } from "@/lib/bridge-version"

// Sửa browser-extension/ + tăng version mà QUÊN chạy `python web/scripts/pack_bridge_extension.py` → người dùng tải zip cũ,
// popup báo sai phiên bản. Test này đỏ ngay khi 3 nơi lệch nhau.
describe("Extension Bridge — phiên bản đồng bộ", () => {
  const root = join(__dirname, "..", "..", "..")
  it("manifest = hằng số server = zip tải về", () => {
    const manifest = JSON.parse(readFileSync(join(root, "browser-extension", "manifest.json"), "utf8"))
    expect(BRIDGE_LATEST_VERSION).toBe(manifest.version)
    const zip = readFileSync(join(root, "web", "public", "downloads", "gau-pro-bridge.zip")).toString("utf8")
    expect(zip).toContain(`"version": "${manifest.version}"`)
    const bg = readFileSync(join(root, "browser-extension", "background.js"), "utf8")
    expect(zip).toContain(bg.slice(0, 200))   // zip chứa background.js hiện tại (đóng gói không nén)
  })
})
