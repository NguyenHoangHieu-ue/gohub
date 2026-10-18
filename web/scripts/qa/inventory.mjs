// G0.1 — Kiểm kê điều khiển và dữ liệu của từng tab Analyst (quét tĩnh JSX/TSX).
// Chạy: node web/scripts/qa/inventory.mjs   → ghi docs/qa/inventory/<tab>.md + INDEX.md
// Heuristic, KHÔNG thay cho quét DOM thật: dùng làm danh sách gốc để đối chiếu khi QA từng tab.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..", "..", "..")
const SRC = path.join(ROOT, "web", "src")
const PAGES = path.join(SRC, "app", "(dashboard)", "analytics")
const OUT = path.join(ROOT, "docs", "qa", "inventory")

const TABS = [
  { id: "dashboard", name: "Dashboard", url: "/analytics", entry: "page.tsx", extra: ["components/quarterly-report.tsx"] },
  { id: "quarterly", name: "Quarter Report", url: "/analytics/quarterly", entry: "quarterly/page.tsx" },
  { id: "bod", name: "BOD Report", url: "/analytics/bod", entry: "bod/page.tsx" },
  { id: "all-time", name: "All-Time Report", url: "/analytics/all-time", entry: "all-time/page.tsx" },
  { id: "channels", name: "Channels", url: "/analytics/channels", entry: "channels/page.tsx" },
  { id: "b2b", name: "B2B", url: "/analytics/b2b", entry: "b2b/page.tsx" },
  { id: "b2b-ecom", name: "B2B — VN Ecom theo thời gian", url: "/analytics/b2b/ecom", entry: "b2b/ecom/page.tsx" },
  { id: "b2c", name: "B2C", url: "/analytics/b2c", entry: "b2c/page.tsx" },
  { id: "website", name: "Website Analytics", url: "/analytics/website", entry: "website/page.tsx" },
  { id: "staff", name: "Staff", url: "/analytics/staff", entry: "staff/page.tsx" },
  { id: "customers", name: "Customers", url: "/analytics/customers", entry: "customers/page.tsx" },
  { id: "vendors", name: "Vendors", url: "/analytics/vendors", entry: "vendors/page.tsx" },
  { id: "orders", name: "Orders", url: "/analytics/orders", entry: "orders/page.tsx" },
  { id: "inventory", name: "Inventory", url: "/analytics/fulfillment", entry: "fulfillment/page.tsx" },
  { id: "3hk-usage", name: "3HK Data Usage", url: "/analytics/3hk-usage", entry: "3hk-usage/page.tsx" },
  { id: "cs-troubleshoot", name: "CS Troubleshoot", url: "/analytics/cs-troubleshoot", entry: "cs-troubleshoot/page.tsx" },
  { id: "products", name: "Products (BI)", url: "/analytics/products", entry: "products/page.tsx" },
  { id: "catalogue", name: "Product Catalogue", url: "/analytics/catalogue", entry: "catalogue/page.tsx" },
  { id: "targets", name: "Manage Costs", url: "/analytics/targets", entry: "targets/page.tsx" },
  { id: "scheduled", name: "Scheduled Messages", url: "/analytics/scheduled", entry: "scheduled/page.tsx" },
]

const SHARED = new Set(["dashboard-kit", "skeleton", "toast", "tooltip", "empty-state", "pager", "confirm-modal", "sidebar", "top-bar"])

const read = f => fs.readFileSync(f, "utf8")
const uniq = a => [...new Set(a)]
const one = s => String(s || "").replace(/\s+/g, " ").trim()
const clean = s => one(String(s).replace(/\{[^{}]*\}/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "))
const cell = s => one(s).replace(/\|/g, "/")

// Đọc thẻ mở bắt đầu tại idx (s[idx] === "<"), tôn trọng {...} và chuỗi → {attrs, end}
function readTag(s, idx) {
  let i = idx + 1, depth = 0, q = null
  while (i < s.length) {
    const c = s[i]
    if (q) { if (c === q && s[i - 1] !== "\\") q = null }
    else if (c === '"' || c === "'" || c === "`") q = c
    else if (c === "{") depth++
    else if (c === "}") depth--
    else if (c === ">" && depth <= 0) return { attrs: s.slice(idx, i), end: i + 1 }
    i++
  }
  return { attrs: s.slice(idx), end: s.length }
}

// Nội dung trong cặp ngoặc, s[openIdx] là "(" hoặc "{"
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

// Giá trị thuộc tính: name="..." hoặc name={...}
function attrOf(attrs, name) {
  const re = new RegExp("[\\s]" + name + "=")
  const m = re.exec(attrs)
  if (!m) return ""
  const i = m.index + m[0].length
  const c = attrs[i]
  if (c === '"' || c === "'") { const e = attrs.indexOf(c, i + 1); return attrs.slice(i + 1, e) }
  if (c === "{") return balanced(attrs, i)
  return ""
}

function resolveImport(from, spec) {
  let base
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec)
  else return null
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
  }
  return null
}

function collect(entryFile, extraFiles = []) {
  const seen = new Set(), shared = new Set(), libs = new Set()
  const q = [entryFile, ...extraFiles]
  while (q.length) {
    const f = q.shift()
    if (!f || seen.has(f)) continue
    seen.add(f)
    for (const m of read(f).matchAll(/from\s+["']([^"']+)["']/g)) {
      const r = resolveImport(f, m[1])
      if (!r) continue
      const rel = path.relative(SRC, r).replace(/\\/g, "/")
      const base = path.basename(r).replace(/\.(tsx?|ts)$/, "")
      if (rel.startsWith("lib/")) { libs.add(rel); continue }
      if (SHARED.has(base)) { shared.add(rel); continue }
      if (rel.startsWith("components/") || rel.startsWith("app/")) q.push(r)
    }
  }
  return { files: [...seen], shared: [...shared], libs: [...libs] }
}

function scan(file) {
  const s = read(file)
  const rel = path.relative(SRC, file).replace(/\\/g, "/")
  const lines = s.split(/\r?\n/)
  const lineOf = idx => s.slice(0, idx).split("\n").length
  const r = { rel, lines: lines.length }

  r.api = uniq([...s.matchAll(/["'`](\/api\/[A-Za-z0-9_\-/[\]]+)/g)].map(m => m[1]))
  r.tables = uniq([...s.matchAll(/\b(fact_[a-z_]+|dim_[a-z_]+|data_usage_log|ncc_3hk|lark_cs_tickets|analytics_[a-z_]+)\b/g)].map(m => m[1]))

  r.states = []
  for (const m of s.matchAll(/const\s+\[(\w+),\s*set\w+\]\s*=\s*useState(?:<[^>]*>)?\(/g)) {
    r.states.push({ name: m[1], init: one(balanced(s, m.index + m[0].length - 1)).slice(0, 60), line: lineOf(m.index) })
  }

  r.buttons = []
  for (const m of s.matchAll(/<button\b/g)) {
    const tag = readTag(s, m.index)
    const close = s.indexOf("</button>", tag.end)
    const inner = close > 0 ? s.slice(tag.end, close) : ""
    const text = clean(inner)
    const aria = attrOf(tag.attrs, "aria-label"), title = attrOf(tag.attrs, "title")
    r.buttons.push({
      label: (text || aria || title || "(icon)").slice(0, 70),
      onClick: one(attrOf(tag.attrs, "onClick")).slice(0, 90),
      disabled: one(attrOf(tag.attrs, "disabled")).slice(0, 60),
      line: lineOf(m.index),
    })
  }

  r.inputs = []
  for (const m of s.matchAll(/<input\b/g)) {
    const tag = readTag(s, m.index)
    const a = tag.attrs
    const after = clean(s.slice(tag.end, tag.end + 200).split("<")[0])
    r.inputs.push({
      type: attrOf(a, "type") || "text", ph: attrOf(a, "placeholder"), label: after.slice(0, 40),
      bind: one(attrOf(a, "checked") || attrOf(a, "value")).slice(0, 50),
      change: one(attrOf(a, "onChange")).slice(0, 80), line: lineOf(m.index),
    })
  }

  r.selects = []
  for (const m of s.matchAll(/<select\b/g)) {
    const tag = readTag(s, m.index)
    const close = s.indexOf("</select>", tag.end)
    const inner = close > 0 ? s.slice(tag.end, close) : ""
    const opts = [...inner.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)].map(o => clean(o[1])).filter(Boolean)
    r.selects.push({ bind: one(attrOf(tag.attrs, "value")).slice(0, 50), change: one(attrOf(tag.attrs, "onChange")).slice(0, 80), opts: opts.slice(0, 14), line: lineOf(m.index) })
  }

  r.headers = uniq([...s.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => clean(m[1])).filter(x => x && x.length < 60))
  r.columns = uniq([...s.matchAll(/\blabel:\s*["'`]([^"'`]{1,60})["'`]/g)].map(m => m[1]))
  r.exports = uniq([...s.matchAll(/\b(export[A-Z]\w*|exportTo\w+|exportWith\w+|exportRaw\w+)\b/g)].map(m => m[1]))

  r.mutations = []
  for (const m of s.matchAll(/fetch\(/g)) {
    const body = balanced(s, m.index + m[0].length - 1)
    const meth = (body.match(/method:\s*["'](POST|PUT|DELETE|PATCH)["']/) || [])[1]
    if (meth) r.mutations.push({ method: meth, url: one(body.split(",")[0]).slice(0, 100), line: lineOf(m.index) })
  }

  r.gates = lines.map((l, i) => (/(useDbRole|canEdit|canWrite|isCreator|isAdmin|dbRole\s*===|role\s*===|writable)/.test(l) ? `${i + 1}: ${l.trim().slice(0, 110)}` : null)).filter(Boolean).slice(0, 14)
  r.cache = uniq([...s.matchAll(/\b(nocache=1|live=1|forceRefresh|fresh)\b/g)].map(m => m[1]))
  r.localStorage = uniq([...s.matchAll(/localStorage\.(?:get|set)Item\(\s*["'`]([^"'`]+)/g)].map(m => m[1]))
  r.sqlClient = /\b(FROM|JOIN)\s+(fact_|dim_)/i.test(s) && /\/api\/analytics\/query|queryAnalytics/.test(s)
  return r
}

function mdTable(rows, cols) {
  if (!rows.length) return "_(không có)_\n"
  return `| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n${rows.map(r => "| " + r.join(" | ") + " |").join("\n")}\n`
}
const code = x => (x ? "`" + cell(x) + "`" : "")

fs.mkdirSync(OUT, { recursive: true })
const index = []
for (const t of TABS) {
  const entry = path.join(PAGES, t.entry)
  const extra = (t.extra || []).map(e => path.join(SRC, e))
  const { files, shared, libs } = collect(entry, extra)
  const scans = files.map(scan)
  const agg = k => scans.flatMap(x => x[k].map(v => ({ ...v, file: path.basename(x.rel) })))
  const apis = uniq(scans.flatMap(x => x.api)), tables = uniq(scans.flatMap(x => x.tables))
  const buttons = agg("buttons"), inputs = agg("inputs"), selects = agg("selects"), states = agg("states"), mut = agg("mutations")
  const headers = uniq(scans.flatMap(x => x.headers)), columns = uniq(scans.flatMap(x => x.columns))
  const exportsFn = uniq(scans.flatMap(x => x.exports))
  const gates = scans.flatMap(x => x.gates.map(g => `${path.basename(x.rel)}:${g}`))
  const sqlc = scans.filter(x => x.sqlClient).map(x => x.rel)
  const id = (p, i) => `${t.id}-${p}${String(i + 1).padStart(2, "0")}`

  let o = `# Kiểm kê điều khiển: ${t.name}\n\n`
  o += `> Sinh bởi \`web/scripts/qa/inventory.mjs\` (quét tĩnh, heuristic). Danh sách gốc cho G1; mọi dòng phải được đối chiếu với giao diện thật. Cột "Hiệu ứng mong đợi" và "Kết quả QA" điền trong G1.\n\n`
  o += `- URL: \`${t.url}\`\n- Tệp quét (${files.length}): ${files.map(f => "`" + path.relative(SRC, f).replace(/\\/g, "/") + "`").join(", ")}\n`
  o += `- Dòng mã: ${scans.reduce((a, b) => a + b.lines, 0)}\n- Thành phần dùng chung (không quét sâu): ${shared.map(x => "`" + x + "`").join(", ") || "—"}\n`
  o += `- Thư viện logic import: ${libs.map(x => "`" + x + "`").join(", ") || "—"}\n\n`
  o += `## 1. API và nguồn dữ liệu\n\n**Route gọi từ giao diện (${apis.length}):** ${apis.map(a => "`" + a + "`").join(", ") || "—"}\n\n`
  o += `**Bảng/nguồn nhắc trong mã giao diện:** ${tables.map(a => "`" + a + "`").join(", ") || "—"}\n\n`
  if (sqlc.length) o += `**SQL xây ở giao diện (gửi qua /api/analytics/query), cần đối chiếu từng truy vấn:** ${sqlc.map(x => "`" + x + "`").join(", ")}\n\n`
  o += `**Cờ cache/làm mới:** ${uniq(scans.flatMap(x => x.cache)).join(", ") || "—"}. **localStorage:** ${uniq(scans.flatMap(x => x.localStorage)).join(", ") || "—"}\n\n`
  o += `## 2. Điều khiển\n\n### 2.1 Nút (${buttons.length})\n\n`
  o += mdTable(buttons.map((b, i) => [id("B", i), cell(b.label), code(b.onClick), code(b.disabled), `${b.file}:${b.line}`, "", ""]), ["ID", "Nhãn", "onClick", "Điều kiện khoá", "Vị trí", "Hiệu ứng mong đợi", "Kết quả QA"])
  o += `\n### 2.2 Ô nhập và hộp tích (${inputs.length})\n\n`
  o += mdTable(inputs.map((b, i) => [id("I", i), cell(b.type + (b.ph ? ` «${b.ph}»` : "") + (b.label ? ` — ${b.label}` : "")), code(b.bind), code(b.change), `${b.file}:${b.line}`, "", ""]), ["ID", "Loại / nhãn", "Gắn với", "onChange", "Vị trí", "Hiệu ứng mong đợi", "Kết quả QA"])
  o += `\n### 2.3 Danh sách chọn (${selects.length})\n\n`
  o += mdTable(selects.map((b, i) => [id("S", i), code(b.bind), cell(b.opts.join(" · ")), code(b.change), `${b.file}:${b.line}`, "", ""]), ["ID", "Giá trị đang chọn", "Lựa chọn", "onChange", "Vị trí", "Hiệu ứng mong đợi", "Kết quả QA"])
  o += `\n### 2.4 State điều khiển (${states.length})\n\n`
  o += mdTable(states.map(b => [b.name, code(b.init), `${b.file}:${b.line}`]), ["State", "Giá trị đầu", "Vị trí"])
  o += `\n## 3. Bảng và cột\n\n**Tiêu đề cột (th):** ${headers.map(h => "`" + h + "`").join(", ") || "—"}\n\n**Cột khai báo (label:):** ${columns.map(h => "`" + h + "`").join(", ") || "—"}\n\n`
  o += `## 4. Xuất file\n\nHàm: ${exportsFn.map(h => "`" + h + "`").join(", ") || "—"}\n\n`
  o += `## 5. Thao tác ghi từ giao diện (${mut.length})\n\n`
  o += mdTable(mut.map((b, i) => [id("W", i), b.method, code(b.url), `${b.file}:${b.line}`, "", ""]), ["ID", "Phương thức", "URL", "Vị trí", "Quyền / hiệu ứng", "Kết quả QA"])
  o += `\n## 6. Cổng quyền trong giao diện\n\n` + (gates.length ? gates.map(g => "- `" + g.replace(/`/g, "'") + "`").join("\n") : "_(không thấy)_") + "\n"
  fs.writeFileSync(path.join(OUT, `${t.id}.md`), o)
  index.push({ t, files: files.length, loc: scans.reduce((a, b) => a + b.lines, 0), apis: apis.length, buttons: buttons.length, inputs: inputs.length, selects: selects.length, states: states.length, cols: headers.length + columns.length, mut: mut.length, exp: exportsFn.length, sqlc: sqlc.length })
}
let ix = `# Kiểm kê điều khiển: tổng quan\n\nSinh bởi \`web/scripts/qa/inventory.mjs\` ngày ${new Date().toISOString().slice(0, 10)}.\n\n`
ix += mdTable(index.map(i => [`[${i.t.name}](${i.t.id}.md)`, i.files, i.loc, i.apis, i.buttons, i.inputs, i.selects, i.states, i.cols, i.mut, i.exp, i.sqlc]), ["Tab", "Tệp", "Dòng", "API", "Nút", "Ô nhập", "Chọn", "State", "Cột", "Ghi", "Xuất", "SQL ở UI"])
fs.writeFileSync(path.join(OUT, "INDEX.md"), ix)
console.log(ix)
