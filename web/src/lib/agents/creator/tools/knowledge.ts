import { supabaseAdmin } from "@/lib/supabase"

const CATEGORY_LABELS: Record<string, string> = {
  product_codes:  "Mã Sản Phẩm & Cấu Trúc",
  sku_rules:      "Quy Tắc SKU",
  exchange_rates: "Tỷ Giá",
  cogs:           "COGS & Giá Vốn",
  vendors:        "Nhà Cung Cấp",
  processes:      "Quy Trình",
  notes:          "Ghi Chú Khác",
}

export async function runReadKnowledgeBase(category?: string): Promise<any> {
  try {
    let q = supabaseAdmin.from("creator_kb").select("key,category,title,content,updated_at")
      .neq("category", "_system")
      .order("category").order("updated_at", { ascending: false })
    if (category) q = q.eq("category", category)
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data?.length) return { message: "Knowledge base is empty. No entries found.", entries: [] }
    return { entries: data, count: data.length }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function runWriteKnowledgeBase(args: {
  entries: { key: string; category: string; title: string; content: string }[]
  wiki_page_title?: string
  wiki_content?: string
}): Promise<any> {
  const results: string[] = []

  for (const entry of args.entries) {
    const { error } = await supabaseAdmin.from("creator_kb").upsert(
      { ...entry, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    if (error) results.push(`ERROR upsert ${entry.key}: ${error.message}`)
    else results.push(`OK: creator_kb["${entry.key}"] updated`)
  }

  try {
    const { data: all } = await supabaseAdmin.from("creator_kb")
      .select("*").neq("category", "_system").order("category").order("title")
    if (all?.length) {
      const grouped: Record<string, typeof all> = {}
      for (const e of all) { if (!grouped[e.category]) grouped[e.category] = []; grouped[e.category].push(e) }
      const sections = Object.entries(grouped).map(([cat, entries]) => {
        const label   = CATEGORY_LABELS[cat] || cat
        const content = entries.map((e: any) => `### ${e.title}\n${e.content}`).join("\n\n")
        return `## ${label}\n\n${content}`
      }).join("\n\n---\n\n")
      const now  = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
      const note = `# GoHub Creator Knowledge Base\n\n*Cập nhật: ${now}*\n\n${sections}`
      await supabaseAdmin.from("creator_kb").upsert(
        { key: "_master_note", category: "_system", title: "Master Note", content: note, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
      results.push("OK: master note regenerated")
    }
  } catch (e: any) {
    results.push(`WARN: master note regeneration failed — ${e.message}`)
  }

  if (args.wiki_page_title && args.wiki_content) {
    try {
      const { data: existing } = await supabaseAdmin.from("kb_wiki_pages")
        .select("id").eq("title", args.wiki_page_title).maybeSingle()
      if (existing?.id) {
        await supabaseAdmin.from("kb_wiki_pages")
          .update({ content: args.wiki_content, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
        results.push(`OK: wiki "${args.wiki_page_title}" updated`)
      } else {
        results.push(`WARN: wiki page "${args.wiki_page_title}" not found — skipped`)
      }
    } catch (e: any) {
      results.push(`WARN: wiki update failed — ${e.message}`)
    }
  }

  return { results, summary: `Updated ${args.entries.length} KB entry(ies) + master note.` }
}

export async function runReviewPendingLearning(limit = 20): Promise<any> {
  const { data, error } = await supabaseAdmin
    .from("chatbot_learning_log")
    .select("id,user_name,user_role,message_content,detected_info,learning_type,severity,existing_kb_key,conflict_detail,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit)
  return error ? { error: error.message } : { records: data || [], total: data?.length || 0 }
}

export async function runApproveLearning(a: any): Promise<any> {
  try {
    const kbUpsert  = await supabaseAdmin.from("creator_kb").upsert({ key: a.kb_key, category: a.kb_category, title: a.kb_title, content: a.kb_content, updated_at: new Date().toISOString() })
    const logUpdate = await supabaseAdmin.from("chatbot_learning_log").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: "creator" }).eq("id", a.id)
    return { ok: !kbUpsert.error && !logUpdate.error, kb_key: a.kb_key }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function runRejectLearning(a: any): Promise<any> {
  const { error } = await supabaseAdmin.from("chatbot_learning_log")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: "creator", conflict_detail: a.reason || null })
    .eq("id", a.id)
  return { ok: !error }
}
