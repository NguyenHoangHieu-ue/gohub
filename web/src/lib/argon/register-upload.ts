import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET, type ArgonSource } from "./server"
import { extractFile } from "./extract"
import { countTokens, sourceParts } from "./context"

export interface UploadItem { path: string; name: string; mime: string; size: number }

/** File đã nằm trên Storage → đọc, trích chữ, đếm token, tạo nguồn + phiên bản 1. Các file chạy song song; file lỗi vào `errors`, không làm hỏng file khác. */
export async function registerUploads(projectId: string, username: string, items: UploadItem[]): Promise<{ sources: ArgonSource[]; errors: string[] }> {
  const sources: ArgonSource[] = [], errors: string[] = []
  await Promise.all(items.slice(0, 20).map(async it => {
    try {
      if (!it.path.startsWith(`${username}/${projectId}/`)) throw new Error("đường dẫn không hợp lệ")
      const { data: blob, error } = await supabaseAdmin.storage.from(ARGON_BUCKET).download(it.path)
      if (error || !blob) throw new Error(`không đọc được file đã tải (${error?.message})`)
      const buf = Buffer.from(await blob.arrayBuffer())
      const ex = await extractFile(buf, it.name, it.mime)
      const { data: src, error: e2 } = await supabaseAdmin.from("argon_sources").insert({
        project_id: projectId, kind: "file", name: it.name, mime: ex.mime, size_bytes: buf.length, storage_path: it.path,
        extracted_text: ex.text, send_binary: ex.sendBinary, content_hash: ex.hash, tokens: 0,
      }).select("*").single()
      if (e2 || !src) throw new Error(e2?.message ?? "lưu nguồn lỗi")
      const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: Number.MAX_SAFE_INTEGER }, []))
      await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
      await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: ex.text, storage_path: it.path, note: "Tải lên", author: username })
      sources.push({ ...(src as ArgonSource), tokens })
    } catch (e) {
      errors.push(`${it.name}: ${(e as Error).message}`)
    }
  }))
  await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId)
  return { sources, errors }
}
