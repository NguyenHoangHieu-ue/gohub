import { describe, expect, test } from "vitest"
import { findApnBlock, productBase, type ApnBlock } from "@/lib/ncc-wm-apn"

const blk = (name: string, apn: string): ApnBlock => ({ name, prepaid: null, localSource: null, apn, networkType: "5G/4G", onsiteCarrier: apn, providers: null, coverage: null, dataReset: null, notification: null })
const blocks = [
  blk("Mainland China", "g"), blk("Mainland China, 15/20/30 Days, Unlimited data /day", "u"), blk("Mainland China, 15/20/30 Days, Premium unlimited data/day", "p"),
  blk("South Korea", "k"), blk("Mongolia Unitel", "m"), blk("Three UK-AIO 10/15/20/35", "t"),
]

describe("file APN của WM", () => {
  test("tên cơ sở của sản phẩm", () => {
    expect(productBase("China, Hong Kong, Macao A, 10 Days, 500MB/day, 128kbps")).toBe("China, Hong Kong, Macao A")
    expect(productBase("Mainland China, 15/20/30 Days, Unlimited data /day")).toBe("Mainland China")
  })
  test("khối đặc thù (Unlimited/Premium) ưu tiên hơn khối chung; ngày không khớp thì về khối chung", () => {
    expect(findApnBlock(blocks, "Mainland China, 15 Days, Unlimited data /day")?.apn).toBe("u")
    expect(findApnBlock(blocks, "Mainland China, 15 Days, Premium unlimited data/day")?.apn).toBe("p")
    expect(findApnBlock(blocks, "Mainland China, 10 Days, 1GB/day, 128kbps")?.apn).toBe("g")
    expect(findApnBlock(blocks, "Mainland China, 10 Days, Unlimited data /day")?.apn).toBe("g")
  })
  test("Korea = South Korea; khớp mềm theo bộ từ; không có thì null", () => {
    expect(findApnBlock(blocks, "Korea, 30 Days, 3GB, 128kbps")?.apn).toBe("k")
    expect(findApnBlock(blocks, "Unitel Mongolia, 3 Days , 5GB")?.apn).toBe("m")
    expect(findApnBlock(blocks, "Three UK-AIO10")?.apn).toBe("t")
    expect(findApnBlock(blocks, "MTS Russia, 30 Days, 20GB")).toBeNull()
  })
})
