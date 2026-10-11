// H2b — đo phần GỢI Ý CHỦ ĐỘNG từ thói quen quan sát: khi người dùng có thói quen "hay hỏi X vào Thứ Hai / hay nhắc tới Y", bot có gợi ý nhẹ đúng chỗ,
// không gợi ý bậy khi câu hỏi không liên quan, không nói kiểu theo dõi, không khẳng định như sự thật, không lấn át câu trả lời không?
//   node scripts/eval-suggest.mjs --base https://stg-intel-v2.gohub.cloud --label s1 --user eval-s1 [--concurrency 2] [--judge-model gemini-pro-latest]
// Arm A: không có thói quen; Arm B: có các dòng thói quen (như job ban đêm ghi). Mỗi câu trả lời chấm ĐỘC LẬP bởi giám khảo (không cho biết arm nào).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")] }))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const base = arg("base", "https://stg-intel-v2.gohub.cloud")
const user = arg("user", "eval-s1")
const CONC = Number(arg("concurrency", 2))
const JUDGE_MODEL = arg("judge-model", "gemini-pro-latest")
const OUT = path.join(ROOT, "eval/results"); fs.mkdirSync(OUT, { recursive: true })

const HABITS = ['Hay hỏi về "doanh thu B2B" vào Thứ Hai (quan sát 8 lần).', 'Hay nhắc tới "cmhk" (quan sát 12 lần).']
const HABIT_DESC = 'Người dùng hay hỏi về "doanh thu B2B" vào Thứ Hai và hay nhắc tới vendor "cmhk".'
const QUESTIONS = [
  { q: "Doanh thu B2B nên theo dõi những chỉ số nào là chính?", related: true },
  { q: "CMHK là vendor kiểu gì và gói của họ khác 3HK ở điểm nào?", related: true },
  { q: "Báo cáo tình hình khách B2B thường gồm những phần nào?", related: true },
  { q: "Khi so giá vendor CMHK với vendor khác cần lưu ý gì?", related: true },
  { q: "Giải thích cấu trúc mã SKU của GoHub.", related: false },
  { q: "Quy trình import danh mục nhà cung cấp WorldMove gồm những bước nào?", related: false },
  { q: "Gói Fixed và gói Daily khác nhau thế nào?", related: false },
  { q: "Mã Item khác mã SKU ở điểm nào?", related: false },
]

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
  return pool(QUESTIONS, CONC, async x => {
    try { const r = await call({ action: "ask", question: x.q }, 1); return { ...x, a: String(r.text ?? "") } }
    catch (e) { return { ...x, a: "", error: e.message } }
  })
}

async function judge(x) {
  const prompt = `Bạn chấm MỘT câu trả lời của trợ lý nội bộ. Bối cảnh người hỏi (trợ lý có thể đã biết hoặc không): ${HABIT_DESC}
Câu hỏi: ${x.q}
Câu trả lời:
"""${x.a.slice(0, 3800)}"""
Trả JSON:
- answered: 1 nếu trả lời được câu hỏi chính (đủ ý chính), 0 nếu không.
- suggests: 1 nếu câu trả lời có GỢI Ý/ĐỀ NGHỊ CHỦ ĐỘNG dựa trên việc người hỏi hay quan tâm B2B/CMHK/Thứ Hai (vd "anh hay xem doanh thu B2B đầu tuần, em lấy luôn nhé?", "em có thể chuẩn bị báo cáo CMHK cho anh"); 0 nếu không. Lời mời chung chung kiểu "anh cần gì thêm cứ hỏi" KHÔNG tính.
- suggestion_relevant: 1 nếu có gợi ý và gợi ý thực sự liên quan tới câu hỏi lần này; 0 nếu có gợi ý nhưng lạc đề/gượng ép; (không có gợi ý → 1).
- surveillance: 1 nếu dùng giọng THEO DÕI/ghi nhận lộ liễu ("em theo dõi thấy anh…", "theo dữ liệu em quan sát anh…", "em đã ghi nhận thói quen của anh"); 0 nếu nói tự nhiên như người quen ("anh hay xem… đầu tuần mà").
- overclaim: 1 nếu khẳng định thói quen như sự thật chắc chắn ("anh luôn luôn…", "chắc chắn anh cần…"); 0 nếu để ngỏ/hỏi lại.
- intrusive: 1 nếu phần gợi ý chiếm phần lớn câu trả lời, ép người dùng, hoặc lặp lại; 0 nếu chỉ 1 dòng nhẹ hoặc không có.
- note: lý do ngắn.`
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json",
    responseSchema: { type: "OBJECT", properties: { answered: { type: "INTEGER" }, suggests: { type: "INTEGER" }, suggestion_relevant: { type: "INTEGER" }, surveillance: { type: "INTEGER" }, overclaim: { type: "INTEGER" }, intrusive: { type: "INTEGER" }, note: { type: "STRING" } },
      required: ["answered", "suggests", "suggestion_relevant", "surveillance", "overclaim", "intrusive", "note"] } } }
  for (let a = 0; a < 3; a++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    try { return JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "") } catch { await new Promise(r => setTimeout(r, 3000)) }
  }
  return null
}

const label = `suggest-${arg("label", new Date().toISOString().slice(0, 16).replace(/[:T]/g, ""))}`
console.log(`H2b gợi ý chủ động — ${base} · user ${user}`)
const A = await runArm([]); console.log(`Arm A: ${A.filter(r => !r.error).length}/${QUESTIONS.length} OK`)
const B = await runArm(HABITS); console.log(`Arm B: ${B.filter(r => !r.error).length}/${QUESTIONS.length} OK`)
const rows = []
for (const [arm, list] of [["A", A], ["B", B]]) {
  const js = await pool(list.filter(r => !r.error), CONC, async r => ({ arm, q: r.q, related: r.related, j: await judge(r), a: r.a }))
  rows.push(...js.filter(x => x.j))
}
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const pct = x => `${(x * 100).toFixed(0)}%`
const cell = (arm, related) => { const s = rows.filter(r => r.arm === arm && r.related === related); return { n: s.length, suggest: avg(s.map(r => r.j.suggests)), relevant: avg(s.filter(r => r.j.suggests).map(r => r.j.suggestion_relevant)), surv: avg(s.map(r => r.j.surveillance)), over: avg(s.map(r => r.j.overclaim)), intr: avg(s.map(r => r.j.intrusive)), ans: avg(s.map(r => r.j.answered)) } }
const t = { A_rel: cell("A", true), B_rel: cell("B", true), A_unrel: cell("A", false), B_unrel: cell("B", false) }
const md = [`# H2b — gợi ý chủ động từ thói quen — ${label}`, "", `Thói quen nạp (arm B): ${HABITS.map(h => `"${h}"`).join(" · ")}`, `Giám khảo ${JUDGE_MODEL}, chấm từng câu độc lập · ${QUESTIONS.length} câu (4 liên quan, 4 không) · user ${user}`, "",
  "| Chỉ số | A liên quan | B liên quan | A không liên quan | B không liên quan |", "|---|---|---|---|---|",
  `| Số câu | ${t.A_rel.n} | ${t.B_rel.n} | ${t.A_unrel.n} | ${t.B_unrel.n} |`,
  `| Có gợi ý chủ động | ${pct(t.A_rel.suggest)} | ${pct(t.B_rel.suggest)} | ${pct(t.A_unrel.suggest)} | **${pct(t.B_unrel.suggest)}** |`,
  `| Gợi ý đúng chỗ (trong số có gợi ý) | — | ${pct(t.B_rel.relevant)} | — | ${pct(t.B_unrel.relevant)} |`,
  `| Giọng theo dõi lộ liễu | ${pct(t.A_rel.surv)} | ${pct(t.B_rel.surv)} | ${pct(t.A_unrel.surv)} | ${pct(t.B_unrel.surv)} |`,
  `| Khẳng định như sự thật | ${pct(t.A_rel.over)} | ${pct(t.B_rel.over)} | ${pct(t.A_unrel.over)} | ${pct(t.B_unrel.over)} |`,
  `| Lấn át / ép | ${pct(t.A_rel.intr)} | ${pct(t.B_rel.intr)} | ${pct(t.A_unrel.intr)} | ${pct(t.B_unrel.intr)} |`,
  `| Trả lời được câu hỏi | ${pct(t.A_rel.ans)} | ${pct(t.B_rel.ans)} | ${pct(t.A_unrel.ans)} | ${pct(t.B_unrel.ans)} |`, "",
  "## Câu có gợi ý ở arm B", ...rows.filter(r => r.arm === "B" && r.j.suggests).map(r => `- (${r.related ? "liên quan" : "KHÔNG liên quan"}) ${r.q} → ${r.j.note}`)].join("\n")
fs.writeFileSync(path.join(OUT, `${label}.md`), md); fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify({ label, t, rows }, null, 1))
console.log("\n" + md)
await call({ action: "reset" })
