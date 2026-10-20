import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))

import { MAX_OPEN_FORECASTS, addForecast, dueBlock, dueForecasts, execRecord, execScore, normalizeForecast, scoreForecast, summarize, type Forecast } from "@/lib/argon/forecast-tool"

const TODAY = "2026-10-20"
const METHOD = "layDuLieuHeThong period-overview Q4-2026: %3HK contribution, cả quý đến ngày kiểm tra"
const base = { noiDung: "Nếu chuyển TH, JP, KR sang BC thì %Datapool Q4 lên khoảng 76%", giaTriDuKien: 76, donVi: "%", ngayKiemTra: "2026-11-03", cachDo: METHOD }

describe("sổ dự đoán: ghi", () => {
  it("chuẩn hoá: cần câu rõ, cách đo đủ chi tiết, ngày hợp lệ (từ ngày mai, tối đa 120 ngày)", () => {
    expect("error" in normalizeForecast(base, TODAY)).toBe(false)
    expect("error" in normalizeForecast({ ...base, noiDung: "ngắn" }, TODAY)).toBe(true)
    expect("error" in normalizeForecast({ ...base, cachDo: "đo lại" }, TODAY)).toBe(true)
    expect("error" in normalizeForecast({ ...base, ngayKiemTra: "20/11/2026" }, TODAY)).toBe(true)
    expect("error" in normalizeForecast({ ...base, ngayKiemTra: TODAY }, TODAY)).toBe(true)
    expect("error" in normalizeForecast({ ...base, ngayKiemTra: "2027-03-01" }, TODAY)).toBe(true)
    const noNum = normalizeForecast({ ...base, giaTriDuKien: undefined }, TODAY)
    expect("error" in noNum ? null : noNum.expected).toBeUndefined()
  })
  it("tối đa 10 dự đoán đang chờ; chặn trùng nội dung", () => {
    let list: Forecast[] = []
    for (let i = 0; i < MAX_OPEN_FORECASTS; i++) {
      const n = normalizeForecast({ ...base, noiDung: `${base.noiDung} số ${i}` }, TODAY)
      const r = addForecast(list, n, `d${i}`, "2026-10-20T01:00:00Z")
      expect("error" in r).toBe(false)
      if (!("error" in r)) list = r.list
    }
    expect("error" in addForecast(list, normalizeForecast({ ...base, noiDung: `${base.noiDung} số 11` }, TODAY), "dX", "t")).toBe(true)
    const small = addForecast([], normalizeForecast(base, TODAY), "a", "t")
    if (!("error" in small)) expect("error" in addForecast(small.list, normalizeForecast({ ...base, noiDung: base.noiDung.toUpperCase() }, TODAY), "b", "t")).toBe(true)
  })
})

describe("sổ dự đoán: chấm", () => {
  const open = (over: Partial<Forecast> = {}): Forecast => ({ id: "d1", text: "x".repeat(20), expected: 76, unit: "%", checkDate: "2026-11-03", method: METHOD, madeAt: "2026-10-20T00:00:00Z", status: "open", ...over })
  it("có số: sai số ≤5% đúng, ≤15% gần đúng, hơn là sai", () => {
    const at = (actual: number) => { const r = scoreForecast([open()], "d1", { actual }, "now"); return "error" in r ? null : r.forecast }
    expect(at(77)).toMatchObject({ verdict: "dung", errorPct: 1.32 })
    expect(at(70)).toMatchObject({ verdict: "gan_dung" })
    expect(at(60)).toMatchObject({ verdict: "sai" })
    expect(at(76)).toMatchObject({ verdict: "dung", errorPct: 0 })
  })
  it("không số: cần ketLuan hợp lệ; có số mà thiếu giá trị thực tế thì từ chối; không chấm lại; id lạ báo lỗi", () => {
    const noNum = [open({ expected: undefined })]
    expect("error" in scoreForecast(noNum, "d1", {}, "now")).toBe(true)
    expect("error" in scoreForecast(noNum, "d1", { ketLuan: "tuyet_voi" }, "now")).toBe(true)
    const ok = scoreForecast(noNum, "d1", { ketLuan: "sai", note: "bài học" }, "now")
    expect("error" in ok ? null : ok.forecast).toMatchObject({ status: "scored", verdict: "sai", note: "bài học" })
    expect("error" in scoreForecast([open()], "d1", {}, "now")).toBe(true)
    if (!("error" in ok)) expect("error" in scoreForecast(ok.list, "d1", { ketLuan: "dung" }, "now")).toBe(true)
    expect("error" in scoreForecast([open()], "khong-co", { actual: 1 }, "now")).toBe(true)
  })
  it("kỳ vọng bằng 0 không chia cho 0", () => {
    const r = scoreForecast([open({ expected: 0 })], "d1", { actual: 0 }, "now")
    expect("error" in r ? null : r.forecast.verdict).toBe("dung")
  })
  it("tóm tắt: gần đúng tính nửa điểm; sai số trung bình chỉ tính dự đoán có số", () => {
    const list: Forecast[] = [
      open({ id: "1", status: "scored", verdict: "dung", errorPct: 2 }), open({ id: "2", status: "scored", verdict: "gan_dung", errorPct: 10 }),
      open({ id: "3", status: "scored", verdict: "sai" }), open({ id: "4" }),
    ]
    expect(summarize(list)).toEqual({ scored: 3, open: 1, right: 1, near: 1, wrong: 1, accuracyPct: 50, avgErrorPct: 6 })
    expect(summarize([]).accuracyPct).toBeNull()
  })
})

describe("đến hạn → tuần tra", () => {
  const f = (id: string, checkDate: string, status: "open" | "scored" = "open"): Forecast => ({ id, text: `dự đoán ${id} đủ dài`, checkDate, method: METHOD, madeAt: "2026-10-01T00:00:00Z", status })
  it("chỉ lấy dự đoán chưa chấm và hạn ≤ hôm nay", () => {
    const due = dueForecasts([f("a", "2026-10-19"), f("b", "2026-10-20"), f("c", "2026-10-21"), f("d", "2026-10-01", "scored")], TODAY)
    expect(due.map(x => x.id)).toEqual(["a", "b"])
  })
  it("khối chấm nêu id, cách đo và lệnh chamDuDoan; rỗng thì không thêm gì", () => {
    expect(dueBlock([])).toBe("")
    const b = dueBlock([{ ...f("a", "2026-10-19"), expected: 76, unit: "%" }])
    expect(b).toContain("id=a"); expect(b).toContain("dự kiến 76 %"); expect(b).toContain("chamDuDoan"); expect(b).toContain(METHOD)
  })
})

describe("công cụ ghiDuDoan / chamDuDoan", () => {
  const mk = () => { const s = { list: [] as Forecast[] }; return { s, deps: { load: async () => s.list, save: async (_: string, l: Forecast[]) => { s.list = l }, newId: () => "dtest", today: () => TODAY } } }
  it("ghi chỉ ở pha chạy; chấm xong báo độ đúng tích luỹ", async () => {
    const m = mk()
    expect((await execRecord(base, { missionId: "m", phase: "plan" }, m.deps)).ok).toBe(false)
    expect(m.s.list).toHaveLength(0)
    expect((await execRecord(base, { missionId: "m", phase: "run" }, m.deps)).ok).toBe(true)
    expect(m.s.list).toMatchObject([{ id: "dtest", status: "open", expected: 76 }])
    const sc = await execScore({ id: "dtest", giaTriThucTe: 75, nhanXet: "gần đúng mục tiêu" }, { missionId: "m", phase: "run" }, m.deps)
    expect(sc.ok).toBe(true)
    expect(sc.result).toContain("ĐÚNG")
    expect(sc.result).toContain("1/1 đúng")
    expect((await execScore({ id: "dtest", giaTriThucTe: 1 }, { missionId: "m", phase: "run" }, m.deps)).ok).toBe(false)
  })
})
