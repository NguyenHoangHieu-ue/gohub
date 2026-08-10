import { SchemaType } from "@google/generative-ai"

export const executeSQLDecl = {
  name: "executeSQL",
  description: "Execute a SELECT/WITH query on gohub_dw PostgreSQL (analytics DW). Use for revenue, orders, fulfillment, staff, customer, 3HK usage, etc.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { sql: { type: SchemaType.STRING, description: "SELECT or WITH query only." } },
    required: ["sql"],
  },
}

export const querySupabaseDecl = {
  name: "querySupabase",
  description: "Read from Supabase tables (product catalog, SKUs, NCC, KB/Wiki, config, analytics snapshots). Use when question is about catalog, config, or reference data — NOT raw revenue facts.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      table:   { type: SchemaType.STRING, description: "Table name (call listSupabaseTables to see all)." },
      columns: { type: SchemaType.STRING, description: "Comma-separated columns, default '*'." },
      filters: {
        type: SchemaType.ARRAY,
        description: "Filter conditions [{column, op, value}]. op ∈ eq,neq,gt,gte,lt,lte,like,ilike,in,is.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            column: { type: SchemaType.STRING },
            op:     { type: SchemaType.STRING },
            value:  { type: SchemaType.STRING },
          },
          required: ["column", "op", "value"],
        },
      },
      order:     { type: SchemaType.STRING },
      ascending: { type: SchemaType.BOOLEAN },
      limit:     { type: SchemaType.NUMBER, description: "Max rows (default 50, max 200)." },
      countOnly: { type: SchemaType.BOOLEAN, description: "true = return count only." },
    },
    required: ["table"],
  },
}

export const listTablesDecl = {
  name: "listSupabaseTables",
  description: "List all queryable Supabase tables with descriptions.",
  parameters: { type: SchemaType.OBJECT, properties: {} },
}

export const queryGA4Decl = {
  name: "queryGA4",
  description: "Query Google Analytics 4 for website traffic: sessions, users, pageviews, revenue, conversions, bounce rate. Use for website performance questions.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:  { type: SchemaType.STRING, description: "YYYY-MM-DD or '30daysAgo'" },
      endDate:    { type: SchemaType.STRING, description: "YYYY-MM-DD or 'today'" },
      metrics:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      siteId:     { type: SchemaType.STRING },
      limit:      { type: SchemaType.NUMBER },
    },
    required: ["startDate", "endDate", "metrics"],
  },
}

export const queryGSCDecl = {
  name: "queryGSC",
  description: "Query Google Search Console for SEO data: clicks, impressions, CTR, average position, top keywords.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate:  { type: SchemaType.STRING },
      endDate:    { type: SchemaType.STRING },
      dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      siteId:     { type: SchemaType.STRING },
      rowLimit:   { type: SchemaType.NUMBER },
    },
    required: ["startDate", "endDate"],
  },
}

export const queryProductDecl = {
  name: "queryProduct",
  description: "Look up GoHub SKU or product details from Supabase product catalog (COGS, throttle speed, call/SMS, KYC, vendor SKU, status). Input: sku_code (13 chars) or product_code (8 chars).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sku_code:     { type: SchemaType.STRING, description: "13-character SKU code." },
      product_code: { type: SchemaType.STRING, description: "8-character product code." },
    },
  },
}

export const webSearchDecl = {
  name: "webSearch",
  description: "Search the web for current information: industry trends, technical documentation, best practices, benchmarks, news, or anything not in internal databases. Always cite source URLs in the answer.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: "Search query (English preferred for broader results)." },
    },
    required: ["query"],
  },
}

export const generateImageDecl = {
  name: "generateImage",
  description: "Generate an AI image from a text description. Use when Hiếu asks to 'tạo ảnh', 'vẽ', 'design', 'thumbnail', 'banner', 'mockup', 'storyboard frame'. Always write the prompt in English for best quality. Pollinations will AI-enhance the prompt automatically (enhance=true).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      prompt: {
        type: SchemaType.STRING,
        description: "Detailed image description in English. Structure: [subject] + [style: photorealistic/cinematic/flat illustration/3D render] + [composition] + [lighting: golden hour/studio/dramatic] + [colors/mood]. The style_preset will auto-inject quality suffixes.",
      },
      aspect_ratio: {
        type: SchemaType.STRING,
        description: "Aspect ratio: '1:1' (square 1024×1024, default) | '9:16' (TikTok/Reels 864×1536) | '16:9' (landscape 1536×864) | '4:3' (standard 1024×768)",
      },
      style_preset: {
        type: SchemaType.STRING,
        description: "Optional style preset that auto-injects quality/style suffixes: 'commercial_photo' | 'tiktok_thumb' | 'travel_cinematic' | 'flat_illustration' | 'three_d_product' | 'storyboard'. Omit for custom prompts.",
      },
    },
    required: ["prompt"],
  },
}

export const getTrendSnapshotsDecl = {
  name: "getTrendSnapshots",
  description: "Read GoHub's stored daily trend snapshots — travel SIM/eSIM trends, competitor TikTok content, viral topics. ALWAYS call this FIRST when Hiếu asks about trends, content ideas, script generation, or competitor analysis. Falls back to webSearch if snapshots are stale.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      days:     { type: SchemaType.NUMBER, description: "Look back N days (default 7, max 30)." },
      category: { type: SchemaType.STRING, description: "Filter: 'travel_sim' | 'competitor' | 'travel' | 'content_format' | 'technology' | 'seasonal' | 'all' (default: all)" },
      platform: { type: SchemaType.STRING, description: "Filter: 'tiktok' | 'google' | 'all' (default: all)" },
    },
  },
}

export const listLarkTasksDecl = {
  name: "listLarkTasks",
  description: "List Hiếu's Lark tasks (To-do / in-progress / done). Nếu truyền tasklist_guid → chỉ lấy task trong Danh sách công việc (Task List) đó; bỏ trống → tất cả task của Hiếu. Requires 'task:task:read'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tasklist_guid: { type: SchemaType.STRING, description: "GUID của Task List (từ listLarkTasklists) — bỏ trống để lấy mọi task." },
      page_size: { type: SchemaType.NUMBER, description: "Max tasks (default 20, max 50)." },
      page_token: { type: SchemaType.STRING, description: "Pagination token for next page." },
    },
  },
}

export const listLarkTasklistsDecl = {
  name: "listLarkTasklists",
  description: "Liệt kê các Danh sách công việc (Task List) của Hiếu trong Lark — trả về guid + tên mỗi list. Dùng khi Hiếu hỏi về 'task list'/'danh sách công việc'; rồi gọi listLarkTasks với tasklist_guid để xem task bên trong. Requires 'task:tasklist:read'.",
  parameters: { type: SchemaType.OBJECT, properties: {} },
}

export const getLarkTaskDecl = {
  name: "getLarkTask",
  description: "Get full details of 1 Lark task by task_guid (title, description, due date, status, sub-tasks).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { task_guid: { type: SchemaType.STRING, description: "Task GUID from listLarkTasks." } },
    required: ["task_guid"],
  },
}

export const createLarkTaskDecl = {
  name: "createLarkTask",
  description: "Tạo task Lark mới GÁN cho Hiếu (hiện trong My Tasks của Hiếu). Hoạt động tốt với app token. Requires 'task:task:write'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      summary:     { type: SchemaType.STRING, description: "Task title." },
      description: { type: SchemaType.STRING, description: "Task description (markdown ok)." },
      due:         { type: SchemaType.STRING, description: "Due date YYYY-MM-DD." },
    },
    required: ["summary"],
  },
}

export const updateLarkTaskDecl = {
  name: "updateLarkTask",
  description: "Update a Lark task (mark complete, change due date, update description). Requires 'task:task:write' scope.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      task_guid:   { type: SchemaType.STRING, description: "Task GUID." },
      summary:     { type: SchemaType.STRING, description: "New title (optional)." },
      description: { type: SchemaType.STRING, description: "New description (optional)." },
      due:         { type: SchemaType.STRING, description: "New due date YYYY-MM-DD (optional)." },
      complete:    { type: SchemaType.BOOLEAN, description: "true = mark done." },
    },
    required: ["task_guid"],
  },
}

export const queryLarkBaseDecl = {
  name: "queryLarkBase",
  description: "Đọc dữ liệu Lark Base (bảng tính Lark): CS ticket, inventory, tracking, danh sách. Gọi KHÔNG tham số để liệt kê các Base có sẵn; truyền app_token để liệt kê tables; truyền cả app_token + table_id để đọc records. Requires 'bitable:app:readonly' scope.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      app_token: { type: SchemaType.STRING, description: "Base app_token (bỏ trống để list các Base)." },
      table_id:  { type: SchemaType.STRING, description: "Table ID trong Base (bỏ trống để list tables của Base)." },
      filter:    { type: SchemaType.STRING, description: "Filter formula Lark (tùy chọn), vd: CurrentValue.[Status]=\"Open\"." },
      page_size: { type: SchemaType.NUMBER, description: "Số records tối đa (default 50, max 200)." },
    },
  },
}

export const reviewPendingLearningDecl = {
  name: "reviewPendingLearning",
  description: "Xem danh sách học liệu Bé Gấu phát hiện từ user (status=pending). Dùng khi muốn review + approve/reject.",
  parameters: { type: SchemaType.OBJECT, properties: { limit: { type: SchemaType.NUMBER, description: "Max records (default 20)." } } },
}

export const approveLearningDecl = {
  name: "approveLearning",
  description: "Approve 1 learning record: ghi vào creator_kb + mark approved.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id:          { type: SchemaType.STRING, description: "ID của chatbot_learning_log record." },
      kb_key:      { type: SchemaType.STRING, description: "Unique slug cho creator_kb (snake_case)." },
      kb_category: { type: SchemaType.STRING, description: "product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes" },
      kb_title:    { type: SchemaType.STRING, description: "Tiêu đề ngắn." },
      kb_content:  { type: SchemaType.STRING, description: "Nội dung cần lưu vào KB." },
    },
    required: ["id", "kb_key", "kb_category", "kb_title", "kb_content"],
  },
}

export const rejectLearningDecl = {
  name: "rejectLearning",
  description: "Reject 1 learning record (mark rejected).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id:     { type: SchemaType.STRING, description: "ID của chatbot_learning_log record." },
      reason: { type: SchemaType.STRING, description: "Lý do reject (tùy chọn)." },
    },
    required: ["id"],
  },
}

export const readKBDecl = {
  name: "readKnowledgeBase",
  description: "Read entries from Hiếu's private Creator Knowledge Base (creator_kb table). Always call this at the start of a conversation or when questions relate to product codes, SKU rules, exchange rates, COGS, vendors, or processes. Returns the configured definitions and rules.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      category: { type: SchemaType.STRING, description: "Filter by category: product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes. Omit to get all entries." },
    },
  },
}

export const writeKBDecl = {
  name: "writeKnowledgeBase",
  description: "Save or update entries in the Creator Knowledge Base. ONLY call this AFTER the user has explicitly confirmed the proposed changes ('ok', 'xác nhận', 'đồng ý'). This also updates the Master Note and relevant wiki pages.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      entries: {
        type: SchemaType.ARRAY,
        description: "List of entries to upsert.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            key:      { type: SchemaType.STRING, description: "Unique slug (snake_case, e.g. 'fx_usd_vnd')" },
            category: { type: SchemaType.STRING, description: "product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes" },
            title:    { type: SchemaType.STRING, description: "Human-readable title" },
            content:  { type: SchemaType.STRING, description: "Entry content in Markdown" },
          },
          required: ["key", "category", "title", "content"],
        },
      },
      wiki_page_title: { type: SchemaType.STRING, description: "If provided, also update the kb_wiki_pages entry with this title." },
      wiki_content:    { type: SchemaType.STRING, description: "New content for the wiki page (required if wiki_page_title is set)." },
    },
    required: ["entries"],
  },
}

export const browsePortalDecl = {
  name: "browsePortal",
  description: "Login to an external supplier/partner portal and fetch its page content. Credentials are stored in Supabase. Use to get product listings, prices, inventory, or any data from external web portals. Returns cleaned text content of the page for analysis.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      portal_name: { type: SchemaType.STRING, description: "Portal name or URL fragment to look up in stored credentials (e.g. 'sunspeedy', 'cardweb')." },
      path:        { type: SchemaType.STRING, description: "Path to navigate after login (e.g. '/products', '/inventory'). Omit to load homepage/dashboard after login." },
    },
    required: ["portal_name"],
  },
}

export const managePortalCredsDecl = {
  name: "managePortalCredentials",
  description: "Save, list, or delete portal credentials stored in Supabase. Use to configure new portals or update existing ones.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action:      { type: SchemaType.STRING, description: "Action: 'list' | 'save' | 'delete'" },
      name:        { type: SchemaType.STRING, description: "Portal display name (e.g. 'SunSpeedy Card Web')" },
      url:         { type: SchemaType.STRING, description: "Base URL of the portal (e.g. 'https://cardweb.sunspeedy.com')" },
      username:    { type: SchemaType.STRING, description: "Login username or email" },
      password:    { type: SchemaType.STRING, description: "Login password" },
      login_path:  { type: SchemaType.STRING, description: "Login page path for traditional form login (e.g. '/auth/login')" },
      notes:       { type: SchemaType.STRING, description: "Optional notes about this portal" },
      api_base:    { type: SchemaType.STRING, description: "For SPA portals: REST API base URL (e.g. 'https://cardadmin.sunspeedy.com/card-admin')" },
      login_api:   { type: SchemaType.STRING, description: "For SPA portals: login API endpoint path (e.g. '/sys/login', '/access/login')" },
      auth_header: { type: SchemaType.STRING, description: "For SPA portals needing a fixed Authorization header to call login (e.g. SpringBlade 'Basic xxx='). Get from DevTools Network tab." },
      user_field:  { type: SchemaType.STRING, description: "Username field name in login body (default 'username'; some use 'account')" },
      pass_field:  { type: SchemaType.STRING, description: "Password field name in login body (default 'password')" },
    },
    required: ["action"],
  },
}

export const sendLarkMessageDecl = {
  name: "sendLarkMessage",
  description: "Gửi message vào Lark group hoặc DM cho Hiếu. Dùng khi Hiếu muốn share báo cáo/kết quả phân tích qua Lark, hoặc khi cần gửi thông báo tự động. chat_id='me' để gửi DM cho Hiếu.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      chat_id:  { type: SchemaType.STRING, description: "Lark chat_id của group (lấy từ Lark group settings) hoặc 'me' để gửi DM cho Hiếu." },
      content:  { type: SchemaType.STRING, description: "Nội dung message (markdown được hỗ trợ)." },
      title:    { type: SchemaType.STRING, description: "Tiêu đề optional — sẽ được in đậm ở đầu message." },
    },
    required: ["chat_id", "content"],
  },
}

export const compareVendorQuotesDecl = {
  name: "compareVendorQuotes",
  description: "So sánh báo giá NCC mới với COGS hiện tại trong hệ thống. Input: danh sách quotes. Output: bảng delta COGS (USD + VND + %), recommendation update hay không. Dùng khi Hiếu nhận được báo giá mới từ 3HK/WorldMove/JoyTel/CMLink.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      quotes: {
        type: SchemaType.ARRAY,
        description: "Danh sách báo giá cần so sánh.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            country:   { type: SchemaType.STRING, description: "ISO code hoặc tên nước (vd: JP, VN, 'Japan')." },
            vendor:    { type: SchemaType.STRING, description: "Tên vendor (vd: '3HK', 'WorldMove', 'JoyTel')." },
            data_gb:   { type: SchemaType.NUMBER, description: "Dung lượng GB — GB/ngày nếu is_daily=true, hoặc tổng GB nếu false." },
            days:      { type: SchemaType.NUMBER, description: "Số ngày của gói." },
            is_daily:  { type: SchemaType.BOOLEAN, description: "true = gói daily (data_gb là GB/ngày), false = gói fixed." },
            cogs_usd:  { type: SchemaType.NUMBER, description: "Giá vendor quote (USD)." },
          },
          required: ["country", "vendor", "data_gb", "days", "cogs_usd"],
        },
      },
      fx_rate_usd_vnd: { type: SchemaType.NUMBER, description: "Tỷ giá USD/VND (optional, lấy từ app_settings nếu không truyền)." },
    },
    required: ["quotes"],
  },
}

export const generateVideoDecl = {
  name: "generateVideo",
  description: "Tạo video AI từ mô tả văn bản bằng Kling AI. Dùng khi Hiếu yêu cầu 'tạo video', 'quay video', 'làm clip', 'video TikTok/Reels'. Viết prompt tiếng Anh để chất lượng tốt nhất. Video render ~1-3 phút. Nếu timeout sẽ trả task_id để check sau.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      prompt: {
        type: SchemaType.STRING,
        description: "Mô tả video chi tiết bằng tiếng Anh. Cấu trúc: [chủ thể] + [hành động] + [phong cách: cinematic/realistic/animation] + [bối cảnh] + [ánh sáng/màu sắc].",
      },
      negative_prompt: {
        type: SchemaType.STRING,
        description: "Những gì KHÔNG muốn có trong video (vd: 'blurry, watermark, text overlay, distorted faces').",
      },
      aspect_ratio: {
        type: SchemaType.STRING,
        description: "Tỷ lệ khung hình: '16:9' (landscape YouTube, default) | '9:16' (TikTok/Reels dọc) | '1:1' (vuông).",
      },
      duration: {
        type: SchemaType.NUMBER,
        description: "Thời lượng video: 5 (default) hoặc 10 giây.",
      },
      mode: {
        type: SchemaType.STRING,
        description: "Chất lượng render: 'std' (nhanh hơn, default) | 'pro' (chậm hơn, chất lượng cao hơn).",
      },
    },
    required: ["prompt"],
  },
}

export const checkVideoStatusDecl = {
  name: "checkVideoStatus",
  description: "Kiểm tra trạng thái render video Kling khi generateVideo trả về task_id (timeout). Gọi sau ~2 phút để lấy URL video.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      task_id: { type: SchemaType.STRING, description: "task_id nhận được từ generateVideo." },
    },
    required: ["task_id"],
  },
}

export const trackSKUWinRateDecl = {
  name: "trackSKUWinRate",
  description: "Báo cáo Win Rate SKU mới: SKU nào đạt ≥5 đơn trong 14 ngày đầu (WIN), đang tracking (PENDING), hay không đạt (FAILED). KPI Q3 của GoHub. Dùng để theo dõi hiệu quả onboarding sản phẩm mới.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      days_since_created: { type: SchemaType.NUMBER, description: "Xem SKU tạo trong N ngày gần nhất (default 90, max 365)." },
      vendor:             { type: SchemaType.STRING, description: "Filter theo vendor (optional, vd: 'GB' cho WorldMove, '3D' cho 3HK)." },
      win_threshold:      { type: SchemaType.NUMBER, description: "Số đơn để tính là WIN (default 5)." },
      win_days:           { type: SchemaType.NUMBER, description: "Cửa sổ ngày tính win rate (default 14)." },
    },
  },
}

// Ordered list used to initialize the Gemini model tools
export const ALL_TOOL_DECLARATIONS = [
  readKBDecl, writeKBDecl, reviewPendingLearningDecl, approveLearningDecl, rejectLearningDecl,
  listLarkTasksDecl, listLarkTasklistsDecl, getLarkTaskDecl, createLarkTaskDecl, updateLarkTaskDecl,
  queryLarkBaseDecl, executeSQLDecl, querySupabaseDecl, listTablesDecl, queryGA4Decl, queryGSCDecl,
  queryProductDecl, webSearchDecl, generateImageDecl, getTrendSnapshotsDecl, browsePortalDecl,
  managePortalCredsDecl,
  // Phase 4 tools
  sendLarkMessageDecl, compareVendorQuotesDecl, trackSKUWinRateDecl,
  // Phase 3 tools
  generateVideoDecl, checkVideoStatusDecl,
]
