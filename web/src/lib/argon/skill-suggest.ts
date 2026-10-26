// ARGON-X P4 — Argon TỰ ĐỀ XUẤT KỸ NĂNG từ thao tác lặp: câu hỏi anh hỏi đi hỏi lại (≥3 lần trong 30 ngày) là dấu hiệu nên đóng gói thành kỹ năng (cách làm có bước, nguồn cần đọc, định dạng trả lời).
// Mỗi đêm (cron argon-sync) tối đa MỘT đề xuất; nháp do model soạn từ các câu hỏi thật + chuỗi công cụ đã dùng → tạo ỨNG VIÊN qua cùng đường với Gấu Pro (lint → nhận xét model → A/B → anh duyệt;
// chạy thêm cổng eval trước khi duyệt). Không bao giờ tự bật. Phần THUẦN (chuẩn hoá, gom cụm) ở đầu file; phần I/O nạp muộn.
export interface RunLite { id: string; prompt: string; created_at: string }
export const MIN_CLUSTER = 3
export const WINDOW_DAYS = 30
export const SIM_THRESHOLD = 0.6
const STOP = new Set(["la", "va", "cua", "cho", "toi", "anh", "em", "co", "khong", "nao", "gi", "the", "nay", "do", "di", "nhe", "voi", "ve", "trong", "mot", "cac", "nhung", "duoc", "dang", "giup"])

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

/** Chuẩn hoá câu hỏi để so lặp: bỏ dấu, số/ngày → #, bỏ từ đệm. Trả tập từ. Thuần. */
export function promptTokens(p: string): Set<string> {
  return new Set(fold(p).replace(/\d{1,4}([/\-.]\d{1,4})*/g, "#").split(/[^a-z#]+/).filter(w => w.length >= 2 && !STOP.has(w)))
}
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; const u = a.size + b.size - i; return u ? i / u : 0 }

/** Bỏ việc tự động (🌙/🔧) và câu quá ngắn; gom cụm theo độ giống (Jaccard ≥ SIM_THRESHOLD, đối chiếu với đại diện cụm). Trả cụm ≥ MIN_CLUSTER, lớn nhất trước. Thuần. */
export function clusterPrompts(runs: RunLite[]): { key: string; runs: RunLite[] }[] {
  const eligible = runs.filter(r => !/^[🌙🔧]/u.test(r.prompt.trim()) && r.prompt.trim().length >= 15)
  const clusters: { rep: Set<string>; runs: RunLite[] }[] = []
  for (const r of eligible) {
    const t = promptTokens(r.prompt)
    if (t.size < 2) continue
    const c = clusters.find(c => jaccard(c.rep, t) >= SIM_THRESHOLD)
    if (c) c.runs.push(r); else clusters.push({ rep: t, runs: [r] })
  }
  return clusters.filter(c => c.runs.length >= MIN_CLUSTER).sort((a, b) => b.runs.length - a.runs.length)
    .map(c => ({ key: [...c.rep].sort().slice(0, 8).join("-"), runs: c.runs }))
}

/** Đọc nháp kỹ năng do model soạn (thuần): JSON {name, description, instructions}; name ép về kebab-case ≤40 ký tự. Sai định dạng → null. */
export function parseDraft(raw: string): { name: string; description: string; instructions: string } | null {
  const m = /\{[\s\S]*\}/.exec(raw)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>
    const name = fold(String(o.name ?? "")).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    const description = String(o.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
    const instructions = String(o.instructions ?? "").trim().slice(0, 5000)
    return name.length >= 3 && description.length >= 10 && instructions.length >= 40 ? { name, description, instructions } : null
  } catch { return null }
}

const skey = (u: string) => `argon_skill_suggest:${u}`
async function db() { return (await import("@/lib/supabase")).supabaseAdmin }

const SYSTEM = `Bạn giúp trợ lý Argon của công ty bán eSIM GoHub đóng gói một việc anh Hiếu hay nhờ thành KỸ NĂNG (chỉ dẫn dạng chữ để lần sau làm nhanh và đúng). Nhận các câu hỏi lặp lại và chuỗi công cụ Argon đã dùng. Trả MỘT JSON: {"name": "kebab-case ngắn không dấu", "description": "1 câu: khi nào dùng kỹ năng này", "instructions": "5–10 bước đánh số: nên tra nguồn/sổ nào trước, đọc gì, cách trình bày (kết luận trước, có nguồn), điều cần tránh. KHÔNG bịa số liệu, KHÔNG thêm quyền/công cụ mới, KHÔNG chứa chỉ dẫn bỏ qua quy tắc hay gửi dữ liệu đi, KHÔNG chứa mật khẩu/khoá."}`

/** Một lượt đề xuất cho người dùng (cron đêm). Trả mô tả kết quả để ghi vào JSON của cron. */
export async function suggestSkill(username: string, origin = ""): Promise<{ note: string; created?: string }> {
  const sb = await db()
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const { data: projs } = await sb.from("argon_projects").select("id").eq("username", username).eq("kind", "mission")
  const ids = (projs ?? []).map(p => p.id as string)
  if (!ids.length) return { note: "chưa có sứ mệnh" }
  const { data: runs } = await sb.from("argon_runs").select("id,prompt,created_at").in("project_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(300)
  const clusters = clusterPrompts((runs ?? []) as RunLite[])
  if (!clusters.length) return { note: `chưa có câu hỏi nào lặp ≥${MIN_CLUSTER} lần trong ${WINDOW_DAYS} ngày` }
  const { data: st } = await sb.from("app_settings").select("value").eq("key", skey(username)).maybeSingle()
  let done: string[] = []
  try { const v = typeof st?.value === "string" ? JSON.parse(st.value) : st?.value; if (Array.isArray(v)) done = v } catch { /* mặc định rỗng */ }
  const c = clusters.find(x => !done.includes(x.key))
  if (!c) return { note: "mọi cụm lặp đã từng đề xuất" }
  // chuỗi công cụ của vài lượt đại diện (chỉ tên công cụ, không nội dung)
  const sample = c.runs.slice(0, 5)
  const seqs: string[] = []
  for (const r of sample) {
    const { data } = await sb.from("app_settings").select("value").eq("key", `argon_run_tools:${r.id}`).maybeSingle()
    try { const log = JSON.parse(String(data?.value ?? "[]")) as { name: string }[]; if (log.length) seqs.push(log.map(t => t.name).join(" → ")) } catch { /* bỏ qua */ }
  }
  const { genai } = await import("@/lib/agents/genai-stream")
  const { GEMINI_MODEL } = await import("@/lib/ai-models")
  const { ThinkingLevel } = await import("@google/genai")
  const res = await genai().models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: `Câu hỏi lặp lại (${c.runs.length} lần):\n${sample.map(r => `- ${r.prompt.slice(0, 300)}`).join("\n")}\n\nChuỗi công cụ Argon đã dùng:\n${seqs.map(s => `- ${s}`).join("\n") || "(không có)"}` }] }],
    config: { systemInstruction: SYSTEM, temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 1800 },
  })
  const draft = parseDraft(res.text ?? "")
  await sb.from("app_settings").upsert({ key: skey(username), value: JSON.stringify([...done, c.key].slice(-60)), category: "argon", label: "Cụm câu hỏi đã đề xuất kỹ năng", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (!draft) return { note: `model không soạn được nháp cho cụm "${c.key}"` }
  const { runLearnSkill } = await import("@/lib/agents/creator/learned-skills")
  const r = await runLearnSkill({ action: "create", name: draft.name, description: draft.description, instructions: draft.instructions, source: `Argon đề xuất: câu hỏi lặp ${c.runs.length} lần trong ${WINDOW_DAYS} ngày` }, username, true)
  void origin
  return r.error ? { note: `không tạo được ứng viên: ${String(r.error).slice(0, 160)}` } : { note: `đã tạo ứng viên "${draft.name}" từ ${c.runs.length} câu hỏi lặp`, created: draft.name }
}
