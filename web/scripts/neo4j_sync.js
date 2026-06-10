/**
 * Phase 4: Daily incremental Neo4j sync
 * Runs after sync.py (Supabase already up-to-date).
 *
 * Steps:
 *   1. Upsert Product nodes (Active)
 *   2. Upsert SKU nodes + HAS_SKU relationships (sku_catalog, Active)
 *   3. Embed new SKUs (Gemini gemini-embedding-001 for those without embeddings)
 *   4. Health check: compare counts Neo4j vs Supabase
 *
 * Usage:
 *   cd web && node scripts/neo4j_sync.js
 *
 * GitHub Actions: triggered via neo4j_sync.yml after sync.yml completes.
 * Secrets needed: NEO4J_PASSWORD, GEMINI_KEY (+ existing SUPABASE_URL, SUPABASE_SERVICE_KEY)
 */

const path  = require('path')
const fs    = require('fs')
const neo4j = require('neo4j-driver')
const { createClient }       = require('@supabase/supabase-js')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ── Env ───────────────────────────────────────────────────────────────────────

const envPath = [
  path.join(__dirname, '../../.env.local'),
  path.join(__dirname, '../../.env'),
].find(fs.existsSync)
if (envPath) require('dotenv').config({ path: envPath })

const NEO4J_URI  = process.env.NEO4J_URI      || 'neo4j+s://1481bc12.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER     || '1481bc12'
const NEO4J_PASS = process.env.NEO4J_PASSWORD
// GitHub Actions exposes SUPABASE_URL; local .env.local uses NEXT_PUBLIC_SUPABASE_URL
const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY
const GEMINI_KEY = process.env.GEMINI_KEY

if (!NEO4J_PASS || !SB_URL || !SB_KEY) {
  console.error('Missing required env: NEO4J_PASSWORD / SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}
if (!GEMINI_KEY) {
  console.warn('[WARN] GEMINI_KEY not set — new SKUs will NOT be embedded')
}

const driver     = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS))
const sb         = createClient(SB_URL, SB_KEY)
const embedModel = GEMINI_KEY
  ? new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({ model: 'gemini-embedding-001' })
  : null

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBED_BATCH_SIZE  = 5
const EMBED_BATCH_DELAY = 250   // ms — stay under 1500 QPM
const EMBED_WRITE_EVERY = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runNeo4j(query, params = {}) {
  const s = driver.session()
  try {
    const r = await s.run(query, params)
    return r.records.map(rec => rec.toObject())
  } finally {
    await s.close()
  }
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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Step 1: Upsert Product nodes ──────────────────────────────────────────────

async function syncProducts() {
  console.log('\n▶ Step 1: Upsert Product nodes...')
  const rows = await fetchAll(
    'products',
    'product_code,type_of_sim,vendor_code,kyc_needed,note,network_type,hotspot,status,supported_countries',
    [['status', 'Active']]
  )

  let done = 0
  for (const batch of chunks(rows, 100)) {
    const props = batch.map(r => ({
      product_code:        r.product_code,
      type_of_sim:         r.type_of_sim         ?? null,
      vendor_code:         r.vendor_code          ?? null,
      kyc_needed:          r.kyc_needed           ?? null,
      note:                r.note                 ?? null,
      network_type:        r.network_type         ?? null,
      hotspot:             r.hotspot              ?? null,
      status:              r.status               ?? 'Active',
      country_group:       r.product_code?.slice(2, 5) ?? null,
    }))

    await runNeo4j(
      `UNWIND $props AS p
       MERGE (n:Product {product_code: p.product_code})
       SET n += p`,
      { props }
    )
    done += batch.length
  }
  console.log(`  ✓ ${done} Product nodes upserted`)
  return rows.length
}

// ── Step 2: Upsert SKU nodes + HAS_SKU relationships ─────────────────────────

async function syncSkus() {
  console.log('\n▶ Step 2: Upsert SKU nodes + HAS_SKU...')
  const rows = await fetchAll(
    'sku_catalog',
    'sku_code,product_code,tenant,status,sim_esim,product_type,country_group,' +
    'data_amount,data_amount_unit,is_unlimited,day_amount,throttle_speed,' +
    'call,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note',
    [['status', 'Active']]
  )

  const DAILY_POLICIES = new Set(['A', 'B', 'P', 'Z'])
  let done = 0

  for (const batch of chunks(rows, 100)) {
    const nodes = batch.map(r => ({
      sku_code:             r.sku_code,
      product_code:         r.product_code         ?? null,
      tenant:               r.tenant               ?? null,
      status:               r.status               ?? 'Active',
      sim_esim:             r.sim_esim             ?? null,
      product_type:         r.product_type         ?? null,
      country_group:        r.country_group        ?? r.sku_code?.slice(2, 5) ?? null,
      data_amount:          r.data_amount          ?? null,
      data_amount_unit:     r.data_amount_unit     ?? null,
      is_unlimited:         r.is_unlimited         ?? false,
      is_daily:             DAILY_POLICIES.has(r.sku_code?.[7] ?? ''),
      day_amount:           r.day_amount           ?? null,
      throttle_speed:       r.throttle_speed       ?? null,
      call:                 r.call                 ?? null,
      hotspot:              r.hotspot              ?? null,
      kyc_needed:           r.kyc_needed           ?? null,
      network_type:         r.network_type         ?? null,
      vendor_sku:           r.vendor_sku           ?? null,
      vendor_code:          r.product_code?.slice(5, 7) ?? null,
      latest_cogs:          r.latest_cogs          ?? null,
      latest_cogs_currency: r.latest_cogs_currency ?? null,
      note:                 r.note                 ?? null,
    }))

    await runNeo4j(
      `UNWIND $nodes AS n
       MERGE (s:SKU {sku_code: n.sku_code})
       SET s += n
       WITH s, n
       WHERE n.product_code IS NOT NULL
       MATCH (p:Product {product_code: n.product_code})
       MERGE (p)-[:HAS_SKU]->(s)`,
      { nodes }
    )
    done += batch.length
    if (done % 500 === 0) process.stdout.write(`  ${done}/${rows.length}\r`)
  }
  console.log(`  ✓ ${done} SKU nodes upserted + HAS_SKU set`)
  return rows
}

// ── Step 3: Embed new SKUs ────────────────────────────────────────────────────

function buildEmbedText(sku, groupDesc) {
  const country = groupDesc || sku.country_group || ''
  const data = sku.is_unlimited || (sku.data_amount ?? 0) >= 9999
    ? 'Unlimited'
    : sku.data_amount != null
      ? `${sku.data_amount}${sku.data_amount_unit || 'GB'}${sku.is_daily ? ' daily' : ''}`
      : 'data'

  return [
    country,
    `${sku.day_amount} ngày`,
    data,
    sku.sim_esim || '',
    sku.vendor_code || '',
    sku.throttle_speed   ? `throttle:${sku.throttle_speed}`   : '',
    sku.call === 'Yes'   ? 'có gọi điện' : sku.call === 'No' ? 'không gọi điện' : '',
    sku.kyc_needed === 'Yes' ? 'cần KYC' : 'không cần KYC',
    sku.hotspot === 'Yes' ? 'có hotspot' : '',
    sku.network_type || '',
    sku.note ? sku.note.slice(0, 80) : '',
  ].filter(Boolean).join(' | ')
}

async function embedNewSkus(allSkus) {
  if (!embedModel) {
    console.log('\n▶ Step 3: Skip embedding (no GEMINI_KEY)')
    return 0
  }

  console.log('\n▶ Step 3: Embed new SKUs...')

  // Find SKUs without embeddings in Neo4j
  const records = await runNeo4j('MATCH (s:SKU) WHERE s.embedding IS NULL RETURN s.sku_code AS sku_code')
  const needSet = new Set(records.map(r => r.sku_code).filter(Boolean))

  const todo = allSkus.filter(s => needSet.has(s.sku_code))
  console.log(`  ${todo.length} new SKUs need embedding`)

  if (todo.length === 0) {
    console.log('  ✓ All SKUs already embedded')
    return 0
  }

  // Load group descriptions for embed text
  const refGroups = await fetchAll('ref_support_countries', 'code,support_country')
  const groupDesc = {}
  for (const g of refGroups) groupDesc[g.code] = g.support_country ?? g.code

  let done = 0
  let errors = 0
  const writeBuffer = []

  for (let i = 0; i < todo.length; i += EMBED_BATCH_SIZE) {
    const batch = todo.slice(i, i + EMBED_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async sku => {
        const text = buildEmbedText(sku, groupDesc[sku.country_group])
        const result = await embedModel.embedContent(text)
        return { sku_code: sku.sku_code, embedding: result.embedding.values }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        writeBuffer.push(r.value)
        done++
      } else {
        errors++
        console.error('  Embed error:', r.reason?.message?.slice(0, 80))
      }
    }

    if (writeBuffer.length >= EMBED_WRITE_EVERY) {
      await runNeo4j(
        `UNWIND $batch AS item
         MATCH (s:SKU {sku_code: item.sku_code})
         CALL db.create.setNodeVectorProperty(s, 'embedding', item.embedding)`,
        { batch: writeBuffer.splice(0) }
      )
      process.stdout.write(`  ${done}/${todo.length}\r`)
    }

    await sleep(EMBED_BATCH_DELAY)
  }

  if (writeBuffer.length) {
    await runNeo4j(
      `UNWIND $batch AS item
       MATCH (s:SKU {sku_code: item.sku_code})
       CALL db.create.setNodeVectorProperty(s, 'embedding', item.embedding)`,
      { batch: writeBuffer.splice(0) }
    )
  }

  console.log(`  ✓ ${done} embedded, ${errors} errors`)
  return done
}

// ── Step 4: Health check ──────────────────────────────────────────────────────

async function healthCheck(sbProductCount, sbSkuCount) {
  console.log('\n▶ Step 4: Health check...')

  const [neo4jProducts] = await runNeo4j('MATCH (p:Product) RETURN count(p) AS cnt')
  const [neo4jSkus]     = await runNeo4j('MATCH (s:SKU) RETURN count(s) AS cnt')
  const [withEmbed]     = await runNeo4j('MATCH (s:SKU) WHERE s.embedding IS NOT NULL RETURN count(s) AS cnt')

  const pOk = neo4jProducts.cnt >= sbProductCount * 0.95
  const sOk = neo4jSkus.cnt >= sbSkuCount * 0.95

  console.log(`  Products — Supabase: ${sbProductCount}  Neo4j: ${neo4jProducts.cnt}  ${pOk ? '✓' : '⚠️ MISMATCH'}`)
  console.log(`  SKUs     — Supabase: ${sbSkuCount}  Neo4j: ${neo4jSkus.cnt}  ${sOk ? '✓' : '⚠️ MISMATCH'}`)
  console.log(`  Embeddings: ${withEmbed.cnt} / ${neo4jSkus.cnt} SKUs`)

  if (!pOk || !sOk) {
    console.warn('\n  ⚠️  Count mismatch > 5% — may need a full rebuild')
  } else {
    console.log('\n  ✓ Counts look good')
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now()
  console.log('=== Neo4j Daily Sync (Phase 4) ===')
  console.log(`Neo4j: ${NEO4J_URI}`)
  console.log(`Supabase: ${SB_URL}\n`)

  try {
    const productCount = await syncProducts()
    const allSkus      = await syncSkus()
    await embedNewSkus(allSkus)
    await healthCheck(productCount, allSkus.length)

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n✅ Neo4j sync complete in ${elapsed}s`)
  } catch (err) {
    console.error('\n❌ Fatal:', err.message)
    process.exit(1)
  } finally {
    await driver.close()
  }
}

main()
