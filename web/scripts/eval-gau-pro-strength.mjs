// Eval "việc model mạnh" cho Gấu Pro: báo cáo dài đa chặng, mã nguồn, ngữ cảnh dài, agent nhiều bước.
//   node scripts/eval-gau-pro-strength.mjs --model gemini-4-argon --label gps-argon [--only 1,5] [--concurrency 2] [--base https://stg-intel-v2.gohub.cloud]
// Cần web/.env.local: CRON_SECRET, GEMINI_KEY (giám khảo). Gọi /api/admin/eval/gau-pro (channel cron: chặn ghi/gửi).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")] }))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const JUDGE_MODEL = arg("judge-model", "gemini-pro-latest")
const MODEL = arg("model")
const base = arg("base", "https://stg-intel-v2.gohub.cloud")
const label = arg("label", `gps-${MODEL}`)
const { facts, docs, cases } = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/gau-pro-strength-cases.json"), "utf8"))
const OUT = path.join(ROOT, "eval/results")
const docText = Object.fromEntries(Object.entries(docs).map(([k, p]) => [k, fs.readFileSync(path.resolve(ROOT, "eval", p), "utf8")]))

const buildQuestion = c => c.docs
  ? `Dưới đây là tài liệu nội bộ (rất dài). Trả lời chỉ dựa trên tài liệu này, KHÔNG gọi công cụ.\n\n${c.docs.map(k => `<tai_lieu name="${k}">\n${docText[k]}\n</tai_lieu>`).join("\n\n")}\n\nCâu hỏi: ${c.question}`
  : c.question

async function runCase(c) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${base}/api/admin/eval/gau-pro`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ question: buildQuestion(c), model: MODEL }) })
    const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`)
    return { id: c.id, group: c.group, answer: d.text, toolsUsed: d.toolsUsed, tokensIn: d.tokensIn, tokensOut: d.tokensOut, ms: d.ms }
  } catch (e) { return { id: c.id, group: c.group, error: e.message, ms: Date.now() - t0 } }
}

const DIMS = ["dung_su_that", "do_sau", "day_du", "tuan_thu_nghiep_vu", "ro_rang"]
async function judge(c, r) {
  if (r.error) return { scores: Object.fromEntries(DIMS.map(d => [d, 0])), total: 0, note: `Lỗi: ${r.error}` }
  const prompt = `Bạn là giám khảo chấm câu trả lời của trợ lý "Gấu Pro" (công ty GoHub bán eSIM/SIM du lịch). Chấm KHẮT KHE, mỗi tiêu chí 0–2:
- dung_su_that: đúng sự thật/đáp án tham chiếu; không bịa số, không bịa tên; với câu mã nguồn: chẩn đoán đúng nguyên nhân gốc.
- do_sau: độ sâu phân tích/lập luận (nguyên nhân gốc, kiểm chéo, tính toán), không chung chung.
- day_du: đủ mọi mục/yêu cầu của câu hỏi, đủ chi tiết.
- tuan_thu_nghiep_vu: tôn trọng sự thật nghiệp vụ và ràng buộc của câu (xem "Sự thật nghiệp vụ", "Tiêu chí riêng").
- ro_rang: kết luận rõ, trình bày gọn, đúng trọng tâm.
Người hỏi là Creator: được thấy SQL/tên bảng/giá vốn, KHÔNG trừ điểm vì lộ chúng.

Sự thật nghiệp vụ: ${facts}

Câu hỏi: ${c.question.slice(0, 2500)}
Tiêu chí riêng: ${c.criteria}
Đáp án tham chiếu: ${c.reference || "(không có số tham chiếu — chấm theo tính hợp lý, nhất quán và việc có dùng dữ liệu thật hay không; số liệu đáng ngờ/bịa thì trừ điểm)"}
Công cụ đã gọi: ${(r.toolsUsed || []).join(", ") || "(không gọi công cụ nào)"}

Câu trả lời:
"""${String(r.answer).slice(0, 16000)}"""

Trả về JSON.`
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json",
    responseSchema: { type: "OBJECT", properties: { ...Object.fromEntries(DIMS.map(d => [d, { type: "INTEGER" }])), note: { type: "STRING" } }, required: [...DIMS, "note"] } } }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    try {
      const j = JSON.parse(d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "")
      const scores = Object.fromEntries(DIMS.map(k => [k, Math.max(0, Math.min(2, Number(j[k]) || 0))]))
      return { scores, total: DIMS.reduce((s, k) => s + scores[k], 0), note: j.note }
    } catch { await new Promise(r => setTimeout(r, 3000)) }
  }
  return { scores: Object.fromEntries(DIMS.map(d => [d, 0])), total: 0, note: "Giám khảo lỗi" }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

const only = arg("only")?.split(",").map(Number)
const todo = cases.filter(c => !only || only.includes(c.id))
console.log(`Chạy ${todo.length} câu, model ${MODEL}, ${base}`)
let rows = await pool(todo, Number(arg("concurrency", 2)), async c => { const r = await runCase(c); console.log(`#${c.id} ${r.error ? "LỖI " + r.error : Math.round(r.ms / 1000) + "s"}`); return r })
console.log("Chấm điểm …")
const byId = Object.fromEntries(cases.map(c => [c.id, c]))
rows = await pool(rows, 3, async r => ({ ...r, judge: await judge(byId[r.id], r) }))
fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify({ label, model: MODEL, judgeModel: JUDGE_MODEL, at: new Date().toISOString(), rows }, null, 2))
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const groups = {}; for (const r of rows) (groups[r.group] ??= []).push(r)
const md = [`# Eval việc model mạnh (Gấu Pro) — ${label}`, "", `Model: ${MODEL} · Giám khảo: ${JUDGE_MODEL} · ${rows.length} câu`, "",
  `**Điểm TB: ${avg(rows.map(r => r.judge.total)).toFixed(2)}/10** · lỗi/timeout: ${rows.filter(r => r.error).length} · thời gian TB ${(avg(rows.map(r => r.ms)) / 1000).toFixed(0)}s · vòng công cụ TB ${avg(rows.map(r => (r.toolsUsed || []).length)).toFixed(1)}`, "",
  "| Nhóm | Số câu | TB /10 | Thời gian TB (s) |", "|---|---|---|---|", ...Object.entries(groups).map(([g, a]) => `| ${g} | ${a.length} | ${avg(a.map(r => r.judge.total)).toFixed(2)} | ${(avg(a.map(r => r.ms)) / 1000).toFixed(0)} |`), "",
  "| Tiêu chí | TB (0–2) |", "|---|---|", ...DIMS.map(d => `| ${d} | ${avg(rows.map(r => r.judge.scores[d])).toFixed(2)} |`), "",
  "| # | Nhóm | Điểm | Thời gian | Công cụ | Ghi chú |", "|---|---|---|---|---|---|",
  ...rows.map(r => `| ${r.id} | ${r.group} | ${r.judge.total} | ${Math.round(r.ms / 1000)}s | ${(r.toolsUsed || []).length} | ${String(r.judge.note || "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 200)} |`)].join("\n")
fs.writeFileSync(path.join(OUT, `${label}.md`), md)
console.log(md.split("\n").slice(0, 20).join("\n"))
