// Bank câu hỏi để CHẤM chất lượng câu trả lời từng agent (LLM-judge).
// Mỗi case: câu hỏi thật/edge-case + routing kỳ vọng + rubric (must / mustNot).
// Mở rộng dần theo từng agent khi audit-fix.

export interface BankCase {
  q:            string
  expectAgent?: string | string[]   // agent kỳ vọng (routing). Bỏ qua nếu không chắc.
  must?:        string[]            // câu trả lời PHẢI thoả (điểm rubric)
  mustNot?:     string[]            // câu trả lời KHÔNG được vi phạm
  role?:        string             // role giả lập (mặc định admin)
  note?:        string
}

// ─── ① bi-analyst — report / số liệu kinh doanh (gohub_dw) ───────────────────
const BI: BankCase[] = [
  { q: "Tổng doanh thu và COGS tháng 6/2026 là bao nhiêu?", expectAgent: "bi-analyst",
    must: ["có số doanh thu cụ thể (VND)", "có số COGS cụ thể", "nêu rõ kỳ tháng 6/2026"],
    mustNot: ["trả lời 'không biết' hoặc 'không có quyền'", "bịa cột không tồn tại"] },
  { q: "So sánh doanh thu, gross profit và CM1 qua tháng 4, 5, 6", expectAgent: "bi-analyst",
    must: ["có số doanh thu và gross profit cho từng tháng 4/5/6",
           "về CM1: nêu rõ CM1 = GP trừ Operation Cost và Operation Cost KHÔNG có trong gohub_dw (hoặc chỉ dẫn xem tab B2B/B2C)"],
    mustNot: ["đánh đồng CM1 = gross profit (coi 2 chỉ số là một)"] },
  { q: "Top 5 kênh bán doanh thu cao nhất tháng này", expectAgent: "bi-analyst",
    must: ["liệt kê tối đa 5 kênh kèm số doanh thu", "dùng bảng markdown"] },
  { q: "Nhân viên nào bán nhiều nhất tháng 6?", expectAgent: "bi-analyst",
    must: ["nêu nhân viên (tên hoặc mã) + số"], mustNot: ["lộ số điện thoại/email nhân viên"] },
  { q: "Trong tháng 6 bán được bao nhiêu SIM/eSIM 3HK?", expectAgent: "bi-analyst",
    must: ["có số lượng/doanh thu 3HK tháng 6", "bắt cả '3HK DATAPOOL' lẫn '3HK'"],
    mustNot: ["chỉ match '3HKDATAPOOL' rồi ra 0"] },
  { q: "Báo cáo sản phẩm 3HK theo kho trong quý 2", expectAgent: "bi-analyst",
    must: ["có số liệu 3HK quý 2 (01/04-30/06)", "nếu ra 'Unknown' thì giải thích 3HK là eSIM không gắn kho"],
    mustNot: ["nói 'không có dữ liệu' mà không query"] },
  { q: "doanh thu từ vendor 3hk datapool 12 tháng qua, breakdown mỗi tháng", expectAgent: "bi-analyst",
    must: ["breakdown theo từng tháng", "dùng bảng"] },
  { q: "so sánh WoW doanh thu B2B và B2C", expectAgent: "bi-analyst",
    must: ["có số B2B và B2C", "so sánh 2 tuần (week over week)"] },
  { q: "%margin vn-ecom tháng 7 là bao nhiêu", expectAgent: "bi-analyst",
    must: ["có % margin", "nêu kỳ tháng 7"] },
  { q: "top sản phẩm bán chạy trên vn-ecom", expectAgent: "bi-analyst",
    must: ["liệt kê SKU/sản phẩm top kèm số", "lọc kênh vn-ecom"] },
  { q: "khách hàng nào mua nhiều nhất?", expectAgent: "bi-analyst",
    must: ["trả về mã khách hàng (customer_code)"], mustNot: ["lộ tên thật/SĐT/email khách hàng"] },
  { q: "cho tôi biết số bán của con 1CKORCUF01005 từ đầu tháng đến nay", expectAgent: "bi-analyst",
    must: ["có số bán của SKU đó theo kỳ"], mustNot: ["chỉ mô tả thuộc tính SKU mà không có số bán"] },
  { q: "3HK Contribution Revenue % tháng 6 là bao nhiêu?", expectAgent: "bi-analyst",
    must: ["có % = doanh thu 3HK / tổng doanh thu"], mustNot: ["ra 0% do chỉ match '3HKDATAPOOL'"] },
]

// ─── ② data-explorer — thống kê / tra dữ liệu thô (Supabase + gohub_dw) ──────
const DX: BankCase[] = [
  { q: "Có bao nhiêu SKU đang active trong hệ thống?", expectAgent: "data-explorer",
    must: ["có con số SKU active cụ thể"], mustNot: ["trả 'không biết'"] },
  { q: "Đếm số sản phẩm theo vendor", expectAgent: "data-explorer",
    must: ["liệt kê vendor kèm số lượng", "dùng bảng"] },
  { q: "Liệt kê các trang wiki nội bộ", expectAgent: "data-explorer",
    must: ["liệt kê title các trang wiki (kb_wiki_pages)"], mustNot: ["trả về cột embedding/vector"] },
  { q: "Hệ thống có bao nhiêu nước (ref_countries)?", expectAgent: "data-explorer",
    must: ["có con số nước cụ thể (~212)"] },
  { q: "Có bao nhiêu listing đang bán?", expectAgent: "data-explorer",
    must: ["có số listing cụ thể"] },
  { q: "WorldMove có bao nhiêu gói chưa được GoHub tạo SKU?", expectAgent: ["data-explorer", "gap-analysis"],
    must: ["có số gói exist=No (chưa tạo)"] },
  { q: "Thống kê usage data theo nước từ data_usage_log", expectAgent: ["data-explorer", "bi-analyst"],
    must: ["liệt kê nước kèm tổng data_gb", "dùng bảng"] },
  { q: "Có bao nhiêu vendor trong danh mục?", expectAgent: "data-explorer",
    must: ["có số vendor cụ thể (~20)"] },
  { q: "Đếm số item theo kênh bán", expectAgent: "data-explorer",
    must: ["liệt kê sales_channel kèm số item"] },
]

// ─── ③ tu-van — tìm sản phẩm GoHub theo nước/khu vực (context searchSkus) ────
const TUVAN: BankCase[] = [
  { q: "Đi Nhật có gói eSIM nào?", expectAgent: "tu-van",
    must: ["liệt kê SKU GoHub cho Nhật", "dùng bảng"], mustNot: ["liệt kê catalog NCC như hàng GoHub"] },
  { q: "cho tui danh sách các mã sim đi được Chile", expectAgent: "tu-van",
    must: ["liệt kê SKU cho Chile HOẶC nói rõ GoHub chưa có gói cho Chile"] },
  { q: "Cho tao sim vật lý đi Monaco", expectAgent: "tu-van",
    must: ["lọc SIM vật lý", "trả kết quả cho Monaco hoặc báo chưa có"] },
  { q: "có sản phẩm nào dùng được ở cả Malaysia và Singapore không", expectAgent: "tu-van",
    must: ["xét gói đa quốc gia phủ cả Malaysia và Singapore"] },
  { q: "gói unlimited đi Hàn Quốc", expectAgent: "tu-van",
    must: ["lọc gói unlimited cho Hàn Quốc"], mustNot: ["hiển thị 9999 thay vì 'Unlimited'"] },
  { q: "eSIM Thái Lan 7 ngày có gì", expectAgent: "tu-van",
    must: ["gói eSIM Thái Lan (ưu tiên 7 ngày)"] },
  { q: "gói nào đi châu Âu được", expectAgent: "tu-van",
    must: ["gói khu vực châu Âu / đa quốc gia EU"] },
]

// ─── ④ tra-cuu — tra mã cụ thể + COGS/tỷ giá ────────────────────────────────
const TRACUU: BankCase[] = [
  { q: "1EWORCBF01030 là mã gì vậy", expectAgent: "tra-cuu",
    must: ["nhận diện là SKU", "trả thông tin cơ bản (trạng thái/loại/dung lượng/ngày)"] },
  { q: "giá vốn của 1DTHATMF05010 và 1DTHATMF01507 là bao nhiêu", expectAgent: "tra-cuu",
    must: ["trả COGS cho cả 2 mã", "dùng bảng multi-lookup"] },
  { q: "3EANZ3DF02015 cho tôi thông tin về mã này", expectAgent: "tra-cuu",
    must: ["trả chi tiết SKU"] },
  { q: "tỷ giá USD sang VND hiện tại", expectAgent: ["tra-cuu", "giai-dap"],
    must: ["trả tỷ giá USD/VND"] },
  { q: "mã 1CJPNWM1 là product hay sku?", expectAgent: ["tra-cuu", "giai-dap"],
    must: ["nhận diện 8 ký tự = product code"] },
]

// ─── ⑤ giai-dap — thuật ngữ / cấu trúc mã / nhóm nước / glossary ─────────────
const GIAIDAP: BankCase[] = [
  { q: "KYC là gì trong hệ thống?", expectAgent: "giai-dap",
    must: ["giải thích KYC"] },
  { q: "cấu trúc mã SKU gồm những phần nào?", expectAgent: "giai-dap",
    must: ["product_code(8) + data_amount_code(3) + day_amount(2)"] },
  { q: "AP2 gồm những nước nào?", expectAgent: "giai-dap",
    must: ["liệt kê nước trong nhóm AP2 hoặc nói rõ nếu chưa đăng ký"] },
  { q: "CM1 là gì? khác gì Gross Profit?", expectAgent: "giai-dap",
    must: ["CM1 = Gross Profit - Operation Cost", "phân biệt với Gross Profit"] },
  { q: "data policy code A nghĩa là gì?", expectAgent: "giai-dap",
    must: ["A = Daily Unlimited 5Mbps (hoặc mô tả tương đương)"] },
  { q: "vendor code WM là nhà cung cấp nào?", expectAgent: ["giai-dap", "gap-analysis"],
    must: ["WM = WorldMove"] },
]

// ─── ⑥ gap-analysis — catalog NCC (browse + gap) ────────────────────────────
const GAP: BankCase[] = [
  { q: "WorldMove có gói nào cho Nhật Bản?", expectAgent: "gap-analysis",
    must: ["liệt kê gói WM cho Nhật", "nói rõ đây là hàng NCC không phải GoHub"] },
  { q: "WorldMove còn cung cấp gói Mongolia 5 ngày 8GB không?", expectAgent: "gap-analysis",
    must: ["tra catalog WM cho Mongolia"] },
  { q: "WM có gì mà GoHub chưa tạo SKU?", expectAgent: "gap-analysis",
    must: ["nhấn mạnh gói exist=No (chưa tạo)"] },
  { q: "3HK có zone nào cho Hàn Quốc?", expectAgent: "gap-analysis",
    must: ["tra zone 3HK", "nêu rõ 3HK chỉ là zone + giá HKD/GB"] },
  { q: "gói Mongolia của WorldMove có gọi điện được không?", expectAgent: "gap-analysis",
    must: ["tra thuộc tính call của gói WM Mongolia"] },
]

// ─── ⑦ tao-template — xuất template Excel từ catalog NCC ─────────────────────
const TEMPLATE: BankCase[] = [
  { q: "tạo template WM cho Nhật Bản", expectAgent: "tao-template",
    must: ["hỏi thêm thông tin còn thiếu HOẶC xuất JSON action generate_template"] },
  { q: "xuất template 3HK zone A eSIM unlimited", expectAgent: "tao-template",
    must: ["xuất JSON action hoặc hỏi country code còn thiếu"] },
  { q: "làm file excel template sản phẩm WorldMove Thái Lan", expectAgent: "tao-template",
    must: ["nhận đúng ý định tạo template WM Thái Lan"] },
]

export const BANKS: Record<string, BankCase[]> = {
  "bi-analyst":    BI,
  "data-explorer": DX,
  "tu-van":        TUVAN,
  "tra-cuu":       TRACUU,
  "giai-dap":      GIAIDAP,
  "gap-analysis":  GAP,
  "tao-template":  TEMPLATE,
}
