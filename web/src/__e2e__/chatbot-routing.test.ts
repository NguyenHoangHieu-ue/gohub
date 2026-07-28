import "./replay-setup"
import { describe, test, expect } from "vitest"
import { route } from "@/lib/agents/router"

// E2E routing test — chạy route() THẬT (Gemini classifier) trên câu hỏi THẬT của user (lấy từ Supabase chat_messages).
// Mục tiêu: verify từng agent nhận đúng nhiệm vụ. Chạy: npx vitest run src/__e2e__/chatbot-routing.test.ts
//
// Format case: [câu hỏi, agent kỳ vọng (1 hoặc nhiều chấp nhận được)]
const CASES: [string, string | string[]][] = [
  // ── bi-analyst (doanh thu / đơn / kênh / usage) ──
  ["Top 5 kênh bán doanh thu cao nhất tháng này", "bi-analyst"],
  ["units sold của tháng 4,5 và 6", "bi-analyst"],
  ["Doanh thu tháng này bao nhiêu?", "bi-analyst"],
  ["doanh thu shopeepay indonesia", "bi-analyst"],
  ["doanh thu BIDV", "bi-analyst"],
  ["doanh thu momo tháng 7 và prorata", "bi-analyst"],
  ["cho tôi biết trong tháng 6 bán được bao nhiêu SIM/eSIM 3HK nhỉ", "bi-analyst"],
  ["So sánh doanh thu, gross profit và CM1 qua các tháng 4, 5 và 6", "bi-analyst"],
  ["%margin vn-ecom tháng 7 là bao nhiêu", "bi-analyst"],
  ["Tổng doanh thu (Revenue) và COGS của tháng 6 năm 2026 là bao nhiêu?", "bi-analyst"],
  ["so sánh wow doanh thu b2b & b2c", "bi-analyst"],
  ["doanh thu từ vendor 3hk datapool trong 12 tháng vừa qua, breakdown mỗi tháng", "bi-analyst"],
  ["Hello, cho t xem doanh số của AST travel", "bi-analyst"],
  ["top sản phẩm bán chạy trên vn-ecom", "bi-analyst"],
  // ── Bug A: mã SKU + câu hỏi doanh số → bi-analyst (KHÔNG phải tra-cuu) ──
  ["cho tôi biết số bán của con 1CKORCUF01005 từ đầu tháng đến nay", "bi-analyst"],
  ["check xem con 1CKORCUF01005 có bán được từ ngày 1/7 đến nay không", "bi-analyst"],
  // ── Bug C: số bán + "bán trên kênh nào" của 1 sản phẩm → bi-analyst (phân rã kênh) ──
  ["số bán của con 1CKORCUF01005 và nó được bán trên những kênh nào", "bi-analyst"],
  ["sản phẩm 1CKORCUF01005 bán trên kênh nào", "bi-analyst"],
  ["con 1CKORCUF01005 bán được bao nhiêu và trên kênh nào", "bi-analyst"],
  // ── Bug B: usage 3HK → bi-analyst (fact_data_usage), KHÔNG phải gap-analysis ──
  ["cho tôi biết lượng sử dụng của các gói 3HK trong tháng 6 đi", ["bi-analyst", "data-explorer"]],
  ["thử query trong bảng data_usage_log và thống kê dùm trong tổng data đang có", ["data-explorer", "bi-analyst"]],
  // ── tra-cuu (lookup mã / giá vốn) ──
  ["1EWORCBF01030 là mã gì vậy", "tra-cuu"],
  ["giá vốn của 1DTHATMF05010 và 1DTHATMF01507 là bao nhiêu", "tra-cuu"],
  ["3EANZ3DF02015 cho tôi thông tin về mã này", "tra-cuu"],
  // ── tu-van (tìm sản phẩm GoHub theo nước) ──
  ["cho tui danh sách các mã sim đi được Chile đi", "tu-van"],
  ["Cho tao sim vật lý đi Monaco", "tu-van"],
  ["có sản phẩm nào giúp được ở cả Malaysia và Singapore không", "tu-van"],
  // ── gap-analysis (NCC catalog / WM) ──
  ["WorldMove còn cung cấp gói Mongolia, 5 Days , 8GB không?", "gap-analysis"],
  ["gói Mongolia của Worldmove có số điện thoại, gọi đc k", "gap-analysis"],
  // ── Regression từ audit agent (session tối ưu 7 agent) ──
  ["Báo cáo sản phẩm 3HK theo kho trong quý 2", "bi-analyst"],           // "theo kho" = BI dù nhắc 3HK
  ["khách hàng nào mua nhiều nhất?", "bi-analyst"],                       // "mua nhiều nhất" = BI ranking
  ["3HK Contribution Revenue % tháng 6 là bao nhiêu?", "bi-analyst"],     // "contribution" = BI
  ["Liệt kê các trang wiki nội bộ", "data-explorer"],                    // liệt kê wiki = tra dữ liệu
  ["Đếm số item theo kênh bán", "data-explorer"],                        // đếm theo nhóm = data-explorer
  ["WorldMove có bao nhiêu gói chưa được GoHub tạo SKU?", ["gap-analysis", "data-explorer"]], // gap KHÔNG bị BI cướp
  ["có sản phẩm nào dùng được ở cả Malaysia và Singapore không", "tu-van"], // multi-country → tu-van
  ["tổng hợp báo cáo sản phẩm 3HK trong kho Hà Nội của quý 2", "bi-analyst"], // "trong kho X" = BI (không phải gap)

  // ── New cases từ master plan (session 127) ──
  // BI — YoY / weekly / vendor mix / location / usage eSIM
  ["doanh thu tháng 7 so với tháng 7 năm ngoái", "bi-analyst"],           // YoY
  ["xu hướng doanh thu theo tuần trong 4 tuần gần nhất", "bi-analyst"],   // weekly trend
  ["thị phần doanh thu theo vendor Q2 2026", "bi-analyst"],               // vendor mix %
  ["top 10 khách hàng B2B theo tổng doanh thu từ đầu năm", "bi-analyst"], // customer LTV
  ["khách hàng mua lần đầu trong tháng 7 là ai?", "bi-analyst"],          // new customers
  ["doanh thu theo kho và chi nhánh tháng 7", "bi-analyst"],               // location breakdown
  ["thống kê usage eSIM theo nhóm Unused/Low/Medium/High tháng 7", "bi-analyst"], // usage_class
  ["3HK data usage theo nước nào dùng nhiều nhất tháng 6", "bi-analyst"], // data_usage_log
  ["hoa hồng tháng này của từng kênh là bao nhiêu?", "bi-analyst"],       // commission → BI
  // BI — error recovery / edge cases
  ["doanh thu hôm nay bao nhiêu?", "bi-analyst"],                         // today cutoff → BI (giải thích)
  ["tổng kết kinh doanh tháng 7 2026", "bi-analyst"],                     // full report → BI
  ["so sánh doanh thu week over week", "bi-analyst"],                      // WoW → BI
  // tu-van edge cases
  ["SIM nào đi Nhật có nghe gọi?", "tu-van"],                             // feature filter → tu-van
  ["gói unlimited đi Hàn Quốc 7 ngày", "tu-van"],                         // unlimited → tu-van
  ["có gói nào đi cả châu Âu không?", "tu-van"],                          // regional → tu-van
  // tra-cuu
  ["1CJPNWM10014 cho tôi thông tin chi tiết", "tra-cuu"],                 // SKU lookup
  ["giá vốn của 1CTHANWM10001 bao nhiêu?", "tra-cuu"],                    // COGS lookup
  // giai-dap
  ["CM1 khác Gross Profit như thế nào?", "giai-dap"],                     // glossary → giai-dap
  ["data policy code A là gì?", "giai-dap"],                               // decode → giai-dap
  ["đối tác chiến lược của GoHub gồm những ai?", ["giai-dap", "bi-analyst"]], // partner tiers
  // data-explorer
  ["Có bao nhiêu SKU active trong hệ thống?", "data-explorer"],           // count catalog
  ["chi phí kênh nào đang được cấu hình cho tháng 7?", ["data-explorer", "bi-analyst"]],
  // gap-analysis
  ["WorldMove có gói gì cho Nhật mà GoHub chưa tạo?", "gap-analysis"],   // gap WM
  ["3HK zone A có những loại gói nào?", "gap-analysis"],                   // 3HK browse
]

describe("Chatbot routing — câu hỏi thật của user", () => {
  test("route() phân đúng agent", async () => {
    const results: { q: string; got: string; want: string; ok: boolean }[] = []
    for (const [q, want] of CASES) {
      let got = "ERROR"
      try { got = (await route(q, [], "admin")).agentId } catch (e) { got = `ERR:${(e as Error).message.slice(0, 40)}` }
      const wants = Array.isArray(want) ? want : [want]
      results.push({ q, got, want: wants.join("|"), ok: wants.includes(got) })
    }
    const pass = results.filter(r => r.ok).length
    console.log(`\n══ ROUTING: ${pass}/${results.length} PASS ══`)
    for (const r of results) {
      console.log(`  ${r.ok ? "✅" : "❌"} [${r.got}] muốn [${r.want}] — ${r.q.slice(0, 70)}`)
    }
    // Cho phép 1-2 case lệch nhẹ (Gemini không định); fail nếu < 80%.
    expect(pass / results.length).toBeGreaterThanOrEqual(0.8)
  }, 180_000)
})
