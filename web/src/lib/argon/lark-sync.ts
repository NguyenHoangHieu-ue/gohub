import { supabaseAdmin } from "@/lib/supabase"
import { countTokens, sourceParts } from "./context"
import { sha256 } from "./extract"
import { buildPack } from "./data-packs"
import { listFolder, larkToken, parseLarkUrl, readLark, type LarkContent, type LarkFolderItem } from "./lark"
import type { ArgonSource } from "./server"

const MIME_BY_KIND: Record<LarkContent["kind"], string> = { docx: "text/plain", sheet: "text/csv", base: "text/csv" }
const FOLDER_TYPES = new Set(["docx", "sheet", "bitable"])
export const MAX_FOLDER_FILES = 30

export interface SyncResult { id: string; name: string; status: "changed" | "same" | "skipped" | "error"; note?: string }

/** Tạo nguồn Lark mới (1 link). Trả null nếu dự án đã có tài liệu này. */
export async function addLarkSource(projectId: string, url: string, mode: "snapshot" | "live", content?: LarkContent, extraMeta: Record<string, unknown> = {}): Promise<ArgonSource | null> {
  const c = content ?? (await readLark(url))
  const { data: dup } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", projectId).eq("external_id", c.token).maybeSingle()
  if (dup) return null
  const row = {
    project_id: projectId, kind: "lark" as const, name: c.title.slice(0, 160), mime: MIME_BY_KIND[c.kind], size_bytes: Buffer.byteLength(c.text),
    extracted_text: c.text, send_binary: false, content_hash: sha256(c.text), tokens: 0, external_url: url, external_id: c.token,
    sync_mode: mode, synced_at: new Date().toISOString(), meta: { larkKind: c.kind, ...extraMeta },
  }
  const { data: src, error } = await supabaseAdmin.from("argon_sources").insert(row).select("*").single()
  if (error || !src) throw new Error(error?.message ?? "lưu nguồn Lark lỗi")
  const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: 0 }, []))
  await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
  await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: c.text, note: "Thêm từ Lark", author: "lark" })
  return { ...(src as ArgonSource), tokens }
}

/** Thêm 1 link: tài liệu → 1 nguồn; thư mục → mỗi docx/sheet/Base con 1 nguồn (tối đa MAX_FOLDER_FILES). */
export async function addLarkLink(projectId: string, url: string, mode: "snapshot" | "live"): Promise<{ sources: ArgonSource[]; skipped: string[]; errors: string[] }> {
  const ref = parseLarkUrl(url)
  if (ref.kind === "unknown") throw new Error("Không nhận ra link Lark (cần docx / sheets / wiki / base / folder)")
  const out = { sources: [] as ArgonSource[], skipped: [] as string[], errors: [] as string[] }
  if (ref.kind !== "folder") {
    const s = await addLarkSource(projectId, url, mode)
    if (s) out.sources.push(s); else out.skipped.push(`${url} — đã có trong dự án`)
    return out
  }
  const token = await larkToken()
  const items: LarkFolderItem[] = (await listFolder(token, ref.token)).filter(f => FOLDER_TYPES.has(f.type))
  if (!items.length) throw new Error("Thư mục không có docx / sheet / Base nào (thư mục con chưa được đọc — thêm từng thư mục con)")
  for (const f of items.slice(0, MAX_FOLDER_FILES)) {
    try {
      const fUrl = f.url ?? `https://larksuite.com/${f.type === "docx" ? "docx" : f.type === "sheet" ? "sheets" : "base"}/${f.token}`
      const content = await readLark(fUrl, token)
      const s = await addLarkSource(projectId, fUrl, mode, content, { folderToken: ref.token })
      if (s) out.sources.push(s); else out.skipped.push(`${f.name} — đã có`)
    } catch (e) { out.errors.push(`${f.name}: ${(e as Error).message}`) }
  }
  if (items.length > MAX_FOLDER_FILES) out.skipped.push(`Còn ${items.length - MAX_FOLDER_FILES} file chưa thêm (giới hạn ${MAX_FOLDER_FILES}/lần)`)
  return out
}

/** Đồng bộ 1 nguồn Lark: đọc lại, chỉ tạo phiên bản mới khi nội dung đổi (so hash). Nguồn đã sửa tay thì bỏ qua để không ghi đè. */
export async function syncLarkSource(src: ArgonSource, token?: string): Promise<SyncResult> {
  const base = { id: src.id, name: src.name }
  if (src.kind !== "lark" || !src.external_url) return { ...base, status: "skipped", note: "không phải nguồn Lark" }
  if (src.meta?.edited) return { ...base, status: "skipped", note: "đã sửa tay — không ghi đè (khôi phục bản Lark nếu muốn đồng bộ lại)" }
  try {
    const c = await readLark(src.external_url, token)
    const hash = sha256(c.text)
    const now = new Date().toISOString()
    if (hash === src.content_hash) {
      await supabaseAdmin.from("argon_sources").update({ synced_at: now }).eq("id", src.id)
      return { ...base, status: "same" }
    }
    const version = src.version + 1
    const tokens = await countTokens(await sourceParts({ ...src, extracted_text: c.text }, { left: 0 }, []))
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version, extracted_text: c.text, note: "Đồng bộ Lark", author: "lark" })
    await supabaseAdmin.from("argon_sources").update({
      extracted_text: c.text, content_hash: hash, version, tokens, size_bytes: Buffer.byteLength(c.text), synced_at: now, updated_at: now, name: c.title.slice(0, 160),
    }).eq("id", src.id)
    return { ...base, status: "changed", note: `v${version}` }
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message }
  }
}

// ── Gói dữ liệu (số liệu hệ thống mới nhất, lấy từ endpoint analytics — xem data-packs.ts) ──
export const isDataPack = (s: Pick<ArgonSource, "external_id">) => !!s.external_id?.startsWith("datapack:")
export const isSyncable = (s: Pick<ArgonSource, "kind" | "external_id">) => s.kind === "lark" || isDataPack(s)

export async function addDataPack(projectId: string, pack: string, quarter: string, mode: "snapshot" | "live", origin: string): Promise<ArgonSource | null> {
  const extId = `datapack:${pack}:${quarter}`
  const { data: dup } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", projectId).eq("external_id", extId).maybeSingle()
  if (dup) return null
  const c = await buildPack(pack, quarter, origin)
  const row = {
    project_id: projectId, kind: "note" as const, name: c.title.slice(0, 160), mime: "text/markdown", size_bytes: Buffer.byteLength(c.text), extracted_text: c.text, send_binary: false,
    content_hash: sha256(c.text), tokens: 0, external_id: extId, sync_mode: mode, synced_at: new Date().toISOString(), meta: { dataPack: pack, quarter },
  }
  const { data: src, error } = await supabaseAdmin.from("argon_sources").insert(row).select("*").single()
  if (error || !src) throw new Error(error?.message ?? "lưu gói dữ liệu lỗi")
  const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: 0 }, []))
  await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
  await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: c.text, note: "Lấy số liệu hệ thống", author: "datapack" })
  return { ...(src as ArgonSource), tokens }
}

/** Lấy lại số liệu của 1 gói: chỉ tạo phiên bản mới khi nội dung đổi — mỗi lần chạy có dòng "Lấy lúc …" nên so hash PHẦN SAU dòng đầu. */
export async function syncDataSource(src: ArgonSource, origin: string): Promise<SyncResult> {
  const base = { id: src.id, name: src.name }
  const pack = String(src.meta?.dataPack ?? ""), quarter = String(src.meta?.quarter ?? "")
  if (!pack || !quarter) return { ...base, status: "skipped", note: "thiếu thông tin gói" }
  try {
    const c = await buildPack(pack, quarter, origin)
    const body = (t: string) => t.slice(t.indexOf("\n"))
    const now = new Date().toISOString()
    if (sha256(body(c.text)) === sha256(body(src.extracted_text ?? ""))) {
      await supabaseAdmin.from("argon_sources").update({ synced_at: now, extracted_text: c.text }).eq("id", src.id)
      return { ...base, status: "same" }
    }
    const version = src.version + 1
    const tokens = await countTokens(await sourceParts({ ...src, extracted_text: c.text }, { left: 0 }, []))
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version, extracted_text: c.text, note: "Số liệu thay đổi", author: "datapack" })
    await supabaseAdmin.from("argon_sources").update({ extracted_text: c.text, content_hash: sha256(c.text), version, tokens, size_bytes: Buffer.byteLength(c.text), synced_at: now, updated_at: now, name: c.title.slice(0, 160) }).eq("id", src.id)
    return { ...base, status: "changed", note: `v${version}` }
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message }
  }
}

/** Đồng bộ 1 nguồn (Lark hoặc gói dữ liệu). */
export async function syncSource(src: ArgonSource, origin: string, token?: string): Promise<SyncResult> {
  return isDataPack(src) ? syncDataSource(src, origin) : syncLarkSource(src, token)
}

/** Đồng bộ nhiều nguồn (giới hạn song song 3 để không dính giới hạn tốc độ của Lark/endpoint). Token Lark chỉ lấy khi có nguồn Lark. */
export async function syncMany(sources: ArgonSource[], origin: string): Promise<SyncResult[]> {
  if (!sources.length) return []
  let token: string | undefined
  let tokenErr: string | undefined
  if (sources.some(s => s.kind === "lark")) { try { token = await larkToken() } catch (e) { tokenErr = (e as Error).message } }
  const out: SyncResult[] = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (i < sources.length) {
      const s = sources[i++]
      out.push(s.kind === "lark" && !token ? { id: s.id, name: s.name, status: "error", note: tokenErr } : await syncSource(s, origin, token))
    }
  }))
  return out
}
