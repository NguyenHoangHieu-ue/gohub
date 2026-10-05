import { supabaseAdmin } from "@/lib/supabase"
import { genai } from "@/lib/agents/genai-stream"

// Gấu Pro "nhớ" KB (s223 QA trí nhớ). Trước: KB 79 mục/~219k ký tự nhưng mỗi hội thoại chỉ nạp 8.000 ký tự ĐẦU (≈3,6%) ở lượt đầu,
// xếp theo category nên mục vendors/notes mới lưu gần như không bao giờ được thấy; embedding dùng `text-embedding-004` đã bị Google
// gỡ (404) → 0/79 mục có embedding, searchKnowledgeBase luôn lỗi. Nay: MỖI lượt nạp danh mục tiêu đề toàn KB + nguyên văn các mục
// liên quan nhất (tìm theo ý nghĩa).

// gemini-embedding-001 cắt còn 768 chiều (MRL) để khớp cột creator_kb.embedding vector(768) + index HNSW của v33 — không cần migration.
const EMBED_MODEL = "gemini-embedding-001"
const EMBED_DIM = 768

export async function embedKb(texts: string[]): Promise<number[][]> {
  const r = await genai().models.embedContent({
    model: EMBED_MODEL,
    contents: texts.map(t => t.slice(0, 8000)),
    config: { outputDimensionality: EMBED_DIM },
  })
  return (r.embeddings ?? []).map(e => e.values ?? [])
}

export async function embedKbOne(text: string): Promise<number[] | null> {
  try { return (await embedKb([text]))[0] ?? null } catch (e) {
    console.error("[kb-recall] embed lỗi:", (e as Error).message)
    return null
  }
}

let _index: { text: string; at: number } | null = null
/** Danh mục tiêu đề toàn KB (cache 5 phút) — model biết KB có gì để đọc đúng mục bằng readKnowledgeBase(keys). */
export async function kbIndexBlock(): Promise<string> {
  if (!_index || Date.now() - _index.at > 5 * 60_000) {
    const { data } = await supabaseAdmin.from("creator_kb").select("key,category,title")
      .neq("category", "_system").order("category").order("title")
    const lines = (data ?? []).map(r => `- [${r.category}] ${r.title} (key: ${r.key})`)
    _index = { text: lines.join("\n"), at: Date.now() }
  }
  return _index.text ? `\n\n━━━ DANH MỤC KB (tiêu đề — đọc nội dung bằng readKnowledgeBase(keys=[...]) khi cần) ━━━\n${_index.text}` : ""
}
export function invalidateKbIndex() { _index = null }

/** Nguyên văn các mục KB liên quan nhất tới câu hỏi (tìm theo ý nghĩa). "" khi không có gì đủ gần. */
export async function relevantKbBlock(query: string): Promise<string> {
  const q = query.trim()
  if (q.length < 4) return ""
  const emb = await embedKbOne(q)
  if (!emb) return ""
  const { data, error } = await supabaseAdmin.rpc("search_creator_kb", { query_embedding: `[${emb.join(",")}]`, match_count: 6 })
  if (error) { console.error("[kb-recall] search:", error.message); return "" }
  const all = (data ?? []) as { key: string; category: string; title: string; content: string; similarity: number }[]
  // Giữ mục đủ gần VÀ không kém mục tốt nhất quá 0,15 (đo: câu hỏi top-up 3HK → đúng mục 0,76; mục không liên quan 0,51–0,58).
  const top = all[0]?.similarity ?? 0
  const rows = all.filter(r => r.similarity >= 0.55 && r.similarity >= top - 0.15)
  if (!rows.length) return ""
  let used = 0
  const parts: string[] = []
  for (const r of rows) {
    const body = String(r.content ?? "").slice(0, 3000)
    if (used + body.length > 12_000) break
    used += body.length
    parts.push(`### [${r.category}] ${r.title} (key: ${r.key})\n${body}`)
  }
  return `\n\n━━━ KB LIÊN QUAN TỚI CÂU HỎI (tự tra mỗi lượt — NGUỒN SỰ THẬT, ưu tiên hơn kiến thức chung) ━━━\n${parts.join("\n\n")}`
}

/** Tạo embedding cho mục KB còn thiếu (chạy 1 lần sau khi đổi model, hoặc định kỳ). Trả số mục đã làm. */
export async function reembedMissing(limit = 200): Promise<{ done: number; failed: number }> {
  const { data } = await supabaseAdmin.from("creator_kb").select("key,title,content")
    .neq("category", "_system").is("embedding", null).limit(limit)
  let done = 0, failed = 0
  const rows = data ?? []
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    let embs: number[][] = []
    try { embs = await embedKb(batch.map(r => `${r.title} ${r.content}`)) } catch { failed += batch.length; continue }
    // Ghi từng dòng (update 1 cột) — backfill 1 lần; upsert hàng loạt thiếu cột NOT NULL sẽ lỗi ở nhánh insert.
    for (let k = 0; k < batch.length; k++) {
      if (!embs[k]?.length) { failed++; continue }
      const { error } = await supabaseAdmin.from("creator_kb").update({ embedding: `[${embs[k].join(",")}]` }).eq("key", batch[k].key)
      if (error) failed++; else done++
    }
  }
  return { done, failed }
}
