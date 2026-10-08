import { describe, test, expect } from "vitest"
import { toSpeechText, SPEECH_MAX_CHARS } from "../lib/speech-text"

describe("toSpeechText", () => {
  test("bỏ khối chart/export, thay bảng bằng 1 câu, bỏ ký hiệu markdown", () => {
    const md = "## Kết luận\nDoanh thu **6,27 tỷ**, [xem](https://x.y).\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```chart\n{}\n```\n- Ý `một`"
    expect(toSpeechText(md)).toBe("Kết luận\nDoanh thu 6,27 tỷ, xem.\n(Bảng số liệu xem trên màn hình.)\nÝ một")
  })
  test("cắt câu dài, báo phần còn lại", () => {
    const out = toSpeechText("chữ ".repeat(2000))
    expect(out.length).toBeLessThan(SPEECH_MAX_CHARS + 60)
    expect(out.endsWith("Phần còn lại xem trên màn hình.")).toBe(true)
  })
})
