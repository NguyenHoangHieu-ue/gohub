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

describe("capability graph — đa-agent", () => {
  test("sản phẩm + doanh thu (khác domain, có liên từ) → multi", () => {
    const r = pick("đi Nhật có gói eSIM nào và doanh thu tháng này bao nhiêu")
    expect(r.extraAgents.length).toBeGreaterThanOrEqual(1)
    const agents = [r.primary.agent, ...r.extraAgents]
    expect(agents).toContain("bi-analyst")
    expect(agents).toContain("tu-van")
  })

  test("nước chỉ là FILTER cho BI (không đòi sản phẩm) → KHÔNG multi", () => {
    const r = pick("doanh thu Nhật và Hàn tháng này")
    expect(r.primary.agent).toBe("bi-analyst")
    expect(r.extraAgents).toEqual([])
  })

  test("mã SKU + câu BI = filter, KHÔNG tách tra-cuu", () => {
    const r = pick("con 1CKORCUF01005 bán được bao nhiêu và trên kênh nào")
    expect(r.primary.agent).toBe("bi-analyst")
    expect(r.extraAgents).not.toContain("tra-cuu")
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
