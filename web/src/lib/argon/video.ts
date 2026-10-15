import { supabaseAdmin } from "@/lib/supabase"
import { countTokens, sourceParts } from "./context"
import type { ArgonSource } from "./server"
import { youtubeId } from "./video-url"

// Video YouTube công khai làm nguồn: Gemini xem video trực tiếp qua fileData.fileUri (hình + tiếng). Không tải file về, nên không giới hạn dung lượng;
// video riêng tư/giới hạn tuổi sẽ lỗi lúc đếm token. (Video tải lên + ghi âm họp đã hỗ trợ sẵn qua tải file; biên bản Lark Minutes qua link /minutes/.)
/** Thêm 1 video YouTube. Trả null nếu dự án đã có video này. */
export async function addYoutubeSource(projectId: string, url: string): Promise<ArgonSource | null> {
  const vid = youtubeId(url)
  if (!vid) throw new Error("Không nhận ra link YouTube")
  const clean = `https://www.youtube.com/watch?v=${vid}`
  const extId = `yt:${vid}`
  const { data: dup } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", projectId).eq("external_id", extId).maybeSingle()
  if (dup) return null
  let title = `Video YouTube ${vid}`
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(clean)}&format=json`, { signal: AbortSignal.timeout(8000) })
    if (r.ok) title = String(((await r.json()) as { title?: string }).title ?? title)
  } catch { /* không lấy được tiêu đề thì dùng mã video */ }
  const text = `Video YouTube: ${title}\n${clean}`
  const { data: src, error } = await supabaseAdmin.from("argon_sources").insert({
    project_id: projectId, kind: "note", name: `🎬 ${title}`.slice(0, 160), mime: "video/youtube", size_bytes: 0, extracted_text: text, send_binary: false,
    content_hash: vid, tokens: 0, external_url: clean, external_id: extId, meta: { youtubeUrl: clean },
  }).select("*").single()
  if (error || !src) throw new Error(error?.message ?? "lưu nguồn video lỗi")
  let tokens: number
  try {
    const parts = await sourceParts(src as ArgonSource, { left: 0 }, [])
    tokens = await countTokens(parts)
  } catch (e) {
    await supabaseAdmin.from("argon_sources").delete().eq("id", src.id)
    throw new Error(`Gemini không đọc được video này (riêng tư / giới hạn tuổi / quá dài?): ${(e as Error).message}`)
  }
  await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
  await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Thêm video YouTube", author: "video" })
  return { ...(src as ArgonSource), tokens }
}
