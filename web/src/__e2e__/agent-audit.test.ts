import { describe, test, expect } from "vitest"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { SUPABASE_TABLES, SENSITIVE_TABLES } from "@/lib/agents/data-explorer"

// ─── AUDIT coverage ──────────────────────────────────────────────────────────
// Đối chiếu KIẾN THỨC trong prompt agent vs DB THẬT. Không gọi Gemini — chỉ introspect.
// Chạy: npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-audit.test.ts
//
// Mục tiêu: phát hiện (1) bảng gohub_dw agent CHƯA biết; (2) bảng trong catalog
// data-explorer nhưng KHÔNG tồn tại Supabase (drift → agent gọi sẽ lỗi); (3) bảng
// Supabase quan trọng nhưng THIẾU khỏi catalog (agent không với tới được).

// Bảng gohub_dw mà bi-analyst prompt (agents.ts) đang liệt kê — nguồn đối chiếu.
const BI_KNOWN_DW = new Set([
  "fact_fulfillment_revenue", "fact_sales_revenue", "fact_data_usage", "data_usage_log",
  "dim_order_source", "dim_sku", "dim_staff", "dim_customer", "dim_location", "dim_date",
  "company", "exchange_rate",
])

// Bảng Supabase phổ biến nhưng có thể chưa nằm trong catalog data-explorer (mở rộng dần).
// Dùng để phát hiện bảng quan trọng bị bỏ sót (không phải liệt kê đủ mọi bảng hệ thống).

describe("AGENT AUDIT — coverage bảng dữ liệu", () => {
  test("gohub_dw: bi-analyst có biết hết bảng fact/dim quan trọng?", async () => {
    const rows = await queryAnalytics<{ table_name: string; kind: string }>(`
      SELECT table_name, 'table' AS kind
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    const real = rows.map(r => r.table_name)
    const factDim = real.filter(t => /^(fact_|dim_|data_usage|company$|exchange_rate$)/.test(t))
    const unknownImportant = factDim.filter(t => !BI_KNOWN_DW.has(t))
    const knownButMissing = [...BI_KNOWN_DW].filter(t => !real.includes(t))

    console.log(`\n══ gohub_dw AUDIT ══`)
    console.log(`Tổng bảng public: ${real.length}`)
    console.log(`Bảng fact/dim/core: ${factDim.length} → ${factDim.join(", ")}`)
    console.log(`⚠️ fact/dim THẬT nhưng bi-analyst CHƯA liệt kê (${unknownImportant.length}): ${unknownImportant.join(", ") || "none"}`)
    console.log(`⚠️ bi-analyst liệt kê nhưng KHÔNG có trong DB (${knownButMissing.length}): ${knownButMissing.join(", ") || "none"}`)
    // Không assert cứng — báo cáo để fix prompt.
    expect(real.length).toBeGreaterThan(0)
  })

  test("gohub_dw: dump cột từng fact/dim (để verify prompt không bịa cột)", async () => {
    const cols = await queryAnalytics<{ table_name: string; column_name: string; data_type: string }>(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name LIKE 'fact_%' OR table_name LIKE 'dim_%'
             OR table_name IN ('company','exchange_rate','data_usage_log'))
      ORDER BY table_name, ordinal_position
    `)
    const byTable: Record<string, string[]> = {}
    for (const c of cols) (byTable[c.table_name] ??= []).push(`${c.column_name}:${c.data_type}`)
    console.log(`\n══ gohub_dw COLUMNS ══`)
    for (const [t, cs] of Object.entries(byTable)) {
      console.log(`\n${t} (${cs.length}):\n  ${cs.join("\n  ")}`)
    }
    expect(Object.keys(byTable).length).toBeGreaterThan(0)
  })

  test("Supabase: catalog data-explorer vs bảng THẬT (drift check)", async () => {
    const all = { ...SUPABASE_TABLES, ...SENSITIVE_TABLES }
    const missing: string[] = []   // trong catalog nhưng probe lỗi (không tồn tại / sai tên)
    const ok: { t: string; count: number | null }[] = []

    for (const t of Object.keys(all)) {
      try {
        const { count, error } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true })
        if (error) missing.push(`${t} [${error.code}: ${error.message.slice(0, 50)}]`)
        else ok.push({ t, count: count ?? null })
      } catch (e: any) {
        missing.push(`${t} [EXC: ${String(e?.message).slice(0, 50)}]`)
      }
    }

    console.log(`\n══ Supabase catalog AUDIT ══`)
    console.log(`Catalog liệt kê: ${Object.keys(all).length} bảng (26 thường + 10 nhạy cảm)`)
    console.log(`✅ Tồn tại & query được (${ok.length}):`)
    for (const o of ok) console.log(`   · ${o.t}: ${o.count} rows`)
    console.log(`❌ TRONG CATALOG NHƯNG LỖI/KHÔNG TỒN TẠI (${missing.length}):`)
    for (const m of missing) console.log(`   · ${m}`)
    expect(Object.keys(all).length).toBeGreaterThan(0)
  })

  test("Supabase: cột thật của các bảng catalog chính (sample 1 row)", async () => {
    const KEY_TABLES = ["products", "skus", "listings", "items", "ncc_worldmove", "ncc_3hk",
                        "ref_countries", "ref_categories", "kb_wiki_pages"]
    console.log(`\n══ Supabase COLUMNS (bảng chính) ══`)
    for (const t of KEY_TABLES) {
      try {
        const { data, error } = await supabaseAdmin.from(t).select("*").limit(1)
        if (error) { console.log(`\n${t}: ERROR ${error.message.slice(0, 60)}`); continue }
        const cols = data?.[0] ? Object.keys(data[0]) : []
        console.log(`\n${t} (${cols.length} cột): ${cols.join(", ")}`)
      } catch (e: any) {
        console.log(`\n${t}: EXC ${String(e?.message).slice(0, 60)}`)
      }
    }
    expect(true).toBe(true)
  })
})
