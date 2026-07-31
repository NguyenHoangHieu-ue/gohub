import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { queryAnalytics }            from "@/lib/analytics-db"

// Creator-only CRUD for creator_kb table

async function guard(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "creator") return null
  return session
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: "Creator only" }, { status: 403 })

  // ?regenerate=1 → force regenerate master note only
  if (req.nextUrl.searchParams.get("regenerate") === "1") {
    await regenerateMasterNote()
    return NextResponse.json({ ok: true, message: "Master note regenerated" })
  }

  // ?action=sync → sync wiki pages + FX rates vào creator_kb
  if (req.nextUrl.searchParams.get("action") === "sync") {
    const result = await syncFromSystem()
    return NextResponse.json(result)
  }

  const category = req.nextUrl.searchParams.get("category")
  let q = supabaseAdmin.from("creator_kb").select("*").order("category").order("updated_at", { ascending: false })
  if (category) q = q.eq("category", category)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: "Creator only" }, { status: 403 })

  const body = await req.json()
  const { key, category, title, content, metadata } = body

  if (!key || !title || !content) {
    return NextResponse.json({ error: "key, title, content required" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from("creator_kb").upsert({
    key, category: category || "notes", title, content, metadata: metadata || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Regenerate master note after each save
  await regenerateMasterNote()

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: "Creator only" }, { status: 403 })

  const key = req.nextUrl.searchParams.get("key")
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 })
  if (key.startsWith("_")) return NextResponse.json({ error: "Cannot delete system entries" }, { status: 400 })

  const { error } = await supabaseAdmin.from("creator_kb").delete().eq("key", key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await regenerateMasterNote()
  return NextResponse.json({ ok: true })
}

// ─── Master note regeneration ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  product_codes:  "Mã Sản Phẩm & Cấu Trúc",
  sku_rules:      "Quy Tắc SKU",
  exchange_rates: "Tỷ Giá",
  cogs:           "COGS & Giá Vốn",
  vendors:        "Nhà Cung Cấp",
  processes:      "Quy Trình",
  wiki:           "Wiki & Tài Liệu",
  notes:          "Ghi Chú Khác",
}

async function regenerateMasterNote() {
  try {
    const { data } = await supabaseAdmin.from("creator_kb")
      .select("*").neq("category", "_system").order("category").order("title")
    if (!data?.length) return

    const grouped: Record<string, typeof data> = {}
    for (const e of data) {
      if (!grouped[e.category]) grouped[e.category] = []
      grouped[e.category].push(e)
    }

    const sections = Object.entries(grouped).map(([cat, entries]) => {
      const label   = CATEGORY_LABELS[cat] || cat
      const content = entries.map(e => `### ${e.title}\n${e.content}`).join("\n\n")
      return `## ${label}\n\n${content}`
    }).join("\n\n---\n\n")

    const now  = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
    const note = `# GoHub Creator Knowledge Base\n\n*Cập nhật: ${now}*\n\n${sections}`

    await supabaseAdmin.from("creator_kb").upsert({
      key: "_master_note", category: "_system", title: "Master Note",
      content: note, updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
  } catch { /* non-critical */ }
}

// ─── Sync từ hệ thống (wiki + FX rates) ──────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80)
}

async function syncFromSystem(): Promise<{ ok: boolean; wiki: number; fx: boolean; errors: string[] }> {
  const errors: string[] = []
  let wikiCount = 0
  let fxOk = false

  // 1. Wiki pages từ Supabase kb_wiki_pages
  try {
    const { data: pages } = await supabaseAdmin.from("kb_wiki_pages")
      .select("title, content, page_type, updated_at")
      .order("title")

    if (pages?.length) {
      const upserts = pages.map(p => ({
        key:        `wiki_${slugify(p.title)}`,
        category:   "wiki",
        title:      p.title,
        content:    (p.content || "").slice(0, 8000), // truncate dài quá
        metadata:   { page_type: p.page_type, source: "kb_wiki_pages", synced_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }))

      // Upsert theo batch 20
      for (let i = 0; i < upserts.length; i += 20) {
        const batch = upserts.slice(i, i + 20)
        const { error } = await supabaseAdmin.from("creator_kb").upsert(batch, { onConflict: "key" })
        if (error) errors.push(`Wiki batch ${i}: ${error.message}`)
        else wikiCount += batch.length
      }
    }
  } catch (e: any) {
    errors.push(`Wiki sync error: ${e.message}`)
  }

  // 2. FX rates từ gohub_dw
  try {
    const rows = await queryAnalytics(`
      SELECT DISTINCT ON (currency_code)
        company_code, currency_code, rate, from_date::text as from_date
      FROM exchange_rate
      ORDER BY currency_code, from_date DESC
    `)

    if (rows?.length) {
      const table = "| Công ty | Tiền tệ | Tỷ giá | Ngày hiệu lực |\n|---|---|---|---|\n" +
        rows.map((r: any) => `| ${r.company_code} | ${r.currency_code} | ${r.rate} | ${r.from_date} |`).join("\n")

      const content = `## Tỷ giá hiện tại (gohub_dw)\n\n*Sync lần cuối: ${new Date().toLocaleDateString("vi-VN")}*\n\n${table}\n\n**Nguồn:** Bảng \`exchange_rate\` trong gohub_dw. Tỷ giá theo company_code (VN/SG/HK/US).`

      const { error } = await supabaseAdmin.from("creator_kb").upsert({
        key: "fx_rates_current", category: "exchange_rates",
        title: "Tỷ giá hiện tại (gohub_dw)",
        content, updated_at: new Date().toISOString(),
      }, { onConflict: "key" })

      if (error) errors.push(`FX sync: ${error.message}`)
      else fxOk = true
    }
  } catch (e: any) {
    errors.push(`FX sync error: ${e.message}`)
  }

  // Regenerate master note
  await regenerateMasterNote()

  return { ok: errors.length === 0, wiki: wikiCount, fx: fxOk, errors }
}
