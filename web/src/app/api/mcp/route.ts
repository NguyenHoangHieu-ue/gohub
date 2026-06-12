import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText }                from "@/lib/kb"

// ─── Auth ────────────────────────────────────────────────────────────────────
function checkAuth(req: NextRequest): boolean {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  return token === (process.env.MCP_SECRET ?? "")
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "search_products",
    description: "Tìm gói Sim/eSIM trong hệ thống GoHub theo nước, ngày, dung lượng",
    inputSchema: {
      type: "object",
      properties: {
        country_group: { type: "string", description: "Mã nhóm nước 3 ký tự: JPN, CHM, EU1, APA, GLO..." },
        days:          { type: "number", description: "Số ngày dùng" },
        data_gb:       { type: "number", description: "Dung lượng GB" },
        vendor:        { type: "string", description: "Mã vendor: WM, 3H, KD..." },
        sim_type:      { type: "string", description: "eSIM hoặc SIM" },
        limit:         { type: "number", description: "Số kết quả tối đa (default 20)" },
      },
    },
  },
  {
    name: "get_sku_detail",
    description: "Lấy thông tin chi tiết 1 SKU code (13 ký tự)",
    inputSchema: {
      type: "object",
      required: ["sku_code"],
      properties: {
        sku_code: { type: "string", description: "SKU code 13 ký tự" },
      },
    },
  },
  {
    name: "search_ncc_catalog",
    description: "Tìm sản phẩm trong catalog nhà cung cấp WM (WORLDMOVE)",
    inputSchema: {
      type: "object",
      properties: {
        search:      { type: "string",  description: "Tên sản phẩm hoặc region" },
        sim_type:    { type: "string",  description: "eSIM hoặc SIM" },
        is_unlimited:{ type: "boolean", description: "Gói unlimited?" },
        limit:       { type: "number",  description: "Số kết quả (default 20)" },
      },
    },
  },
  {
    name: "search_kb",
    description: "Tìm kiếm trong tài liệu nội bộ và wiki của GoHub",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query:      { type: "string", description: "Câu hỏi hoặc từ khóa" },
        department: { type: "string", description: "Phòng ban: sales/product/tech/finance/all" },
      },
    },
  },
  {
    name: "get_fx_rates",
    description: "Lấy tỷ giá nội bộ hiện tại (USD/VND, HKD/USD, TWD/USD...)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_promotions",
    description: "Lấy danh sách sản phẩm đang có khuyến mãi (telco_perks)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_vendors",
    description: "Lấy danh sách nhà cung cấp (vendors) trong hệ thống",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "decode_sku_code",
    description: "Giải mã SKU code 13 ký tự thành các thành phần",
    inputSchema: {
      type: "object",
      required: ["sku_code"],
      properties: {
        sku_code: { type: "string", description: "SKU code 13 ký tự" },
      },
    },
  },
  {
    name: "get_db_schema",
    description: "Lấy cấu trúc các bảng DB chính của GoHub (cho developer)",
    inputSchema: { type: "object", properties: {} },
  },
]

// ─── Tool executors ────────────────────────────────────────────────────────────
async function execTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {

    case "search_products": {
      let q = supabaseAdmin
        .from("sku_catalog")
        .select("sku_code, product_code, country_group, vendor, sim_esim, day_amount, data_amount, is_unlimited, throttle_speed, latest_cogs, latest_cogs_currency, status, tenant")
        .eq("status", "Active")
        .limit(args.limit ?? 20)

      if (args.country_group) q = q.eq("country_group", args.country_group.toUpperCase())
      if (args.days)          q = q.eq("day_amount", args.days)
      if (args.data_gb)       q = q.gte("data_amount", args.data_gb * 0.9).lte("data_amount", args.data_gb * 1.1)
      if (args.vendor)        q = q.ilike("vendor", `%${args.vendor}%`)
      if (args.sim_type)      q = q.ilike("sim_esim", `%${args.sim_type}%`)

      const { data, error } = await q
      if (error) return { error: error.message }
      return { count: data?.length, skus: data }
    }

    case "get_sku_detail": {
      const [skuRes, productRes] = await Promise.all([
        supabaseAdmin.from("skus").select("*").eq("sku_code", args.sku_code).maybeSingle(),
        supabaseAdmin.from("products").select("*").eq("product_code", args.sku_code.slice(0, 8)).maybeSingle(),
      ])
      return { sku: skuRes.data, product: productRes.data }
    }

    case "search_ncc_catalog": {
      let q = supabaseAdmin
        .from("ncc_worldmove")
        .select("vendor_product_id, product_name, region, sim_type, days, data_gb, is_unlimited, is_daily, throttle_kbps, exist")
        .limit(args.limit ?? 20)

      if (args.search)       q = q.ilike("product_name", `%${args.search}%`)
      if (args.sim_type)     q = q.eq("sim_type", args.sim_type)
      if (args.is_unlimited !== undefined) q = q.eq("is_unlimited", args.is_unlimited)

      const { data, error } = await q
      if (error) return { error: error.message }
      return { count: data?.length, products: data }
    }

    case "search_kb": {
      const embedding = await embedText(args.query)
      const [chunksRes, wikiRes] = await Promise.all([
        supabaseAdmin.rpc("search_kb",   { query_embedding: embedding, match_count: 5, match_threshold: 0.4, filter_dept: args.department || null }),
        supabaseAdmin.rpc("search_wiki", { query_embedding: embedding, match_count: 3, match_threshold: 0.4, filter_dept: args.department || null }),
      ])
      return {
        documents: chunksRes.data ?? [],
        wiki:      wikiRes.data   ?? [],
      }
    }

    case "get_fx_rates": {
      const { data } = await supabaseAdmin.from("app_settings").select("key, value, label").ilike("key", "fx.%")
      return { rates: data ?? [] }
    }

    case "get_promotions": {
      const { data } = await supabaseAdmin
        .from("products")
        .select("product_code, vendor_code, type_of_sim, telco_perks, telco_perks_start, telco_perks_end")
        .not("telco_perks", "is", null)
        .neq("telco_perks", "")
        .limit(50)
      return { promotions: data ?? [] }
    }

    case "list_vendors": {
      const { data } = await supabaseAdmin.from("ref_vendors").select("vendor_code, vendor_name, vendor_type")
      return { vendors: data ?? [] }
    }

    case "decode_sku_code": {
      const code = args.sku_code as string
      if (code.length !== 13) return { error: "SKU code phải đúng 13 ký tự" }
      return {
        sku_code:      code,
        purchase_type: code[0],
        product_type:  code[1],
        country_group: code.slice(2, 5),
        vendor:        code.slice(5, 7),
        data_type:     code[7],
        data_amount:   code.slice(8, 11),
        day_amount:    code.slice(11, 13),
        product_code:  code.slice(0, 8),
      }
    }

    case "get_db_schema": {
      return {
        tables: {
          products:             "product_code(PK), vendor_code, type_of_sim, supported_countries, kyc_needed, telco_perks, note",
          skus:                 "sku_code(PK,13chars), product_code(FK→products,8chars), tenant, status, sim_esim, day_amount, data_amount, latest_cogs, latest_cogs_currency",
          sku_catalog:          "pre-joined view: sku_code, country_group, vendor, sim_esim, day_amount, data_amount, is_unlimited, throttle_speed, latest_cogs",
          listings:             "listing_code(PK), reference_product_code(FK), listing_name_vn, listing_name_en, telco_perks_vn, telco_perks_en",
          items:                "item_code(PK,18chars), sku_code(FK), listing_code(FK), status, unitprice",
          ncc_worldmove:        "vendor_product_id(PK), product_name, region, sim_type, days, data_gb, is_unlimited, throttle_kbps, cogs(TWD), exist(Yes/No)",
          ref_support_countries:"code(3chars), support_country(tên nhóm), country_codes(ISO codes)",
          ref_vendors:          "vendor_code, vendor_name, vendor_type",
          app_settings:         "key(fx.usd_vnd|fx.hkd_usd|...), value, label",
          kb_documents:         "id, name, file_type, department, chunk_count, uploaded_by",
          kb_chunks:            "id, document_id(FK), content, embedding(vector 3072), chunk_index",
          kb_wiki_pages:        "id, title, content(Markdown), page_type, department, tags, version, created_by",
          conversations:        "id(UUID), username, title — chat history sessions",
          chat_messages:        "id, conversation_id(FK), role, content, agent_id, agent_name",
        },
        sku_code_format: "[PurchaseType(1)][ProductType(1)][CountryGroup(3)][Vendor(2)][DataType(1)][DataAmount(3)][DayAmount(2)]",
        item_code_format: "[Channel(1)][Partner(2)][PricelistCode(2)][SKU_CODE(13)][Number(2)]",
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── MCP Handler (JSON-RPC 2.0) ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAuth(req))
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }, { status: 401 })

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }) }

  const { method, params, id } = body

  try {
    let result: any

    if (method === "initialize") {
      result = {
        protocolVersion: "2024-11-05",
        capabilities:    { tools: {} },
        serverInfo:      { name: "gohub-mcp", version: "1.0.0" },
      }
    } else if (method === "tools/list") {
      result = { tools: TOOLS }
    } else if (method === "tools/call") {
      const toolResult = await execTool(params?.name, params?.arguments ?? {})
      result = {
        content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
      }
    } else if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 204 })
    } else {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32601, message: `Method not found: ${method}` }, id })
    }

    return NextResponse.json({ jsonrpc: "2.0", result, id })
  } catch (e: any) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32000, message: e.message }, id })
  }
}

// GET: health check + instructions
export async function GET() {
  return NextResponse.json({
    name:    "GoHub MCP Server",
    version: "1.0.0",
    tools:   TOOLS.map(t => t.name),
    usage:   "POST /api/mcp với Authorization: Bearer <MCP_SECRET>",
  })
}
