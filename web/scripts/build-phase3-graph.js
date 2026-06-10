/**
 * Phase 3: Thêm tất cả COVERS_GROUP relationships từ products.supported_countries
 *
 * Phase 2 chỉ tạo 1 COVERS_GROUP/product (từ product_code[2:5]).
 * supported_countries có thể chứa NHIỀU group codes hơn — Phase 3 thêm tất cả.
 *
 * Run sau build-neo4j-graph.js:
 *   cd web && node scripts/build-phase3-graph.js
 */

const path  = require('path')
const fs    = require('fs')
const neo4j = require('neo4j-driver')
const { createClient } = require('@supabase/supabase-js')

// ── Env ──────────────────────────────────────────────────────────────────────
const envPath = [
  path.join(__dirname, '../../.env.local'),
  path.join(__dirname, '../../.env'),
].find(fs.existsSync)
require('dotenv').config({ path: envPath })

const NEO4J_URI  = process.env.NEO4J_URI      || 'neo4j+s://1481bc12.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER     || '1481bc12'
const NEO4J_PASS = process.env.NEO4J_PASSWORD
const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY

if (!NEO4J_PASS || !SB_URL || !SB_KEY) {
  console.error('Missing env variables')
  process.exit(1)
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS))
const sb     = createClient(SB_URL, SB_KEY)

async function run(query, params = {}) {
  const s = driver.session()
  try {
    const r = await s.run(query, params)
    return r.records.map(rec => rec.toObject())
  } finally { await s.close() }
}

async function fetchAll(table, select, filters = []) {
  const rows = []
  for (let off = 0; ; off += 1000) {
    let q = sb.from(table).select(select).range(off, off + 999)
    for (const [col, val] of filters) q = q.eq(col, val)
    const { data, error } = await q
    if (error) { console.error(`[fetchAll] ${table}:`, error.message); break }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

function chunks(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Step 1: COVERS (Product → Country) từ supported_countries ────────────────
// supported_countries = ISO 2-letter codes (JP, KR, GB...)
// Country nodes trong Neo4j cũng dùng ISO 2-letter từ ref_countries

async function buildCoversCountry() {
  console.log('\n▶ Step 1: (Product)-[:COVERS]->(Country) từ supported_countries...')
  const rows = await fetchAll('products', 'product_code,supported_countries')

  const edges = []
  for (const r of rows) {
    if (!r.supported_countries) continue
    const codes = r.supported_countries
      .split(/[\s,;]+/).map(c => c.trim().toUpperCase()).filter(c => c.length === 2)
    for (const iso of codes) {
      edges.push({ product_code: r.product_code, iso_code: iso })
    }
  }

  console.log(`  ${edges.length} edges (products × countries)`)
  if (!edges.length) { console.log('  (skip — no data)'); return }

  let done = 0
  for (const batch of chunks(edges, 200)) {
    await run(
      `UNWIND $batch AS e
       MATCH (p:Product {product_code: e.product_code})
       MATCH (c:Country  {code: e.iso_code})
       MERGE (p)-[:COVERS]->(c)`,
      { batch }
    )
    done += batch.length
    process.stdout.write(`  ${done}/${edges.length}\r`)
  }
  console.log(`\n  ✓ COVERS relationships`)
}

// ── Step 2: Tạo Product indexes ───────────────────────────────────────────────

async function createIndexes() {
  console.log('\n▶ Step 2: Tạo indexes tìm kiếm...')
  const queries = [
    'CREATE INDEX product_code_idx IF NOT EXISTS FOR (p:Product) ON (p.product_code)',
    'CREATE INDEX sku_code_idx     IF NOT EXISTS FOR (s:SKU)     ON (s.sku_code)',
    'CREATE INDEX country_code_idx IF NOT EXISTS FOR (c:Country) ON (c.code)',
    'CREATE INDEX country_name_idx IF NOT EXISTS FOR (c:Country) ON (c.name)',
    'CREATE INDEX cg_code_idx      IF NOT EXISTS FOR (g:CountryGroup) ON (g.code)',
  ]
  for (const q of queries) {
    try { await run(q); console.log(`  ✓ ${q.match(/INDEX (\w+)/)?.[1]}`) }
    catch (e) { console.log(`  (skip) ${e.message.slice(0, 60)}`) }
  }
}

// ── Step 3: Verify ────────────────────────────────────────────────────────────

async function verify() {
  console.log('\n▶ Verify...')

  const [r1] = await run('MATCH ()-[r:COVERS]->() RETURN count(r) AS cnt')
  console.log(`  COVERS total: ${r1.cnt}`)
  const [r2] = await run('MATCH ()-[r:COVERS_GROUP]->() RETURN count(r) AS cnt')
  console.log(`  COVERS_GROUP total: ${r2.cnt}`)

  // Japan via COVERS (direct ISO link)
  const jpDirect = await run(`
    MATCH (p:Product)-[:COVERS]->(c:Country {code: 'JP'})
    MATCH (p)-[:HAS_SKU]->(s:SKU)
    RETURN count(DISTINCT s) AS cnt
  `)
  console.log(`  SKUs Japan (COVERS direct): ${jpDirect[0]?.cnt ?? 0}`)

  // UK via both paths
  const ukDirect = await run(`
    MATCH (p:Product)-[:COVERS]->(c:Country {code: 'GB'})
    MATCH (p)-[:HAS_SKU]->(s:SKU)
    RETURN count(DISTINCT s) AS cnt
  `)
  console.log(`  SKUs UK (COVERS direct): ${ukDirect[0]?.cnt ?? 0}`)

  // Japan via CountryGroup chain
  const jpGroup = await run(`
    MATCH (g:CountryGroup)-[:INCLUDES]->(c:Country {code: 'JP'})
    MATCH (p:Product)-[:COVERS_GROUP]->(g)
    MATCH (p)-[:HAS_SKU]->(s:SKU)
    RETURN count(DISTINCT s) AS cnt
  `)
  console.log(`  SKUs Japan (COVERS_GROUP chain): ${jpGroup[0]?.cnt ?? 0}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Build Phase 3 Graph ===')
  try {
    await buildCoversCountry()
    await createIndexes()
    await verify()
    console.log('\n✅ Phase 3 graph complete!')
  } catch (err) {
    console.error('\n❌ Error:', err.message)
    process.exit(1)
  } finally {
    await driver.close()
  }
}

main()
