// Graph nhẹ của Kho: thực thể (vendor, thị trường, sản phẩm, khách, người) + "được nhắc ở nguồn nào" + quan hệ giữa chúng. Phần THUẦN (không I/O).
import { fold } from "./facts-pure"

export const ENTITY_KINDS = { vendor: "Vendor", market: "Thị trường", product: "Sản phẩm", customer: "Khách hàng", person: "Người", other: "Khác" } as const
export type EntityKind = keyof typeof ENTITY_KINDS
export const MAX_ENTITIES_PER_SOURCE = 10
export const MAX_RELATIONS_PER_SOURCE = 8

export interface EntityIn { kind: EntityKind; name: string; aliases: string[] }
export interface RelationIn { from: string; rel: string; to: string }
export interface EntityRow { id: number; username: string; kind: EntityKind; key: string; name: string; aliases: string[] }

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "")

/** Chuẩn hoá thực thể model trả về: bỏ mục thiếu tên, loại lạ → "other", gộp trùng trong cùng nguồn, tối đa 10. */
export function normalizeEntities(raw: unknown): EntityIn[] {
  if (!Array.isArray(raw)) return []
  const out: EntityIn[] = [], seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const name = clean(o.name, 80)
    if (name.length < 2) continue
    const kind = (clean(o.kind, 20) in ENTITY_KINDS ? clean(o.kind, 20) : "other") as EntityKind
    const key = `${kind}|${fold(name)}`
    if (seen.has(key)) continue
    seen.add(key)
    const aliases = (Array.isArray(o.aliases) ? o.aliases : []).map(a => clean(a, 80)).filter(a => a.length >= 2 && fold(a) !== fold(name)).slice(0, 5)
    out.push({ kind, name, aliases })
    if (out.length >= MAX_ENTITIES_PER_SOURCE) break
  }
  return out
}

/** Quan hệ chỉ giữ khi CẢ HAI đầu khớp một thực thể của chính nguồn đó (tên hoặc bí danh); trả tên chuẩn của thực thể. */
export function normalizeRelations(raw: unknown, entities: EntityIn[]): RelationIn[] {
  if (!Array.isArray(raw)) return []
  const byName = new Map<string, string>()
  for (const e of entities) { byName.set(fold(e.name), e.name); for (const a of e.aliases) byName.set(fold(a), e.name) }
  const out: RelationIn[] = [], seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const from = byName.get(fold(clean(o.from, 80))), to = byName.get(fold(clean(o.to, 80))), rel = clean(o.rel, 40)
    if (!from || !to || !rel || from === to) continue
    const k = `${fold(from)}|${fold(rel)}|${fold(to)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ from, rel, to })
    if (out.length >= MAX_RELATIONS_PER_SOURCE) break
  }
  return out
}

export const entityKey = (name: string) => fold(name)

/** Thực thể đã có cùng loại và trùng tên/bí danh (hai chiều) → id; không có → null. */
export function matchEntity(existing: Pick<EntityRow, "id" | "kind" | "key" | "aliases">[], inc: EntityIn): number | null {
  const names = new Set([entityKey(inc.name), ...inc.aliases.map(entityKey)])
  for (const e of existing) {
    if (e.kind !== inc.kind) continue
    if (names.has(e.key) || e.aliases.some(a => names.has(entityKey(a)))) return e.id
  }
  return null
}

/** Gộp bí danh cũ + mới (không trùng tên chính), tối đa 8. */
export function mergeAliases(name: string, old: string[], add: string[]): string[] {
  const seen = new Set([entityKey(name)]), out: string[] = []
  for (const a of [...old, ...add]) { const k = entityKey(a); if (k && !seen.has(k)) { seen.add(k); out.push(a) } }
  return out.slice(0, 8)
}
