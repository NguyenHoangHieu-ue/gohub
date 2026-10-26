import { listFacts, fold, factLine, type FactRow } from "@/lib/argon/facts"
import { listEntities, type EntityListItem } from "@/lib/argon/graph"
import { searchChunks } from "@/lib/argon/index-db"
import { khoSources } from "@/lib/argon/kho"
import { listMailThreads } from "@/lib/argon/mail-status"
import { threadLine, type MailThreadRow } from "@/lib/argon/mail-status-pure"
import { matchesAll } from "./route-pure"

// "Tìm" của ô Hỏi/Tìm: một câu → các nơi liên quan, KHÔNG gọi model trả lời (chỉ nhúng câu hỏi để tìm theo ý nghĩa) nên nhanh và rẻ.
export interface SearchResult {
  chunks: { sourceId: string; sourceName: string; text: string }[]
  entities: Pick<EntityListItem, "id" | "kind" | "name" | "mentions">[]
  facts: { id: string; line: string; needsReview: boolean }[]
  threads: { id: string; status: MailThreadRow["status"]; line: string }[]
}

export async function searchAssistant(username: string, q: string): Promise<SearchResult> {
  const query = q.trim().slice(0, 300)
  const [sources, entities, facts, threads] = await Promise.all([khoSources(username, { onlyEnabled: true }), listEntities(username, 400), listFacts(username, { status: ["active"], limit: 1000 }), listMailThreads(username)])
  const name = new Map(sources.map(s => [s.id, s.name]))
  // Một tài liệu lớn (vd Sổ tay) dễ chiếm hết kết quả → lấy nhiều rồi chỉ giữ tối đa 2 đoạn mỗi nguồn để thấy được nhiều nguồn khác nhau.
  const perSource = new Map<string, number>()
  const hits = (await searchChunks(sources.map(s => s.id), query, 24).catch(() => [])).filter(h => { const n = (perSource.get(h.source_id) ?? 0) + 1; perSource.set(h.source_id, n); return n <= 2 }).slice(0, 8)
  return {
    chunks: hits.map(h => ({ sourceId: h.source_id, sourceName: name.get(h.source_id) ?? "(nguồn)", text: h.text.replace(/\s+/g, " ").slice(0, 320) })),
    entities: entities.filter(e => matchesAll(query, `${e.name} ${e.aliases.join(" ")}`) || fold(query).includes(fold(e.name))).slice(0, 6).map(e => ({ id: e.id, kind: e.kind, name: e.name, mentions: e.mentions })),
    facts: facts.filter((f: FactRow) => matchesAll(query, `${f.vendor} ${f.subject} ${f.summary}`)).slice(0, 8).map(f => ({ id: f.id, line: factLine(f), needsReview: f.needs_review })),
    threads: threads.filter(t => t.status !== "ignored" && matchesAll(query, `${t.subject} ${t.counterparty} ${t.summary}`)).slice(0, 6).map(t => ({ id: t.id, status: t.status, line: threadLine(t) })),
  }
}
