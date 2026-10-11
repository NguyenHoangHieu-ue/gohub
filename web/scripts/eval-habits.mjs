// H2 — đo A/B: khối "THÓI QUEN QUAN SÁT" có làm câu trả lời hợp người dùng hơn mà không kém đúng/đủ, không lộ liễu "em theo dõi anh" không?
//   node scripts/eval-habits.mjs --base https://stg-intel-v2.gohub.cloud --label h2 [--user eval-habit] [--concurrency 3] [--only short,table] [--judge-model gemini-pro-latest]
// Mỗi profile thói quen: arm A (không có khối thói quen) vs arm B (có các dòng thói quen như job ban đêm đã ghi, source auto-habit:*).
// Cùng bộ câu hỏi trung tính (không nêu yêu cầu về cách trả lời). Chấm: (1) số đo tất định (độ dài, có bảng, từ lộ liễu), (2) giám khảo so cặp
// MÙ (đảo thứ tự ngẫu nhiên): câu nào hợp thói quen hơn, mỗi câu có đủ ý không, có nhắc lộ liễu thói quen không.
// Cần web/.env.local: CRON_SECRET, GEMINI_KEY. User thử phải dạng eval-xxx (route /api/admin/eval/memory).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")] }))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const base = arg("base", "https://stg-intel-v2.gohub.cloud")
const user = arg("user", "eval-habit")
const CONC = Number(arg("concurrency", 3))
const JUDGE_MODEL = arg("judge-model", "gemini-pro-latest")
const only = arg("only") ? new Set(arg("only").split(",")) : null
const OUT = path.join(ROOT, "eval/results"); fs.mkdirSync(OUT, { recursive: true })

const PROFILES = {
  short: { desc: "hay yêu cầu trả lời ngắn gọn", lines: ["Hay yêu cầu trả lời ngắn gọn/tóm tắt (quan sát 28 lần).", "Hay nhắn ngắn gọn, ít chi tiết (quan sát 40 tin)."] },
  table: { desc: "hay yêu cầu trình bày dạng bảng", lines: ["Hay yêu cầu trình bày dạng bảng (quan sát 12 lần).", "Hay 👍 câu trả lời có bảng (quan sát 6 lần)."] },
  control: { desc: "thói quen KHÔNG liên quan tới cách trả lời (đối chứng — không được làm đổi câu trả lời)", lines: ['Hay nhắc tới "zephyr" (quan sát 9 lần).', "Thường nhắn vào buổi chiều (quan sát 120 tin)."] },
}
const QUESTIONS = [
  "Giải thích cấu trúc mã SKU của GoHub.",
  "Thứ tự ưu tiên chọn vendor khi bán một gói eSIM mới là gì?",
  "Gói Fixed và gói Daily khác nhau thế nào?",
  "Combo chuẩn của GoHub gồm những gì?",
  "Gói Unlimited của BC Datapool có những mức tốc độ nào?",
  "Quy trình import danh mục nhà cung cấp WorldMove gồm những bước nào?",
  "Giá vốn của 3HK được tính theo cách nào?",
  "Vì sao gói Nhật hay dùng KDDI?",
  "Mã Item khác mã SKU ở điểm nào?",
  "Làm sao biết một SKU đang còn bán hay đã ngừng?",
]
const CREEPY_RE = /(theo dõi|quan sát được|em thấy anh hay|thói quen của anh|anh hay (yêu cầu|nhắn|xin|gõ)|dựa trên thói quen|hồ sơ của anh)/i

async function call(body, retries = 2) {
  for (let a = 0; ; a++) {
    const res = await fetch(`${base}/api/admin/eval/memory`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ user, ...body }) })
    const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    if (res.ok && !d.error) return d
    if (a >= retries) throw new Error(d.error || `HTTP ${res.status}`)
    await new Promise(r => setTimeout(r, 4000))
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}
async function runArm(lines) {
  await call({ action: "reset" })
  if (lines.length) await call({ action: "setHabits", lines })
  const dump = await call({ action: "dump" })
  const rows = await pool(QUESTIONS, CONC, async q => {
    try { const r = await call({ action: "ask", question: q }, 1); return { q, a: String(r.text ?? ""), tokensIn: r.tokensIn, ms: r.ms } }
    catch (e) { return { q, a: "", error: e.message } }
  })
  return { rows, blockChars: dump.memoryBlockChars }
}

const stat = a => ({ chars: a.length, hasTable: /\n\s*\|.+\|/.test(a) || /^\s*\|.+\|/m.test(a), bullets: (a.match(/^\s*[-*•]\s/gm) ?? []).length, creepy: CREEPY_RE.test(a) })

async function judgePair(q, desc, X, Y) {
  const prompt = `Bạn chấm 2 câu trả lời (X và Y) của một trợ lý cho CÙNG câu hỏi. Người hỏi có thói quen: ${desc}. Người hỏi KHÔNG nói gì về cách trả lời trong câu hỏi.
Câu hỏi: ${q}
Câu trả lời X:
"""${X.slice(0, 3500)}"""
Câu trả lời Y:
"""${Y.slice(0, 3500)}"""
Trả JSON:
- fits: "X" | "Y" | "tie" — câu nào hợp thói quen của người hỏi hơn (không xét độ dài đơn thuần: phải vẫn đúng và đủ ý chính); "tie" nếu không khác biệt đáng kể.
- x_complete, y_complete: 1 nếu câu trả lời vẫn nêu đủ ý chính cần thiết cho câu hỏi (không bỏ sót ý quan trọng), 0 nếu thiếu ý quan trọng.
- x_mentions_habit, y_mentions_habit: 1 nếu câu trả lời NÊU RÕ là đã biết/quan sát thói quen của người hỏi (vd "em thấy anh hay yêu cầu ngắn gọn"), 0 nếu không.
- note: lý do ngắn.`
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json",
    responseSchema: { type: "OBJECT", properties: { fits: { type: "STRING" }, x_complete: { type: "INTEGER" }, y_complete: { type: "INTEGER" }, x_mentions_habit: { type: "INTEGER" }, y_mentions_habit: { type: "INTEGER" }, note: { type: "STRING" } }, required: ["fits", "x_complete", "y_complete", "x_mentions_habit", "y_mentions_habit", "note"] } } }
  for (let a = 0; a < 3; a++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    try { return JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "") } catch { await new Promise(r => setTimeout(r, 3000)) }
  }
  return null
}

const label = `habits-${arg("label", new Date().toISOString().slice(0, 16).replace(/[:T]/g, ""))}`
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const pct = x => `${(x * 100).toFixed(0)}%`
console.log(`H2 A/B thói quen — ${base} · user ${user}`)
const armA = await runArm([])
console.log(`Arm A (không thói quen): ${armA.rows.filter(r => !r.error).length}/${QUESTIONS.length} câu OK, khối prompt ${armA.blockChars} ký tự`)

const report = []
const all = {}
for (const [name, prof] of Object.entries(PROFILES)) {
  if (only && !only.has(name)) continue
  const armB = await runArm(prof.lines)
  console.log(`Arm B [${name}]: ${armB.rows.filter(r => !r.error).length}/${QUESTIONS.length} câu OK, khối prompt ${armB.blockChars} ký tự`)
  const pairs = await pool(QUESTIONS.map((q, i) => ({ q, A: armA.rows[i], B: armB.rows[i] })).filter(p => !p.A.error && !p.B.error), CONC, async p => {
    const flip = Math.random() < 0.5                    // đảo thứ tự để giám khảo không thiên vị vị trí
    const X = flip ? p.B.a : p.A.a, Y = flip ? p.A.a : p.B.a
    const j = await judgePair(p.q, prof.desc, X, Y)
    if (!j) return { q: p.q, error: "giám khảo lỗi" }
    const bWins = j.fits === "tie" ? "tie" : ((j.fits === "X") === flip ? "B" : "A")
    return { q: p.q, bWins, aComplete: flip ? j.y_complete : j.x_complete, bComplete: flip ? j.x_complete : j.y_complete,
      aMentions: flip ? j.y_mentions_habit : j.x_mentions_habit, bMentions: flip ? j.x_mentions_habit : j.y_mentions_habit, note: j.note, sA: stat(p.A.a), sB: stat(p.B.a) }
  })
  const ok = pairs.filter(p => !p.error)
  const m = {
    n: ok.length, bWin: ok.filter(p => p.bWins === "B").length, aWin: ok.filter(p => p.bWins === "A").length, tie: ok.filter(p => p.bWins === "tie").length,
    lenRatio: avg(ok.map(p => p.sB.chars)) / Math.max(1, avg(ok.map(p => p.sA.chars))),
    tableA: avg(ok.map(p => p.sA.hasTable ? 1 : 0)), tableB: avg(ok.map(p => p.sB.hasTable ? 1 : 0)),
    completeA: avg(ok.map(p => p.aComplete)), completeB: avg(ok.map(p => p.bComplete)),
    mentionB: avg(ok.map(p => p.bMentions)), creepyB: avg(ok.map(p => p.sB.creepy ? 1 : 0)), creepyA: avg(ok.map(p => p.sA.creepy ? 1 : 0)),
  }
  all[name] = { prof, m, pairs: ok, armBBlock: armB.blockChars }
  report.push(`## Profile \`${name}\` — ${prof.desc}`, "", `Dòng thói quen nạp: ${prof.lines.map(l => `"${l}"`).join(" · ")}`, "",
    `| Chỉ số | A (không) | B (có thói quen) |`, "|---|---|---|",
    `| Giám khảo chọn hợp thói quen hơn (${m.n} câu) | ${m.aWin} | **${m.bWin}** (hoà ${m.tie}) |`,
    `| Độ dài TB (B/A) | 100% | ${pct(m.lenRatio)} |`,
    `| Có bảng | ${pct(m.tableA)} | ${pct(m.tableB)} |`,
    `| Đủ ý chính | ${pct(m.completeA)} | ${pct(m.completeB)} |`,
    `| Nhắc lộ liễu thói quen (giám khảo) | — | ${pct(m.mentionB)} |`,
    `| Từ lộ liễu (regex "theo dõi/quan sát…") | ${pct(m.creepyA)} | ${pct(m.creepyB)} |`, "")
}
const md = [`# H2 — A/B khối thói quen quan sát — ${label}`, "", `Giám khảo: ${JUDGE_MODEL} (so cặp mù, đảo thứ tự) · ${QUESTIONS.length} câu trung tính × ${Object.keys(all).length} profile · đường Gấu Pro (cùng khối buildMemoryBlock với Bé Gấu) · user ${user}`, "", ...report].join("\n")
fs.writeFileSync(path.join(OUT, `${label}.md`), md); fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify({ label, armA, all }, null, 1))
console.log("\n" + md)
await call({ action: "reset" })
