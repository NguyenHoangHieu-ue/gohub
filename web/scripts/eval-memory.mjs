// Eval trí nhớ Gấu Pro (plan personal-agent.md P0): nạp kịch bản persona tổng hợp qua đường rút trí nhớ thật rồi hỏi 32 câu, chấm bằng Gemini.
//   node scripts/eval-memory.mjs --base https://stg-intel-v2.gohub.cloud --label base [--user eval-p0] [--skip-ingest] [--only 1,2] [--concurrency 3]
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
const { sessions, questions } = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/memory-cases.json"), "utf8"))
const OUT_DIR = path.join(ROOT, "eval/results")
fs.mkdirSync(OUT_DIR, { recursive: true })
const base = arg("base", "https://stg-intel-v2.gohub.cloud")
const user = arg("user", "eval-p0")

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
Câu trả lời của trợ lý:
"""${String(r.answer).slice(0, 4000)}"""

Quy tắc:
- correct = 1 nếu trả lời đúng ý chính của đáp án tham chiếu (đủ mọi phần được hỏi); 0 nếu sai, thiếu ý chính, hoặc trả lời thông tin đã lỗi thời thay vì thông tin hiện tại/đúng thời điểm được hỏi.
${abst ? "- Câu này đáp án đúng là KHÔNG BIẾT: correct = 1 chỉ khi trợ lý nói rõ chưa có thông tin; bịa ra bất kỳ giá trị cụ thể nào thì correct = 0." : "- Trợ lý nói không biết/chưa có thông tin cho câu CÓ đáp án thì correct = 0."}
- hallucinated = 1 nếu trợ lý khẳng định một sự kiện/giá trị cụ thể trái hoặc không có trong đáp án tham chiếu; ngược lại 0.
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
