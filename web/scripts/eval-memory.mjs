// Eval trí nhớ Gấu Pro (plan personal-agent.md P0): nạp kịch bản persona tổng hợp qua đường rút trí nhớ thật rồi hỏi 32 câu, chấm bằng Gemini.
//   node scripts/eval-memory.mjs --base https://stg-intel-v2.gohub.cloud --label base [--user eval-p0] [--skip-ingest] [--only 1,2] [--concurrency 3] [--stress 60]
// --stress N: thêm N khách giả (nạp TRƯỚC kịch bản chính, khoảng 3N lượt) + câu hỏi kim-đáy-bể-rơm, để thử khi trí nhớ vượt trần prompt.
//   node scripts/eval-memory.mjs --judge-only eval/results/memory-base.json
// Cần web/.env.local: CRON_SECRET (gọi /api/admin/eval/memory), GEMINI_KEY (giám khảo). User thử phải dạng eval-xxx; reset xoá dữ liệu user đó.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")] }))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const flag = k => process.argv.includes(`--${k}`)
const JUDGE_MODEL = arg("judge-model", "gemini-pro-latest")
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/memory-cases.json"), "utf8"))
const OUT_DIR = path.join(ROOT, "eval/results")
fs.mkdirSync(OUT_DIR, { recursive: true })
const base = arg("base", "https://stg-intel-v2.gohub.cloud")
const user = arg("user", "eval-p0")
const STRESS = Number(arg("stress", 0))

// Sinh dữ liệu stress tất định (seed cố định): N khách, mỗi khách có đầu mối, mục tiêu, và một phần đổi đầu mối/mục tiêu.
function stressData(n) {
  let seed = 20261009
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const pick = a => a[Math.floor(rnd() * a.length)]
  const A = ["Alfa", "Alpha", "Bravo", "Cedar", "Delta", "Ember", "Fjord", "Garnet", "Harbor", "Indigo", "Jade", "Koala", "Lotus", "Mango", "Nimbus", "Onyx", "Pearl", "Quartz", "Raven", "Sierra", "Topaz", "Umber", "Velvet", "Willow", "Xenon", "Yarrow", "Zephyr", "Amber", "Birch", "Coral", "Dune"]
  const B = ["Travel", "Tours", "Holidays", "Voyages", "Trips", "Journeys"]
  const M = ["Nhật Bản", "Thái Lan", "Singapore", "Mỹ", "Úc", "Hàn Quốc", "Đài Loan", "Pháp", "Ý", "Đức"]
  const P = ["anh Bảo", "chị Chi", "anh Dũng", "chị Giang", "anh Hải", "chị Hạnh", "anh Khải", "chị Lam", "anh Nam", "chị Oanh", "anh Phát", "chị Quyên", "anh Sơn", "chị Thảo", "anh Việt", "chị Yến"]
  if (n > A.length * B.length - 3) throw new Error(`--stress tối đa ${A.length * B.length - 3} khách`)
  const names = new Set(); const clients = []
  while (clients.length < n) {
    const name = `${pick(A)} ${pick(B)}`
    if (names.has(name) || ["Alpha Travel", "Beta Tours", "Gamma Holidays"].includes(name)) continue
    names.add(name)
    clients.push({ name, market: pick(M), contact: pick(P), target: (1 + Math.floor(rnd() * 20)) * 50 })
  }
  const turns = [], facts = [], questions = []
  for (const c of clients) {
    turns.push({ user: `Khách ${c.name} thuộc thị trường ${c.market}, đầu mối bên họ là ${c.contact}.`, assistant: "Đã ghi nhận." })
    turns.push({ user: `Mục tiêu hằng tháng của khách ${c.name} là ${c.target} SIM.`, assistant: "Đã ghi nhận." })
    facts.push(`Khách ${c.name} thuộc thị trường ${c.market}, đầu mối ban đầu ${c.contact}, mục tiêu ban đầu ${c.target} SIM/tháng.`)
  }
  let id = 100
  for (const c of clients) {
    if (rnd() < 0.5) {
      const nc = pick(P.filter(x => x !== c.contact)); const nt = c.target + 50
      turns.push({ user: `Khách ${c.name} đổi đầu mối từ ${c.contact} sang ${nc}, mục tiêu tháng tăng lên ${nt} SIM.`, assistant: "Đã cập nhật." })
      facts.push(`Khách ${c.name} đã đổi đầu mối từ ${c.contact} sang ${nc} và mục tiêu tăng lên ${nt} SIM/tháng.`)
      const old = { contact: c.contact, target: c.target }; c.contact = nc; c.target = nt; c.changed = old
    }
  }
  const sample = [...clients].sort(() => rnd() - 0.5).slice(0, 15)
  for (const c of sample.slice(0, 5)) questions.push({ id: id++, cat: "stress_current", q: `Hiện giờ đầu mối bên khách ${c.name} là ai và mục tiêu SIM hằng tháng là bao nhiêu?`, ref: `Đầu mối ${c.contact}, mục tiêu ${c.target} SIM mỗi tháng.` })
  for (const c of sample.filter(x => x.changed).slice(0, 5)) questions.push({ id: id++, cat: "stress_history", q: `Trước khi đổi, đầu mối của khách ${c.name} là ai và mục tiêu tháng lúc đó là bao nhiêu?`, ref: `Đầu mối ${c.changed.contact}, mục tiêu ${c.changed.target} SIM mỗi tháng.` })
  for (const c of sample.slice(5, 10)) questions.push({ id: id++, cat: "stress_market", q: `Khách ${c.name} thuộc thị trường nào?`, ref: c.market })
  return { sessions: [{ date: "2026-07-01", turns }], questions, facts }
}
const stress = STRESS ? stressData(STRESS) : null
const sessions = [...(stress?.sessions ?? []), ...dataset.sessions]
const questions = [...dataset.questions, ...(stress?.questions ?? [])]
const FACT_SHEET = [...(stress?.facts ?? []), ...dataset.sessions.flatMap(s => s.turns.filter(t => !t.noise).map(t => t.user))].join("\n")

async function call(body, retries = 2) {
  for (let a = 0; ; a++) {
    const res = await fetch(`${base}/api/admin/eval/memory`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ user, ...body }),
    })
    const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    if (res.ok && !d.error) return d
    if (a >= retries) throw new Error(d.error || `HTTP ${res.status}`)
    await new Promise(r => setTimeout(r, 4000))
  }
}

async function ingest() {
  await call({ action: "reset" })
  let turns = 0, changed = 0
  for (const s of sessions) {
    let conv
    for (const t of s.turns) {
      const r = await call({ action: "turn", conv, title: s.conv && !conv ? s.conv.title : undefined, userMsg: t.user, assistantMsg: t.assistant })
      if (s.conv) conv = r.conv
      turns++; changed += r.memoriesChanged ?? 0
      console.log(`  ${s.date} ${t.noise ? "[noise] " : ""}→ ${r.memoriesChanged} mục đổi (${Math.round(r.ms / 1000)}s)`)
    }
    if (conv) await call({ action: "summarize", conv })
  }
  const dump = await call({ action: "dump" })
  console.log(`Nạp xong: ${turns} lượt, ${changed} thao tác trí nhớ, ${dump.memories.length} mục, ${dump.conversationSummaries.length} tóm tắt hội thoại, khối prompt ${dump.memoryBlockChars} ký tự`)
  return dump
}

async function runQ(q) {
  const t0 = Date.now()
  try {
    const r = await call({ action: "ask", question: q.q }, 1)
    return { id: q.id, cat: q.cat, question: q.q, answer: r.text, toolsUsed: r.toolsUsed, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: r.ms }
  } catch (e) {
    return { id: q.id, cat: q.cat, question: q.q, error: e.message, ms: Date.now() - t0 }
  }
}

async function judge(q, r) {
  if (r.error) return { correct: 0, hallucinated: 0, note: `Lỗi khi chạy: ${r.error}` }
  const abst = q.cat === "abstention"
  const prompt = `Bạn chấm câu trả lời của một trợ lý có trí nhớ về người dùng. Chỉ so với đáp án tham chiếu, KHÔNG dùng kiến thức ngoài.
Câu hỏi: ${q.q}
Đáp án tham chiếu: ${q.ref}
BẢNG SỰ THẬT ĐẦY ĐỦ (mọi điều người dùng từng nói, theo thứ tự thời gian):
${FACT_SHEET}
Câu trả lời của trợ lý:
"""${String(r.answer).slice(0, 4000)}"""

Quy tắc:
- correct = 1 nếu trả lời đúng ý chính của đáp án tham chiếu (đủ mọi phần được hỏi); 0 nếu sai, thiếu ý chính, hoặc trả lời thông tin đã lỗi thời thay vì thông tin hiện tại/đúng thời điểm được hỏi.
${abst ? "- Câu này đáp án đúng là KHÔNG BIẾT: correct = 1 chỉ khi trợ lý nói rõ chưa có thông tin; bịa ra bất kỳ giá trị cụ thể nào thì correct = 0." : "- Trợ lý nói không biết/chưa có thông tin cho câu CÓ đáp án thì correct = 0."}
- hallucinated = 1 CHỈ khi trợ lý khẳng định điều trái với, hoặc hoàn toàn không có trong, BẢNG SỰ THẬT. Thông tin thừa nhưng có trong bảng sự thật KHÔNG phải bịa (hallucinated = 0). Việc bổ sung NĂM 2026 cho một ngày/tháng, hoặc tính ngày kết thúc suy ra từ ngày bắt đầu + thời hạn, KHÔNG tính là bịa.
Trả JSON {"correct":0|1,"hallucinated":0|1,"note":"lý do ngắn"}.`
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json",
    responseSchema: { type: "OBJECT", properties: { correct: { type: "INTEGER" }, hallucinated: { type: "INTEGER" }, note: { type: "STRING" } }, required: ["correct", "hallucinated", "note"] } } }
  for (let a = 0; a < 3; a++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    try {
      const j = JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "")
      return { correct: j.correct ? 1 : 0, hallucinated: j.hallucinated ? 1 : 0, note: j.note }
    } catch { await new Promise(r => setTimeout(r, 3000)) }
  }
  return { correct: 0, hallucinated: 0, note: "Giám khảo lỗi" }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}

function summary(label, rows, dump) {
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
  const cats = [...new Set(rows.map(r => r.cat))]
  const pct = x => `${(x * 100).toFixed(0)}%`
  return [`# Eval trí nhớ — ${label}`, "", `Giám khảo: ${JUDGE_MODEL} · ${rows.length} câu · persona tổng hợp · user ${user}`, "",
    `**Đúng: ${pct(avg(rows.map(r => r.judge.correct)))}** · bịa: ${pct(avg(rows.map(r => r.judge.hallucinated)))} · lỗi chạy: ${rows.filter(r => r.error).length}`, "",
    "| Nhóm | Số câu | Đúng | Bịa |", "|---|---|---|---|",
    ...cats.map(c => { const a = rows.filter(r => r.cat === c); return `| ${c} | ${a.length} | ${pct(avg(a.map(r => r.judge.correct)))} | ${pct(avg(a.map(r => r.judge.hallucinated)))} |` }), "",
    `Mỗi câu: thời gian TB ${(avg(rows.filter(r => r.ms).map(r => r.ms)) / 1000).toFixed(1)}s · token vào/ra TB ${Math.round(avg(rows.map(r => r.tokensIn || 0)))}/${Math.round(avg(rows.map(r => r.tokensOut || 0)))} · gọi tool: ${rows.filter(r => r.toolsUsed?.length).length}/${rows.length} câu`, "",
    dump ? `Trí nhớ sau khi nạp: ${dump.memories.length} mục (${dump.memories.filter(m => m.archived).length} đã lưu trữ), ${dump.conversationSummaries.length} tóm tắt hội thoại, khối prompt ${dump.memoryBlockChars} ký tự` : "", "",
    "| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |", "|---|---|---|---|---|",
    ...rows.map(r => `| ${r.id} | ${r.cat} | ${r.judge.correct} | ${r.judge.hallucinated} | ${String(r.judge.note || "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 200)} |`)].join("\n")
}

const judgeOnly = arg("judge-only")
let label, results, dump
if (judgeOnly) {
  const prev = JSON.parse(fs.readFileSync(judgeOnly, "utf8"))
  label = prev.label; results = prev.rows; dump = prev.dump
} else {
  label = `memory-${arg("label", new Date().toISOString().slice(0, 16).replace(/[:T]/g, ""))}`
  console.log(`Nạp kịch bản lên ${base} (user ${user}) …`)
  dump = flag("skip-ingest") ? await call({ action: "dump" }) : await ingest()
  const only = arg("only")?.split(",").map(Number)
  const todo = questions.filter(q => !only || only.includes(q.id))
  console.log(`Hỏi ${todo.length} câu …`)
  results = await pool(todo, Number(arg("concurrency", 3)), async q => {
    const r = await runQ(q)
    console.log(`#${q.id} ${r.error ? "LỖI " + r.error : Math.round(r.ms / 1000) + "s"}`)
    return r
  })
}
console.log("Chấm điểm …")
const byId = Object.fromEntries(questions.map(q => [q.id, q]))
results = await pool(results, 4, async r => ({ ...r, judge: await judge(byId[r.id], r) }))
fs.writeFileSync(path.join(OUT_DIR, `${label}.json`), JSON.stringify({ label, judgeModel: JUDGE_MODEL, at: new Date().toISOString(), dump, rows: results }, null, 2))
const md = summary(label, results, dump)
fs.writeFileSync(path.join(OUT_DIR, `${label}.md`), md)
console.log(md)
