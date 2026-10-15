import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { DEFAULT_ASSUMPTIONS } from "@/lib/bc-datapool/types"
import { build } from "@/lib/threehk-datapool/builder"
import { buildWorkbook } from "@/lib/threehk-datapool/export"
import { applyEdits, EDIT_SHEET_NAME, sanitizeEdits } from "@/lib/datapool-audit/edits"
import { compareCogs } from "@/lib/datapool-audit/compare"

const FX = { hkdPerUsd: 7.86, cnyPerUsd: 6.7, vndPerUsd: 26000, vndPerUsdInc: 25600 }
const FRAMES = { esimUsUsd: 0.51, simUsUsd: 0.34, simVnVnd: 11061 }
const result = () => build([{ input: { simType: "eSIM", supportCountryCode: "THA", isoCodes: "TH", countryNameEn: "Thailand", countryNameVn: "Thái Lan", plans: [{ policy: "F", amount: 5, unit: "GB", days: [5] }] }, price: { pricePerGbHkd: 5, network: "AIS", kyc: false }, tpls: [] }], { fx: FX, a: DEFAULT_ASSUMPTIONS, frames: FRAMES })

describe("chỉnh tay ô trước khi xuất", () => {
  test("áp đúng ô: tên đổi, giá vốn thành số cố định (mất công thức), ghi sheet 'Chỉnh sửa tay'", () => {
    const r = result()
    const wb = buildWorkbook(r, { fx: FX, a: DEFAULT_ASSUMPTIONS, frames: FRAMES })
    const ws = wb.Sheets["Template_sku_US"]
    expect(ws["K2"].f).toBeTruthy()                                             // trước khi sửa: công thức
    const edits = sanitizeEdits([
      { sheet: "skuUS", key: "ECTHA3DF00505", col: 6, value: "eSIM Thái Lan 5GB — TÊN SỬA TAY" },
      { sheet: "skuUS", key: "ECTHA3DF00505", col: 10, value: "2.5" },
      { sheet: "skuUS", key: "ECTHA3DF00505", col: 20, value: "HACK" },        // cột mã bị khoá
      { sheet: "skuUS", key: "KHONGCO", col: 6, value: "x" },                   // dòng không tồn tại
    ])
    expect(edits).toHaveLength(3)
    const { applied, skipped } = applyEdits(wb, r.sheets, edits)
    expect(applied).toBe(2); expect(skipped).toHaveLength(1)
    const row = r.sheets.skuUS.findIndex(x => x[20] === "ECTHA3DF00505") + 2
    expect(wb.Sheets["Template_sku_US"][`G${row}`].v).toBe("eSIM Thái Lan 5GB — TÊN SỬA TAY")
    expect(wb.Sheets["Template_sku_US"][`K${row}`].v).toBe(2.5)
    expect(wb.Sheets["Template_sku_US"][`K${row}`].f).toBeUndefined()
    expect(wb.Sheets["Template_sku_US"][`U${row}`].v).toBe("ECTHA3DF00505")       // mã giữ nguyên
    const log = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[EDIT_SHEET_NAME], { header: 1 })
    expect(log).toHaveLength(3); expect(log[2][2]).toBe("latestCogs")
  })
  test("sanitize bỏ dữ liệu rác", () => {
    expect(sanitizeEdits("x")).toEqual([]); expect(sanitizeEdits([{ sheet: "zzz", key: "a", col: 1, value: 1 }, { sheet: "skuUS", key: "a", col: 999, value: 1 }, null])).toEqual([])
  })
})

describe("so giá vốn (compareCogs)", () => {
  test("USD: khớp tuyệt đối mới là khớp, chênh 1 cent cũng là lệch (ROUNDUP hết)", () => {
    expect(compareCogs(1.76, 1.76, "USD").verdict).toBe("match")
    expect(compareCogs(1.76, 1.77, "USD").verdict).toBe("diff")
    expect(compareCogs(1.7, 1.77, "USD").verdict).toBe("diff")
  })
  test("VND: chênh bao nhiêu cũng là lệch; diffPct tính theo giá tính lại", () => {
    expect(compareCogs(54187, 54187 + 265, "VND").verdict).toBe("diff")
    expect(compareCogs(54187, 54187, "VND").verdict).toBe("match")
    // Gói nhỏ (Daily 1 ngày): chênh 2–8% chỉ vài trăm đồng nhưng là thay đổi thật, không được coi là làm tròn
    expect(compareCogs(7062, 6539, "VND").verdict).toBe("diff")
    expect(compareCogs(15760, 15169, "VND").verdict).toBe("diff")
    const c = compareCogs(54187, 48645, "VND")
    expect(c.verdict).toBe("diff"); expect(c.diffPct).toBeCloseTo(11.39, 1)
  })
})
