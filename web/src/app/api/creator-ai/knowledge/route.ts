import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"

// Creator-only CRUD for creator_kb table

async function guard(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "creator") return null
  return session
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: "Creator only" }, { status: 403 })

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
