// Quét mã nguồn → sơ đồ Hệ thống → Tab → Mục → API → Bảng (Data Map, s240).
// Chạy: npm run build:datamap  (ghi src/lib/data-map.generated.json). Test `data-map.test.ts` so kết quả với file đã commit
// nên quên chạy lại thì test đỏ. Quét bằng regex nên có thể sót SQL ghép chuỗi → bù bằng scripts/datamap/overrides.json.
import fs from "node:fs"
import path from "node:path"

const SRC = (root) => path.join(root, "src")
const EXT = [".tsx", ".ts", "/index.tsx", "/index.ts"]
const SQL_SKIP = new Set(["set", "select", "lateral", "unnest", "generate_series", "dual", "values", "jsonb_array_elements", "jsonb_each", "json_each", "information_schema", "pg_catalog", "t", "x", "s", "c", "r"])

const read = (f) => { try { return fs.readFileSync(f, "utf8") } catch { return "" } }
const exists = (f) => { try { return fs.statSync(f).isFile() } catch { return false } }

function resolveImport(root, spec, fromFile) {
  let base
  if (spec.startsWith("@/")) base = path.join(SRC(root), spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  for (const e of EXT) { const f = base + e; if (exists(f)) return f }
  return exists(base) ? base : null
}

function importsOf(root, file, src) {
  const out = []
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const f = resolveImport(root, m[1], file)
    if (f) out.push(f)
  }
  return out
}

function collect(root, start, depth, accept) {
  const seen = new Map()
  const walk = (f, d) => {
    if (seen.has(f)) return
    const src = read(f)
    seen.set(f, src)
    if (d <= 0) return
    for (const g of importsOf(root, f, src)) if (accept(g)) walk(g, d - 1)
  }
  for (const f of start) walk(f, depth)
  return seen
}

function listFiles(dir, pred, out = []) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listFiles(p, pred, out)
    else if (pred(p)) out.push(p)
  }
  return out
}

const rel = (root, f) => path.relative(root, f).split(path.sep).join("/")

function humanize(name) {
  return name.replace(/\.(tsx|ts)$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function apiPathsIn(src) {
  const out = new Set()
  for (const m of src.matchAll(/["'`](\/api\/[A-Za-z0-9/_\-\[\]]+)/g)) out.add(m[1].replace(/\/+$/, ""))
  return [...out]
}

function titlesIn(src) {
  const t = []
  for (const m of src.matchAll(/<h[1-4][^>]*>\s*([^<{][^<{]{2,60}?)\s*</g)) t.push(m[1].trim())
  for (const m of src.matchAll(/\btitle=["']([^"']{3,60})["']/g)) t.push(m[1].trim())
  return [...new Set(t)].slice(0, 4)
}

export function parseTabs(root) {
  const nav = read(path.join(SRC(root), "lib/nav.ts"))
  const block = nav.slice(nav.indexOf("ANALYTICS_GROUPS"), nav.indexOf("MANAGEMENT_GROUP"))
  const tabs = []
  let group = ""
  for (const line of block.split("\n")) {
    const g = line.match(/\{\s*label:\s*"([^"]+)",\s*items:/)
    if (g) { group = g[1]; continue }
    const m = line.match(/href:\s*"(\/analytics[^"]*)",\s*label:\s*"([^"]+)"/)
    if (m) tabs.push({ id: m[1] === "/analytics" ? "dashboard" : m[1].replace(/^\/analytics\//, ""), label: m[2], route: m[1], group })
  }
  return tabs
}

function pageDir(root, route) {
  const sub = route === "/analytics" ? "" : route.replace(/^\/analytics\//, "")
  return path.join(SRC(root), "app/(dashboard)/analytics", sub)
}

function apiRouteFile(root, apiPath) {
  const clean = apiPath.replace(/^\/api\//, "")
  const direct = path.join(SRC(root), "app/api", clean, "route.ts")
  if (exists(direct)) return direct
  // đường dẫn có tham số động: thử thay đoạn cuối bằng thư mục [..]
  const parts = clean.split("/")
  for (let i = parts.length - 1; i >= 1; i--) {
    const dir = path.join(SRC(root), "app/api", ...parts.slice(0, i))
    try {
      const dyn = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.startsWith("["))
      if (dyn) { const f = path.join(dir, dyn.name, ...parts.slice(i + 1), "route.ts"); if (exists(f)) return f }
    } catch { /* không có */ }
  }
  return null
}

function tablesFromSql(src) {
  const out = new Set()
  for (const m of src.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:public\.)?([a-z][a-z0-9_]{2,})/gi)) {
    const n = m[1].toLowerCase()
    if (!SQL_SKIP.has(n) && !n.endsWith("_")) out.add(n)
  }
  return out
}

const DENY_LIB = /src\/lib\/(analytics-helpers|supabase|turso|auth|perf-recorder|cron-alert|analytics-db|analytics-roles|memo|utils|quarterly-settings)(?![\w-])/
const INFRA = new Set(["analytics_query_cache", "perf_events", "sync_log"])
const INFRA_LIB_ONLY = new Set(["users", "app_settings", "notifications"])

function tursoSql(src) {
  const parts = []
  for (const m of src.matchAll(/tursoQuery\w*(?:<[^>]*>)?\(\s*(["'`])([\s\S]*?)\1/g)) parts.push(m[2])
  return parts.join("\n")
}

const EXTERNAL = [
  ["GA4", /analyticsdata|ga4/i], ["Search Console", /searchconsole|\bgsc\b/i], ["Lark", /larksuite|lark-api|\blark\w*Token/i],
  ["Gemini", /@google\/genai|generativelanguage|GEMINI_/], ["Google Workspace", /googleapis|drive\.google/i],
]

function scanApi(root, apiPath, file, supabaseTables) {
  const files = collect(root, [file], 2, (g) => rel(root, g).startsWith("src/lib/") && !DENY_LIB.test(rel(root, g)))
  const sources = new Map() // bảng → nguồn
  const externals = new Set()
  let cacheKey = null
  const deps = new Set()
  let usesTurso = false
  for (const [f, src] of files) {
    const turso = /@\/lib\/turso/.test(src)
    if (turso) usesTurso = true
    for (const m of src.matchAll(/\.from\(\s*["'`]([a-z][a-z0-9_]+)["'`]\s*\)/g)) sources.set(m[1], "supabase")
    const isRoute = f === file
    if (isRoute) {
      const ck = src.match(/cachedQuery(?:<[^>]*>)?\(\s*[`"']([A-Za-z0-9_\-]+)/)
      if (ck) cacheKey = ck[1]
      else {
        // khoá là biến: tìm `const <biến> = "tên..."` / `const <biến> = `tên:...``
        const id = src.match(/cachedQuery(?:<[^>]*>)?\(\s*([A-Za-z_]\w*)\s*,/)
        if (id) {
          const def = src.match(new RegExp("(?:const|let)\\s+" + id[1] + "\\s*=\\s*[`\"']([A-Za-z0-9_\\-]+)"))
          if (def) cacheKey = def[1]
          else {
            // khoá dạng `${HẰNG_SỐ}...` → đọc giá trị hằng số
            const pre = src.match(new RegExp("(?:const|let)\\s+" + id[1] + "\\s*=\\s*`\\$\\{([A-Za-z_]\\w*)\\}"))
            const cv = pre && [globalConsts(root).get(pre[1])].filter(Boolean).map((v) => [null, v])[0]
            if (cv) cacheKey = cv[1]
          }
        }
      }
      for (const d of src.matchAll(/\[\s*((?:["'][a-z0-9\-_]+["']\s*,?\s*)+)\]/g)) {
        if (/cachedQuery/.test(src)) for (const x of d[1].matchAll(/["']([a-z0-9\-_]+)["']/g)) deps.add(x[1])
      }
    }
    for (const n of tablesFromSql(tursoSql(src))) if (!sources.has(n)) sources.set(n, "turso")
    if (/queryAnalytics|cachedAnalyticsQuery|fact_|dim_/.test(src)) {
      for (const n of tablesFromSql(src)) {
        if (sources.has(n)) continue
        if (/^(fact|dim)_/.test(n)) sources.set(n, "gohub_dw")
        else if (supabaseTables.has(n)) sources.set(n, "supabase")
      }
    }
    if (!isRoute) for (const n of INFRA_LIB_ONLY) if (sources.get(n) === "supabase") sources.delete(n)
    for (const [label, re] of EXTERNAL) if (re.test(src)) externals.add(label)
  }
  if (/getAnalyticsSource|mainTable/.test([...files.values()].join("\n"))) {
    sources.set("fact_fulfillment_revenue", "gohub_dw"); sources.set("fact_sales_revenue", "gohub_dw")
  }
  const method = (read(file).match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g) ?? []).map((s) => s.split(/\s+/).pop())
  if (sources.size === 0) {
    // Route chỉ đọc/ghi cấu hình qua lib dùng chung (quarterly-settings, helper...) → bảng app_settings
    const shared = collect(root, [file], 2, (g) => rel(root, g).startsWith("src/lib/"))
    for (const [, src] of shared) if (/\.from\(\s*["'`]app_settings["'`]\s*\)/.test(src)) sources.set("app_settings", "supabase")
  }
  for (const n of INFRA) sources.delete(n)
  return {
    file: rel(root, file), methods: [...new Set(method)], cacheKey, deps: [...deps].sort(),
    tables: [...sources.entries()].map(([name, source]) => ({ name, source })).sort((a, b) => a.name.localeCompare(b.name)),
    external: [...externals].sort(), usesTurso,
  }
}

let _consts = null
function globalConsts(root) {
  if (_consts) return _consts
  _consts = new Map()
  const re = /export\s+const\s+([A-Z][A-Z0-9_]+)\s*=\s*["'`]([A-Za-z0-9_\-]+)/g
  for (const f of listFiles(path.join(SRC(root), "lib"), (x) => /\.ts$/.test(x))) for (const m of read(f).matchAll(re)) _consts.set(m[1], m[2])
  return _consts
}

function allSupabaseTables(root) {
  const set = new Set()
  for (const f of listFiles(SRC(root), (p) => /\.(ts|tsx)$/.test(p))) {
    for (const m of read(f).matchAll(/\.from\(\s*["'`]([a-z][a-z0-9_]+)["'`]\s*\)/g)) set.add(m[1])
  }
  return set
}

export function buildDataMap(root) {
  const overrides = JSON.parse(read(path.join(root, "scripts/datamap/overrides.json")) || "{}")
  const supabaseTables = allSupabaseTables(root)
  const tabs = parseTabs(root)
  const apiCache = new Map()
  const apis = {}

  const apiInfo = (p) => {
    if (apiCache.has(p)) return apiCache.get(p)
    const f = apiRouteFile(root, p)
    const info = f ? scanApi(root, p, f, supabaseTables) : null
    const ov = overrides.apis?.[p]
    if (info && ov?.tables) for (const t of ov.tables) if (!info.tables.some((x) => x.name === t.name)) info.tables.push(t)
    apiCache.set(p, info)
    if (info) apis[p] = info
    return info
  }

  const outTabs = tabs.map((tab) => {
    const dir = pageDir(root, tab.route)
    const pages = listFiles(dir, (p) => /page\.tsx$/.test(p) && (tab.route !== "/analytics" ? true : p === path.join(dir, "page.tsx")))
    const files = collect(root, pages, 3, (g) => {
      const r = rel(root, g)
      return r.startsWith("src/components/") || r.startsWith("src/app/(dashboard)/analytics/" + (tab.route === "/analytics" ? "" : tab.id))
    })
    const sections = []
    for (const [f, src] of files) {
      const used = apiPaths(src)
      const sqlTables = [...tablesFromSql(src)].filter((n) => /^(fact|dim)_/.test(n))
      if (used.length === 0 && sqlTables.length === 0) continue
      const titles = titlesIn(src)
      sections.push({
        id: rel(root, f), file: rel(root, f),
        label: titles.find((t) => t.length <= 32 && !/^(Bấm|Click|Nhấn)/i.test(t)) ?? humanize(path.basename(f)),
        titles,
        apis: used.filter((u) => apiInfo(u)),
        sqlViaQueryApi: sqlTables.map((name) => ({ name, source: "gohub_dw" })),
      })
    }
    const ov = overrides.tabs?.[tab.id]
    if (ov?.sections) sections.push(...ov.sections)
    return { ...tab, sections: sections.sort((a, b) => a.file.localeCompare(b.file)) }
  })

  function apiPaths(src) {
    return apiPathsIn(src).filter((p) => !/\/api\/(auth|user|track|heartbeat)/.test(p))
  }

  // chỉ mục bảng → API/Tab dùng nó
  const tables = {}
  const touch = (name, source) => (tables[name] ??= { source, apis: [], tabs: [] })
  for (const [p, a] of Object.entries(apis)) for (const t of a.tables) { const e = touch(t.name, t.source); if (!e.apis.includes(p)) e.apis.push(p) }
  for (const tab of outTabs) {
    for (const s of tab.sections) {
      for (const u of s.apis) for (const t of apis[u]?.tables ?? []) { const e = touch(t.name, t.source); if (!e.tabs.includes(tab.id)) e.tabs.push(tab.id) }
      for (const t of s.sqlViaQueryApi) { const e = touch(t.name, t.source); if (!e.tabs.includes(tab.id)) e.tabs.push(tab.id) }
    }
  }
  for (const k of Object.keys(tables)) { tables[k].apis.sort(); tables[k].tabs.sort() }

  return { tabs: outTabs, apis: Object.fromEntries(Object.entries(apis).sort(([a], [b]) => a.localeCompare(b))), tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))) }
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const root = process.cwd()
  const out = buildDataMap(root)
  const target = path.join(SRC(root), "lib/data-map.generated.json")
  fs.writeFileSync(target, JSON.stringify(out, null, 1) + "\n")
  console.log(`data-map: ${out.tabs.length} tab, ${Object.keys(out.apis).length} API, ${Object.keys(out.tables).length} bảng → ${rel(root, target)}`)
}
