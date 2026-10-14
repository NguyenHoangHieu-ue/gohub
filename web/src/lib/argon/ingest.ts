import { supabaseAdmin } from "@/lib/supabase"
import { countTokens, sourceParts } from "./context"
import { extractFile, guessMime } from "./extract"
import { ARGON_BUCKET, ensureArgonBucket, type ArgonSource } from "./server"

const safe = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-120)

/** Đưa 1 file (đã có bytes, vd đính kèm mail) vào dự án: lưu Storage, trích chữ, đếm token, tạo nguồn + phiên bản 1. */
export async function ingestBuffer(projectId: string, username: string, name: string, mime: string, buf: Buffer, extra: { external_id?: string; meta?: Record<string, unknown> } = {}): Promise<ArgonSource> {
  await ensureArgonBucket()
  const path = `${username}/${projectId}/${crypto.randomUUID()}-${safe(name)}`
  const up = await supabaseAdmin.storage.from(ARGON_BUCKET).upload(path, buf, { contentType: guessMime(name, mime) })
  if (up.error) throw new Error(`Lưu file "${name}" lỗi: ${up.error.message}`)
  const ex = await extractFile(buf, name, mime)
  const { data: src, error } = await supabaseAdmin.from("argon_sources").insert({
    project_id: projectId, kind: "file", name: name.slice(0, 160), mime: ex.mime, size_bytes: buf.length, storage_path: path, extracted_text: ex.text,
    send_binary: ex.sendBinary, content_hash: ex.hash, tokens: 0, external_id: extra.external_id ?? null, meta: extra.meta ?? {},
  }).select("*").single()
  if (error || !src) throw new Error(error?.message ?? "lưu nguồn lỗi")
  const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: Number.MAX_SAFE_INTEGER }, []))
  await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
  await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: ex.text, storage_path: path, note: "Tải lên", author: username })
  return { ...(src as ArgonSource), tokens }
}
