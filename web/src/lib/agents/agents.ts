import type { AgentId, UserRole } from "./types"

export interface AgentDef {
  id:           AgentId
  name:         string
  icon:         string
  systemPrompt: string
  tools:        any[]         // Gemini tool declarations
  allowedRoles: UserRole[]
}

// ─── Tool declarations (Gemini function calling format) ───────────────────────

const TOOL_SEARCH_SKUS = {
  name: "search_skus",
  description: "Tìm kiếm SKU đang Active theo nước, ngày, dung lượng, vendor, loại SIM",
  parameters: {
    type: "OBJECT",
    properties: {
      country:      { type: "STRING",  description: "Tên nước tiếng Anh, ví dụ: Japan, Thailand" },
      days:         { type: "INTEGER", description: "Số ngày sử dụng" },
      data_gb:      { type: "NUMBER",  description: "Dung lượng data (GB)" },
      is_unlimited: { type: "BOOLEAN", description: "true nếu tìm gói unlimited" },
      vendor:       { type: "STRING",  description: "Mã vendor: WM (WorldMove), 3H (3HK)" },
      sim_type:     { type: "STRING",  description: "SIM hoặc eSIM" },
      tenant:       { type: "STRING",  description: "VN hoặc US" },
    },
    required: ["country"],
  },
}

const TOOL_GET_PRODUCT_DETAIL = {
  name: "get_product_detail",
  description: "Lấy thông tin đầy đủ của 1 SKU: trạng thái, data, ngày, throttle, KYC, activation, listing",
  parameters: {
    type: "OBJECT",
    properties: {
      sku_code: { type: "STRING", description: "Mã SKU 13 ký tự" },
    },
    required: ["sku_code"],
  },
}

const TOOL_DECODE_SKU = {
  name: "decode_sku_code",
  description: "Giải thích ý nghĩa từng ký tự trong mã SKU 13 ký tự",
  parameters: {
    type: "OBJECT",
    properties: {
      sku_code: { type: "STRING", description: "Mã SKU 13 ký tự" },
    },
    required: ["sku_code"],
  },
}

const TOOL_GET_COUNTRY_INFO = {
  name: "get_country_info",
  description: "Tra cứu nhóm nước hỗ trợ, danh sách nước trong nhóm, mã nhóm",
  parameters: {
    type: "OBJECT",
    properties: {
      country_name: { type: "STRING", description: "Tên nước cần tra cứu (optional)" },
    },
  },
}

const TOOL_GET_VENDOR_INFO = {
  name: "get_vendor_info",
  description: "Lấy thông tin vendor (nhà cung cấp) trong hệ thống GoHub",
  parameters: {
    type: "OBJECT",
    properties: {
      vendor_code: { type: "STRING", description: "Mã vendor 2 ký tự (optional, nếu không có trả về tất cả)" },
    },
  },
}

const TOOL_GET_FX_RATES = {
  name: "get_fx_rates",
  description: "Lấy tỷ giá nội bộ hiện tại (USD/VND, HKD/USD, TWD/USD)",
  parameters: { type: "OBJECT", properties: {} },
}

const TOOL_GET_SKU_COGS = {
  name: "get_sku_cogs",
  description: "Lấy thông tin giá vốn (COGS) của 1 SKU cụ thể",
  parameters: {
    type: "OBJECT",
    properties: {
      sku_code: { type: "STRING", description: "Mã SKU 13 ký tự" },
    },
    required: ["sku_code"],
  },
}

const TOOL_CALC_3HK = {
  name: "calculate_3hk_cogs",
  description: "Tính COGS ước tính cho sản phẩm 3HK Datapool theo công thức nội bộ",
  parameters: {
    type: "OBJECT",
    properties: {
      zone:      { type: "STRING",  description: "Zone 3HK, ví dụ: Zone A, Zone B" },
      days:      { type: "INTEGER", description: "Số ngày" },
      data_type: { type: "STRING",  description: "fixed | daily | unlim_10mbps | unlim_5mbps" },
      data_gb:   { type: "NUMBER",  description: "Dung lượng GB (cho fixed/daily)" },
    },
    required: ["zone", "days", "data_type"],
  },
}

const TOOL_SEARCH_NCC_WM = {
  name: "search_ncc_wm",
  description: "Tìm kiếm sản phẩm trong catalog WorldMove (NCC)",
  parameters: {
    type: "OBJECT",
    properties: {
      country:  { type: "STRING",  description: "Tên vùng/nước (tiếng Anh)" },
      days:     { type: "INTEGER", description: "Số ngày" },
      sim_type: { type: "STRING",  description: "eSIM hoặc SIM" },
    },
  },
}

const TOOL_SEARCH_NCC_3HK = {
  name: "search_ncc_3hk",
  description: "Lấy thông tin zone/giá của 3HK theo nước",
  parameters: {
    type: "OBJECT",
    properties: {
      country: { type: "STRING", description: "Tên nước (tiếng Anh)" },
    },
  },
}

const TOOL_FIND_GAPS = {
  name: "find_gaps",
  description: "Tìm sản phẩm NCC (WM/3HK) chưa được import vào hệ thống GoHub",
  parameters: {
    type: "OBJECT",
    properties: {
      country: { type: "STRING", description: "Tên nước lọc (optional)" },
      vendor:  { type: "STRING", description: "wm | 3hk | all" },
    },
  },
}

// ─── Agent definitions ────────────────────────────────────────────────────────

export const AGENTS: Record<AgentId, AgentDef> = {
  "tu-van": {
    id: "tu-van",
    name: "Tư Vấn",
    icon: "🔍",
    allowedRoles: ["admin", "manager", "standard"],
    tools: [{ functionDeclarations: [TOOL_SEARCH_SKUS, TOOL_GET_PRODUCT_DETAIL, TOOL_GET_COUNTRY_INFO] }],
    systemPrompt: `Bạn là Agent Tư Vấn của GoHub — chuyên gợi ý sản phẩm SIM/eSIM phù hợp.

Khi user hỏi tìm gói đi nước X:
1. Gọi search_skus với các tham số từ yêu cầu (country bắt buộc, days/data_gb/sim_type nếu có)
2. Từ kết quả, gợi ý 2-3 sản phẩm tốt nhất — ưu tiên tenant=VN trước US
3. Trình bày rõ: SKU code (monospace), số ngày, dung lượng, throttle, KYC, operator
4. Nếu user hỏi thêm về 1 gói cụ thể: gọi get_product_detail để lấy thông tin đầy đủ
5. Nếu không tìm thấy: nói rõ và gợi ý gần nhất có sẵn

Trả lời tiếng Việt, ngắn gọn, không bịa thông tin.`,
  },

  "tra-cuu": {
    id: "tra-cuu",
    name: "Tra Cứu",
    icon: "📋",
    allowedRoles: ["admin", "manager", "standard"],
    tools: [{ functionDeclarations: [TOOL_GET_PRODUCT_DETAIL, TOOL_DECODE_SKU] }],
    systemPrompt: `Bạn là Agent Tra Cứu của GoHub — chuyên cung cấp thông tin chi tiết về sản phẩm.

Khi user cung cấp mã SKU hoặc hỏi về sản phẩm cụ thể:
1. Gọi get_product_detail(sku_code) để lấy thông tin đầy đủ
2. Trình bày đầy đủ: trạng thái, loại SIM, data, ngày, throttle, KYC, activation, APN, tên listing VN/EN
3. Nếu SKU không tồn tại: thông báo rõ ràng

Nếu user hỏi ý nghĩa mã SKU: gọi decode_sku_code(sku_code) để giải thích từng ký tự.

Trả lời tiếng Việt, chính xác, đầy đủ.`,
  },

  "giai-dap": {
    id: "giai-dap",
    name: "Giải Đáp",
    icon: "💡",
    allowedRoles: ["admin", "manager", "standard"],
    tools: [{ functionDeclarations: [TOOL_GET_VENDOR_INFO, TOOL_GET_COUNTRY_INFO, TOOL_DECODE_SKU] }],
    systemPrompt: `Bạn là Agent Giải Đáp của GoHub — chuyên giải thích hệ thống, quy trình và thuật ngữ.

Có thể trả lời về:
- Cấu trúc mã SKU (13 ký tự), product code (8 ký tự)
- Data policy codes: A=Daily Unlim 5Mbps, B=Daily Unlim 10Mbps, C/D=Unlim 20/100Mbps, E/G=Fixed Unlim, F/P=throttle<2Mbps, Y/Z=no-throttle, K=no data
- Source type codes: VN (1-6), US (A-E)
- KYC, activation, throttle, hotspot là gì
- Vendor, country group là gì
- Tenant VN vs US khác gì

Dùng tools khi cần tra cứu data cụ thể (danh sách vendor, thông tin nhóm nước).
Trả lời tiếng Việt, rõ ràng, dễ hiểu.`,
  },

  "gia-cogs": {
    id: "gia-cogs",
    name: "Giá & COGS",
    icon: "💰",
    allowedRoles: ["admin", "manager"],
    tools: [{ functionDeclarations: [TOOL_GET_FX_RATES, TOOL_GET_SKU_COGS, TOOL_CALC_3HK] }],
    systemPrompt: `Bạn là Agent Giá & COGS của GoHub — chuyên phân tích chi phí và giá vốn.

Quy tắc về giá:
- latest_cogs = giá vốn gốc (theo đơn vị latest_cogs_currency)
- Tỷ giá từ app_settings: fx.usd_vnd, fx.hkd_usd, fx.twd_usd
- 3HK COGS: tính theo công thức (gọi calculate_3hk_cogs)
- Luôn hiển thị cả USD và VND khi được hỏi, không làm tròn quá nhiều

Workflow:
1. Hỏi về giá 1 SKU → get_sku_cogs + get_fx_rates để quy đổi
2. Hỏi tỷ giá → get_fx_rates
3. Tính 3HK COGS → calculate_3hk_cogs

Trả lời tiếng Việt, chính xác số liệu.`,
  },

  "gap-analysis": {
    id: "gap-analysis",
    name: "Gap Analysis",
    icon: "🔄",
    allowedRoles: ["admin", "manager"],
    tools: [{ functionDeclarations: [TOOL_SEARCH_NCC_WM, TOOL_SEARCH_NCC_3HK, TOOL_FIND_GAPS] }],
    systemPrompt: `Bạn là Agent Gap Analysis của GoHub — chuyên so sánh catalog NCC vs sản phẩm hệ thống.

Khi user hỏi về gap:
1. Gọi find_gaps với country/vendor tương ứng
2. Trình bày: tổng NCC / đã import / chưa import
3. Liệt kê top sản phẩm chưa import (vendor_product_id, region, days, data, throttle)
4. Gợi ý nên nhập gói nào nếu có context

3HK chỉ cung cấp zone/network/giá HKD/GB — không phải sản phẩm hoàn chỉnh, cần Hiếu tạo mới.

Dùng search_ncc_wm hoặc search_ncc_3hk để xem catalog chi tiết.
Trả lời tiếng Việt, rõ ràng số liệu.`,
  },
}

export const AGENT_LIST = Object.values(AGENTS)
