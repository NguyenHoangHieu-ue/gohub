import { supabaseAdmin } from "@/lib/supabase"
import { GEMINI_MODEL, GEMINI_MODEL_PRO } from "@/lib/ai-models"

const KNOWN_KEY = "gemini_known_models"

// Hiếu muốn luôn dùng model Gemini mới nhất nhưng đổi model tự động dễ vỡ (thinkingLevel/format khác nhau) →
// chỉ PHÁT HIỆN model mới (so với lần quét trước, lưu app_settings) và báo để thử rồi đổi env GEMINI_MODEL(_PRO).
export async function detectNewGeminiModels(): Promise<string[]> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": process.env.GEMINI_KEY ?? "" },
  })
  if (!res.ok) throw new Error(`Gemini list models ${res.status}`)
  const body = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const current = (body.models ?? [])
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => m.name.replace(/^models\//, ""))
    .filter(n => /^gemini-/.test(n) && !/(image|tts|transcribe|embedding|customtools)/.test(n))

  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KNOWN_KEY).maybeSingle()
  const known: string[] = data?.value ? JSON.parse(data.value) : []
  await supabaseAdmin.from("app_settings").upsert(
    { key: KNOWN_KEY, value: JSON.stringify(current), category: "ai_model" },
    { onConflict: "key" },
  )
  // Lần đầu (chưa có mốc) chỉ ghi mốc, không báo cả danh sách.
  if (!known.length) return []
  return current.filter(n => !known.includes(n))
}

export function newModelMessage(models: string[]): string {
  return `🆕 Google vừa mở model Gemini mới cho key hệ thống: ${models.join(", ")}\n` +
    `Đang dùng: GEMINI_MODEL=${GEMINI_MODEL}, GEMINI_MODEL_PRO=${GEMINI_MODEL_PRO}.\n` +
    `Muốn nâng cấp: bảo Claude Code thử model mới trên staging rồi đổi env trên Vercel.`
}
