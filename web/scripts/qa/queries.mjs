// G0.2 — Kiểm kê dữ liệu: với mỗi tab, mỗi route API → tham số, bảng nguồn, hàm lọc, cache, quyền.
// Chạy sau inventory.mjs:  node web/scripts/qa/queries.mjs   → docs/qa/queries/<tab>.md + INDEX.md
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..", "..", "..")
const SRC = path.join(ROOT, "web", "src")
const INV = path.join(ROOT, "docs", "qa", "inventory")
const OUT = path.join(ROOT, "docs", "qa", "queries")

const read = f => fs.readFileSync(f, "utf8")
const uniq = a => [...new Set(a)]
const one = s => String(s || "").replace(/\s+/g, " ").trim()
const cell = s => one(s).replace(/\|/g, "/")

const tabFiles = fs.readdirSync(INV).filter(f => f.endsWith(".md") && f !== "INDEX.md")

function routeFile(api) {
  const p = api.replace(/^\/api\//, "")
  const f = path.join(SRC, "app", "api", p, "route.ts")
  return fs.existsSync(f) ? f : null
}
function resolveLib(from, spec) {
  let base
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec)
  else return null
  for (const ext of [".ts", ".tsx", "/index.ts"]) if (fs.existsSync(base + ext)) return base + ext
  return null
}
function balanced(s, openIdx) {
  const open = s[openIdx], close = open === "(" ? ")" : "}"
  let d = 0, i = openIdx, q = null
  for (; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q && s[i - 1] !== "\\") q = null; continue }
    if (c === '"' || c === "'" || c === "`") { q = c; continue }
    if (c === open) d++
    else if (c === close) { d--; if (d === 0) break }
  }
  return s.slice(openIdx + 1, i)
}

function sources(src) {
  const dw = uniq([...src.matchAll(/\b(fact_[a-z_]+|dim_[a-z_]+|data_usage_log)\b/g)].map(m => m[1]))
  const sb = uniq([...src.matchAll(/supabaseAdmin\s*\.from\(\s*["'`]([a-z0-9_]+)["'`]/g)].map(m => m[1]))
  const tu = uniq([...src.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN|TABLE(?: IF NOT EXISTS)?)\s+(b2b_[a-z_]+|target_planning_quarter|country_codes|channel_costs|leads_[a-z_]+)\b/gi)].map(m => m[1].toLowerCase()))
  const ext = []
  if (/runGA4Report|lib\/ga4/.test(src)) ext.push("GA4")
  if (/googleapis|searchconsole/i.test(src)) ext.push("GSC")
  if (/admin-gohub|ADMIN_GOHUB/.test(src)) ext.push("Admin GoHub API")
  if (/chatwoot/i.test(src)) ext.push("Chatwoot")
  if (/lark/i.test(src) && /lark_cs_tickets|lib\/lark|larkBase/i.test(src)) ext.push("Lark")
  if (/gemini|GoogleGenAI/i.test(src)) ext.push("Gemini")
  return { dw, sb, tu, ext }
}

function describe(api, file) {
  const s = read(file)
  const methods = uniq([...s.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]))
  const params = uniq([...s.matchAll(/\b(?:searchParams|sp|p|params|url\.searchParams)\.get\(\s*["']([^"']+)["']/g)].map(m => m[1]))
  const imports = [...s.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)].map(m => ({ names: m[1].split(",").map(x => x.trim().replace(/^type\s+/, "")).filter(Boolean), spec: m[2] }))
  const helpers = uniq(imports.filter(i => /analytics-helpers|quarterly-settings|bod-data|cost-engine|customer-cost|projection|date-math|b2b-customer-cost|inventory|catalogue/.test(i.spec)).flatMap(i => i.names))
  const filters = helpers.filter(h => /shipFilter|internalOpsFilter|excludeOps|excludeInactive|makeExcludeSql|customerExcluded|excludedForB2C|getDateFilter|getPrevDateFilter|getAnalyticsSource|getBODFilters|getCustomerStrategicSql/.test(h))
  const costs = helpers.filter(h => /getChannelCostsForMonths|getGroupCostsForMonths|fetchCosts|fetchCustomerCosts|calcChCostForPeriod|rangeDayRatio|allocateCustomerCostByKey|matchChannelCost|filterGroupCostsByCompany|getProjectionFactor|buildQuarterMonthMeta/.test(h))
  // cache
  const cache = []
  for (const m of s.matchAll(/cachedQuery\(|cachedAnalyticsQuery\(/g)) {
    const body = balanced(s, m.index + m[0].length - 1)
    cache.push(one(body).slice(0, 60))
  }
  const keys = uniq([...s.matchAll(/\b(?:const|let)\s+(?:cacheKey|key|rawCacheKey)\s*=\s*`([^`]{0,80})/g)].map(m => m[1]))
  const bypass = /noCache\(req\)/.test(s) ? "noCache(req)" : /bypass|forceRefresh|nocache/.test(s) ? "tuỳ biến" : ""
  const guard = uniq([...s.matchAll(/\b(analyticsGuard|getServerSession|canWrite\([^)]*\)|canWriteTab\([^)]*\)|requireCreator|getDbRole|isCronReq)\b/g)].map(m => m[0].replace(/\s+/g, " "))).slice(0, 5)
  const duration = (s.match(/maxDuration\s*=\s*(\d+)/) || [])[1] || ""
  // lib 1 cấp
  const libSrc = imports.map(i => resolveLib(file, i.spec)).filter(f => f && /\/lib\//.test(f.replace(/\\/g, "/")) && !/\/lib\/(supabase|utils|auth|analytics-db|turso)\.ts$/.test(f.replace(/\\/g, "/")))
  const libTxt = uniq(libSrc).map(f => read(f)).join("\n")
  const own = sources(s), viaLib = sources(libTxt)
  return {
    api, rel: path.relative(SRC, file).replace(/\\/g, "/"), methods, params, filters, costs, cache: cache.length, keys, bypass, guard, duration,
    dw: uniq([...own.dw, ...viaLib.dw.map(x => x + "ᴸ")]), sb: uniq([...own.sb, ...viaLib.sb.map(x => x + "ᴸ")]), tu: uniq([...own.tu, ...viaLib.tu.map(x => x + "ᴸ")]), ext: uniq([...own.ext, ...viaLib.ext.map(x => x + "ᴸ")]),
    libs: uniq(imports.map(i => i.spec).filter(x => x.startsWith("@/lib/"))).map(x => x.replace("@/lib/", "")),
    lines: s.split("\n").length,
  }
}

fs.mkdirSync(OUT, { recursive: true })
const all = new Map()
const idxRows = []
for (const tf of tabFiles) {
  const id = tf.replace(".md", "")
  const md = read(path.join(INV, tf))
  const name = (md.match(/^# Kiểm kê điều khiển: (.+)$/m) || [, id])[1]
  const line = (md.match(/\*\*Route gọi từ giao diện \(\d+\):\*\* (.+)/) || [, ""])[1]
  const apis = uniq([...line.matchAll(/`([^`]+)`/g)].map(m => m[1])).filter(a => a.startsWith("/api/")).map(a => a.replace(//$/, ""))
  const rows = [], missing = []
  for (const a of apis) {
    const f = routeFile(a)
    if (!f) { missing.push(a); continue }
    const d = describe(a, f)
    all.set(a, d)
    rows.push(d)
  }
  let o = `# Kiểm kê dữ liệu: ${name}\n\n> Sinh bởi \`web/scripts/qa/queries.mjs\`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.\n\n`
  o += `Route quét: ${rows.length}${missing.length ? ` · không tìm thấy tệp route (có thể động hoặc ngoài /api/analytics): ${missing.map(x => "`" + x + "`").join(", ")}` : ""}\n\n`
  o += `| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |\n|---|---|---|---|---|---|---|---|---|---|---|\n`
  for (const d of rows) {
    o += `| \`${d.api}\` | ${d.methods.join(", ")} | ${cell(d.params.join(", "))} | ${cell(d.dw.join(", "))} | ${cell(d.sb.join(", "))} | ${cell(d.tu.join(", "))} | ${cell(d.ext.join(", "))} | ${cell(d.filters.join(", "))} | ${cell(d.costs.join(", "))} | ${d.cache}× ${d.bypass ? "(" + d.bypass + ")" : "(không nocache)"}${d.duration ? " · " + d.duration + "s" : ""} | ${cell(d.guard.join(", "))} |\n`
  }
  o += `\n## Khoá cache khai báo\n\n` + (rows.filter(d => d.keys.length).map(d => `- \`${d.api}\`: ${d.keys.map(k => "`" + cell(k) + "`").join(", ")}`).join("\n") || "_(không)_") + "\n"
  o += `\n## Điểm cần chú ý khi QA (tự phát hiện từ quét)\n\n`
  const notes = []
  for (const d of rows) {
    if (d.methods.includes("GET") && d.cache > 0 && d.bypass !== "noCache(req)") notes.push(`- \`${d.api}\`: có cache nhưng KHÔNG nhận \`nocache=1\` qua \`noCache(req)\` → khi đo số tươi có thể ăn bản cũ.`)
    if (d.methods.some(m => m !== "GET") && !d.guard.some(g => /canWrite|requireCreator|getDbRole|getServerSession/.test(g))) notes.push(`- \`${d.api}\`: có thao tác ghi nhưng không thấy cổng quyền rõ ràng trong route (kiểm lại).`)
    if (d.methods.includes("GET") && d.dw.filter(x => !x.endsWith("ᴸ")).length && !d.filters.length && !/query|recent|region|catalogue|inventory|vendors|products|customer|order|3hk|staff|website|gsc|ga4/.test(d.api)) notes.push(`- \`${d.api}\`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.`)
  }
  o += notes.length ? notes.join("\n") + "\n" : "_(không có)_\n"
  fs.writeFileSync(path.join(OUT, tf), o)
  idxRows.push([`[${name}](${tf})`, rows.length, missing.length, rows.filter(d => d.methods.some(m => m !== "GET")).length, rows.filter(d => d.cache > 0).length, rows.filter(d => d.cache > 0 && d.bypass !== "noCache(req)").length, notes.length])
}

// Chỉ mục theo route (một route dùng bởi nhiều tab)
const byRoute = new Map()
for (const tf of tabFiles) {
  const md = read(path.join(INV, tf))
  const line = (md.match(/\*\*Route gọi từ giao diện \(\d+\):\*\* (.+)/) || [, ""])[1]
  for (const m of line.matchAll(/`([^`]+)`/g)) if (m[1].startsWith("/api/")) { if (!byRoute.has(m[1])) byRoute.set(m[1], []); byRoute.get(m[1]).push(tf.replace(".md", "")) }
}
let ix = `# Kiểm kê dữ liệu: tổng quan\n\nSinh bởi \`web/scripts/qa/queries.mjs\` ngày ${new Date().toISOString().slice(0, 10)}.\n\n## Theo tab\n\n| Tab | Route quét | Không tìm thấy | Route có ghi | Route có cache | Cache không nocache | Ghi chú tự phát hiện |\n|---|---|---|---|---|---|---|\n` + idxRows.map(r => "| " + r.join(" | ") + " |").join("\n") + "\n"
ix += `\n## Route dùng chung giữa nhiều tab\n\n| Route | Số tab | Tab |\n|---|---|---|\n` + [...byRoute.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length).map(([r, v]) => `| \`${r}\` | ${v.length} | ${v.join(", ")} |`).join("\n") + "\n"
ix += `\n## Route chỉ do 1 tab dùng: ${[...byRoute.entries()].filter(([, v]) => v.length === 1).length} · tổng route phân biệt: ${byRoute.size}\n`
fs.writeFileSync(path.join(OUT, "INDEX.md"), ix)
console.log(ix.slice(0, 3500))
