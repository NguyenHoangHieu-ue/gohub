import { describe, it, expect } from "vitest"
import { reviewKpis, marketAlerts, reviewText, type DailyReview } from "@/lib/okr-review"
import { buildProposals, analysisQuarterFor } from "@/lib/okr-proposals"
import type { MarketData, MarketSku } from "@/lib/market-breakdown"
import type { QuoteCompareData } from "@/lib/quote-sources"

const T = { sla_hours: 1, sla_pct: 90, vendor_speed: 5, gm_delta: 5, hk3_pct: 80, begau: 650 }
const sku = (s: string, country: string, vendor: string): MarketSku =>
  ({ sku: s, vendor, country, country_code: "", product_code: "", form: "", plan: "", service: "", size: "" })

describe("reviewKpis", () => {
  it("chấm trạng thái và điểm giống trang (trọng số WEIGHTS)", () => {
    const { kpis, score } = reviewKpis({ sla: 0.8, vendor: 7, skuDelta: 4, datapool: 70, begau: 100 }, T, 0.5)
    const by = Object.fromEntries(kpis.map(k => [k.key, k]))
    expect(by.sla.status).toBe("ok")
    expect(by.vendor_speed.status).toBe("behind")      // 7 > 5×1.2
    expect(by.sku_gm.status).toBe("watch")             // 4 ≥ 5×0.75
    expect(by.begau.status).toBe("behind")             // lẽ ra ~325
    expect(by.begau.text).toContain("cần ~")
    // ach: sla 100, vendor 60, sku 80, hk3 87.5, begau 15.38 → (100+60+80+87.5)*17.5 + 15.38*30 = 6193.9 / 100
    expect(score).toBeCloseTo(61.9, 1)
  })
  it("thiếu dữ liệu SLA → no_data, không tính điểm", () => {
    const { kpis } = reviewKpis({ sla: null, vendor: null, skuDelta: null, datapool: 0, begau: 0 }, T, 0.1)
    expect(kpis[0].status).toBe("no_data")
  })
})

// months: 0=Q3-07, 1=08, 2=09, 3=10, 4=11
const md = (cells: MarketData["cells"], skus: MarketSku[], cutoff = "2026-11-15"): MarketData => ({
  quarter: "Q4-2026", prevQuarter: "Q3-2026", curStart: "2026-10-01", curEnd: "2026-12-31", prevStart: "2026-07-01", prevEnd: "2026-09-30",
  months: ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], curMonths: ["2026-10", "2026-11", "2026-12"],
  group: "ALL", cutoff, skus, cells,
})

describe("marketAlerts", () => {
  it("thị trường tụt doanh thu/ngày ≥20% và SKU tụt biên lãi ≥5 điểm", () => {
    const d = md([
      [0, 3, 3100e6, 1000e6, 1], [0, 4, 1000e6, 200e6, 1],   // Nhật: T10 100tr/ngày → T11 15 ngày 66tr/ngày (−33%); GM 32%→20%
      [1, 3, 310e6, 100e6, 1], [1, 4, 150e6, 48e6, 1],        // Thái: ổn định
    ], [sku("J1", "Nhật Bản", "KDDI"), sku("T1", "Thái Lan", "Truemove")])
    const a = marketAlerts(d, "2026-11-15")
    expect(a.some(x => x.startsWith("Nhật Bản") && x.includes("giảm 33%"))).toBe(true)
    expect(a.some(x => x.startsWith("Thái Lan"))).toBe(false)
    expect(a.some(x => x.includes("SKU J1"))).toBe(true)
  })
  it("đầu tháng (<7 ngày) không cảnh báo", () => {
    expect(marketAlerts(md([[0, 3, 1e9, 1e8, 1]], [sku("J1", "Nhật Bản", "KDDI")]), "2026-11-03")).toEqual([])
  })
})

describe("buildProposals", () => {
  const analysis: MarketData = {
    ...md([
      [0, 0, 900e6, 270e6, 1], [0, 1, 900e6, 270e6, 1], [0, 2, 900e6, 180e6, 1],   // Nhật Q3 (GM 26%), cur
      [1, 0, 300e6, 150e6, 1], [1, 1, 300e6, 150e6, 1], [1, 2, 300e6, 150e6, 1],   // Thái 50%
    ], [sku("J1", "Nhật Bản", "3HK DATAPOOL"), sku("T1", "Thái Lan", "Truemove")]),
    quarter: "Q3-2026", prevQuarter: "Q2-2026", curStart: "2026-07-01", curEnd: "2026-09-30",
    months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"], curMonths: ["2026-07", "2026-08", "2026-09"],
  }
  // dời tháng: cells ở trên dùng mi 0–2 = Q2 → chuyển sang 3–5 (Q3) và thêm Q2 có GM cao hơn để có "giảm"
  analysis.cells = [
    [0, 3, 900e6, 270e6, 1], [0, 4, 900e6, 270e6, 1], [0, 5, 900e6, 180e6, 1],
    [0, 0, 900e6, 300e6, 1],
    [1, 3, 300e6, 150e6, 1], [1, 4, 300e6, 150e6, 1], [1, 5, 300e6, 150e6, 1],
  ]
  const offer = (source: string, label: string, usd: number) => ({ source, label, usd, detail: "", kyc: false })
  const row = (s: string, market: string, vendor: string, rev: number, base: number, best: ReturnType<typeof offer>) => ({
    sku: s, market, vendor, form: "eSIM" as const, plan: "Fixed" as const, size: "", units: 1, rev, currentUsd: base,
    offers: [best], best, ownUsd: null, baseUsd: base, savePerUnitUsd: base - best.usd, savePct: (base - best.usd) / base * 100, saveQuarterVnd: null,
  })
  const compare = {
    quarter: "Q3-2026", group: "ALL", fxMonth: "2026-09", vndPerUsd: 26000, assumptions: { fixedPct: 0.55, dailyPct: 0.38 },
    sources: [{ id: "q1", label: "VNPT (đang chào)", note: "", quoteId: "abc", status: "reviewing" }],
    rows: [row("J1", "Nhật Bản", "3HK DATAPOOL", 500e6, 2, offer("BC_CMHK", "BC Datapool CMHK", 1.5)),
           row("J2", "Nhật Bản", "3HK DATAPOOL", 300e6, 2, offer("BC_CMHK", "BC Datapool CMHK", 1.6)),
           { ...row("T1", "Thái Lan", "Truemove", 100e6, 1, offer("q1", "VNPT (đang chào)", 0.8)) }],
    skipped: [], unresolvedNames: [],
    gaps: [{ iso: "MN", name: "Mông Cổ", regional: [], sources: ["WorldMove"], ref: [{ spec: "Gói 3GB dùng 7 ngày", best: offer("WM", "WorldMove", 4) }] }],
  } as unknown as QuoteCompareData

  const ps = buildProposals({ analysis, compare, current: null })
  const keys = ps.map(p => p.key)
  it("đủ các nhóm: đổi nguồn, báo giá chờ, GM giảm, phụ thuộc vendor, nước chưa bán", () => {
    expect(keys).toContain("switch|Nhật Bản|3HK DATAPOOL|BC_CMHK")
    expect(keys).toContain("quote|abc")
    expect(keys).toContain("gmdrop|Nhật Bản")
    expect(keys).toContain("depend|3HK DATAPOOL")       // 3HK = 75% doanh thu
    expect(keys).toContain("gap|MN")
  })
  it("đề xuất GM giảm có chỉ số theo dõi; xếp theo doanh thu liên quan, nước chưa bán xếp cuối", () => {
    const g = ps.find(p => p.key === "gmdrop|Nhật Bản")!
    expect(g.track?.kind).toBe("market_gm")
    expect(ps[ps.length - 1].key).toBe("gap|MN")
    expect(ps.find(p => p.key.startsWith("switch"))!.title).toContain("chuyển 2 gói")
  })
})

it("analysisQuarterFor: quý đang chạy/quý tới → quý trước quý hiện tại; quý đã qua → chính nó", () => {
  const prev = (q: string) => q === "Q4-2026" ? "Q3-2026" : "Q2-2026"
  expect(analysisQuarterFor("Q4-2026", "Q4-2026", prev)).toBe("Q3-2026")
  expect(analysisQuarterFor("Q1-2027", "Q4-2026", prev)).toBe("Q3-2026")
  expect(analysisQuarterFor("Q3-2026", "Q4-2026", prev)).toBe("Q3-2026")
})

it("reviewText có tiêu đề, KPI, link", () => {
  const r: DailyReview = {
    quarter: "Q4-2026", today: "2026-11-15", elapsed: 0.5, dayOfQuarter: 46, quarterDays: 92, score: 61.9,
    kpis: reviewKpis({ sla: 0.8, vendor: 7, skuDelta: 4, datapool: 70, begau: 100 }, T, 0.5).kpis,
    plan: { total: 2, done: 1, issues: [{ title: "Chuyển Nhật sang BC", status: "behind", message: "Chậm" }] },
    alerts: ["Nhật Bản: giảm"], lark: { open: 3, yesNoTyping: 1, monthEnd: false, lines: [] }, pendingQuotes: 2, targetNote: null,
  }
  const t = reviewText(r, "https://x")
  expect(t).toContain("15/11")
  expect(t).toContain("Chậm: Chuyển Nhật sang BC")
  expect(t).toContain("3 thread")
  expect(t.endsWith("https://x")).toBe(true)
})
