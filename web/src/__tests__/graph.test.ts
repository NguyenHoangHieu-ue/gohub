import { describe, test, expect } from "vitest"
import { extractParams, normalizeText, toFlags } from "@/lib/agents/router"
import { scoreAndSelect, isFailureText, guidanceFor } from "@/lib/agents/graph"

// ─────────────────────────────────────────────────────────────────────────────
// Unit test XÁC ĐỊNH cho capability graph — KHÔNG gọi Gemini, chạy nhanh.
// Chứng minh: cùng 1 câu → luôn cùng agent (hết "lúc được lúc không").
// Chọn agent qua graph chỉ từ tín hiệu deterministic (không có phiếu LLM).
// ─────────────────────────────────────────────────────────────────────────────

function pick(msg: string) {
  const params = extractParams(msg)
  const flags  = toFlags(params)
  return scoreAndSelect(normalizeText(msg), flags)   // KHÔNG truyền llm → thuần deterministic
}

const ROUTING: [string, string][] = [
  // bi-analyst
  ["Top 5 kênh bán doanh thu cao nhất tháng này", "bi-analyst"],
  ["Doanh thu tháng này bao nhiêu?", "bi-analyst"],
  ["units sold của tháng 4,5 và 6", "bi-analyst"],
  ["%margin vn-ecom tháng 7 là bao nhiêu", "bi-analyst"],
  ["khách hàng nào mua nhiều nhất?", "bi-analyst"],
  ["top sản phẩm bán chạy trên vn-ecom", "bi-analyst"],
  ["Báo cáo sản phẩm 3HK theo kho trong quý 2", "bi-analyst"],
  ["3HK Contribution Revenue % tháng 6 là bao nhiêu?", "bi-analyst"],
  ["cho tôi biết số bán của con 1CKORCUF01005 từ đầu tháng đến nay", "bi-analyst"],
  ["sản phẩm 1CKORCUF01005 bán trên kênh nào", "bi-analyst"],
  ["cho tôi biết lượng sử dụng của các gói 3HK trong tháng 6 đi", "bi-analyst"],
  // tra-cuu
  ["1EWORCBF01030 là mã gì vậy", "tra-cuu"],
  ["giá vốn của 1DTHATMF05010 và 1DTHATMF01507 là bao nhiêu", "tra-cuu"],
  ["3EANZ3DF02015 cho tôi thông tin về mã này", "tra-cuu"],
  // tu-van
  ["cho tui danh sách các mã sim đi được Chile đi", "tu-van"],
  ["Cho tao sim vật lý đi Monaco", "tu-van"],
  ["có sản phẩm nào giúp được ở cả Malaysia và Singapore không", "tu-van"],
  // gap-analysis
  ["WorldMove còn cung cấp gói Mongolia, 5 Days , 8GB không?", "gap-analysis"],
  ["gói Mongolia của Worldmove có số điện thoại, gọi đc k", "gap-analysis"],
  ["WorldMove có bao nhiêu gói chưa được GoHub tạo SKU?", "gap-analysis"],
  // data-explorer
  ["Liệt kê các trang wiki nội bộ", "data-explorer"],
  ["Đếm số item theo kênh bán", "data-explorer"],
]

describe("capability graph — routing xác định (không LLM)", () => {
  test("mỗi câu ra đúng agent", () => {
    const fails: string[] = []
    for (const [q, want] of ROUTING) {
      const got = pick(q).primary.agent
      if (got !== want) fails.push(`[${got}] muốn [${want}] — ${q}`)
    }
    if (fails.length) console.log("❌\n" + fails.join("\n"))
    expect(fails).toEqual([])
  })

  test("determinism: cùng câu chạy 20 lần ra cùng agent", () => {
    for (const [q] of ROUTING) {
      const set = new Set(Array.from({ length: 20 }, () => pick(q).primary.agent))
      expect(set.size, `"${q}" ra nhiều agent khác nhau`).toBe(1)
    }
  })
})

describe("capability graph — đa-agent (tune ngưỡng bằng câu thực tế)", () => {
  const agentsOf = (m: string) => {
    const r = pick(m)
    return { primary: r.primary.agent as string, all: new Set<string>([r.primary.agent, ...r.extraAgents]), multi: r.extraAgents.length > 0 }
  }

  // ── PHẢI multi (câu chạm ≥2 domain khác nhau, có liên từ) ──
  const MULTI: [string, string[]][] = [
    ["đi Nhật có gói eSIM nào và doanh thu tháng này bao nhiêu?",        ["tu-van", "bi-analyst"]],
    ["gói cho Hàn Quốc là gì và bán được bao nhiêu?",                    ["tu-van", "bi-analyst"]],
    ["KYC là gì và doanh thu tháng này ra sao?",                         ["giai-dap", "bi-analyst"]],
    ["WorldMove có gói nào cho Nhật và doanh thu vendor 3HK tháng này?", ["gap-analysis", "bi-analyst"]],
    ["cho tôi gói đi Thái và đếm xem có bao nhiêu SKU Thái trong hệ thống", ["tu-van", "data-explorer"]],
  ]

  // ── KHÔNG multi (single-agent) — gồm các bẫy false-positive ──
  const SINGLE: [string, string][] = [
    ["đi Nhật có gói eSIM nào?",                              "tu-van"],
    ["doanh thu tháng này bao nhiêu?",                        "bi-analyst"],
    ["1CKORCUF01005 là mã gì?",                               "tra-cuu"],
    ["KYC là gì?",                                            "giai-dap"],
    ["WorldMove có gói nào cho Thái Lan?",                    "gap-analysis"],
    ["giá vốn và giá bán của mã 1CJPNWM101001",              "tra-cuu"],  // cùng domain → 1 agent
    ["doanh thu và lợi nhuận tháng này",                      "bi-analyst"], // "lợi nhuận" KHÔNG kéo tra-cuu
    ["con 1CKORCUF01005 bán được bao nhiêu và trên kênh nào", "bi-analyst"], // mã = filter
    ["doanh thu Nhật và Hàn tháng này",                       "bi-analyst"], // nước = filter
    ["so sánh gói Nhật và Hàn",                               "tu-van"],     // cùng domain
    ["top 5 kênh bán doanh thu cao nhất tháng này",           "bi-analyst"],
  ]

  test("MULTI: chạy đúng bộ agent kỳ vọng", () => {
    const fails: string[] = []
    for (const [q, want] of MULTI) {
      const { all, multi } = agentsOf(q)
      const ok = multi && want.every(a => all.has(a))
      if (!ok) fails.push(`${q} → got {${[...all].join(",")}} muốn ⊇ {${want.join(",")}}`)
    }
    if (fails.length) console.log("❌ MULTI\n" + fails.join("\n"))
    expect(fails).toEqual([])
  })

  test("SINGLE: KHÔNG multi + đúng primary agent", () => {
    const fails: string[] = []
    for (const [q, want] of SINGLE) {
      const { primary, multi } = agentsOf(q)
      if (multi || primary !== want) fails.push(`${q} → primary=${primary} multi=${multi} (muốn ${want}, single)`)
    }
    if (fails.length) console.log("❌ SINGLE\n" + fails.join("\n"))
    expect(fails).toEqual([])
  })

  test("mỗi domain chỉ 1 agent (không chạy trùng catalog)", () => {
    // "WM có gói Nhật ... doanh thu 3HK" — dù có cả gap + product_search (đều catalog) → chỉ 1 catalog agent
    const r = pick("WorldMove có gói nào cho Nhật và doanh thu vendor 3HK tháng này?")
    const all = [r.primary.agent, ...r.extraAgents]
    const catalog = all.filter(a => ["tu-van", "tra-cuu", "gap-analysis", "tao-template"].includes(a))
    expect(catalog.length).toBeLessThanOrEqual(1)
  })
})

describe("ensureAnswer — luôn có câu trả lời", () => {
  test("nhận diện câu rỗng / thất bại", () => {
    expect(isFailureText("")).toBe(true)
    expect(isFailureText("   ")).toBe(true)
    expect(isFailureText("Không tìm thấy dữ liệu phù hợp")).toBe(true)
    expect(isFailureText("Hiếu đang fix, vui lòng đợi 🔧")).toBe(true)
    expect(isFailureText("Doanh thu tháng 6 là 1,2 tỷ đồng, tăng 10% so với tháng trước.")).toBe(false)
  })

  test("guidanceFor trả gợi ý kèm ví dụ của agent", () => {
    const g = guidanceFor("tu-van")
    expect(g).toContain("•")
    expect(g.toLowerCase()).toContain("hỏi lại")
  })
})
