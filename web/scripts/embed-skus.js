/**
 * Phase 2: Generate Gemini embeddings for SKUs → store in Neo4j
 * Run AFTER build-neo4j-graph.js:
 *   cd web && node scripts/embed-skus.js
 *
 * Rate limit: Gemini gemini-embedding-001 = 1500 QPM free tier
 * Strategy: sequential batches of 5, 250ms delay → ~1200 QPM, ~9 min for 11k SKUs
 * Resume: skips SKUs that already have embeddings (MERGE + WHERE NOT exists)
 */

const path   = require('path')
const fs     = require('fs')
const neo4j  = require('neo4j-driver')
const { createClient } = require('@supabase/supabase-js')
const { GoogleGenerativeAI } = require('@google/generative-ai')

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
const GEMINI_KEY = process.env.GEMINI_KEY

if (!NEO4J_PASS || !SB_URL || !SB_KEY || !GEMINI_KEY) {
  console.error('Missing env: NEO4J_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY / GEMINI_KEY')
  process.exit(1)
}

const driver  = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS))
const sb      = createClient(SB_URL, SB_KEY)
const genAI   = new GoogleGenerativeAI(GEMINI_KEY)
const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

const BATCH_SIZE   = 5     // concurrent Gemini calls per batch
const BATCH_DELAY  = 250   // ms between batches
const WRITE_EVERY  = 100   // write Neo4j every N embeddings
const MIN_SCORE    = 0.65  // vector search threshold (used in API)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runNeo4j(query, params = {}) {
  const s = driver.session()
  try {
    const r = await s.run(query, params)
    return r.records.map(rec => rec.toObject())
  } finally { await s.close() }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Fetch all rows from Supabase bypassing 1000-row cap
async function fetchAll(table, select, filters = []) {
  const rows = []
  for (let off = 0; ; off += 1000) {
    let q = sb.from(table).select(select).range(off, off + 999)
    for (const [col, val] of filters) q = q.eq(col, val)
    const { data, error } = await q
    if (error) { console.error(`[fetchAll]`, error.message); break }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

// ── Build embedding text ──────────────────────────────────────────────────────

function buildEmbedText(sku, groupDesc) {
  const country = groupDesc || sku.country_group || ''

  const data = (sku.is_unlimited || (sku.data_amount ?? 0) >= 9999)
    ? 'Unlimited'
    : sku.data_amount != null
      ? `${sku.data_amount}${sku.data_amount_unit || 'GB'}${sku.is_daily ? ' daily' : ''}`
      : 'data'

  const parts = [
    country,
    `${sku.day_amount} ngày`,
    data,
    sku.sim_esim || '',
    sku.vendor_code || '',
    sku.throttle_speed   ? `throttle:${sku.throttle_speed}`   : '',
    sku.call === 'Yes'   ? 'có gọi điện'
      : sku.call === 'No' ? 'không gọi điện' : '',
    sku.kyc_needed === 'Yes' ? 'cần KYC' : 'không cần KYC',
    sku.hotspot === 'Yes' ? 'có hotspot' : '',
    sku.network_type || '',
    sku.note ? sku.note.slice(0, 80) : '',
  ].filter(Boolean)

  return parts.join(' | ')
}

// ── Create vector index ───────────────────────────────────────────────────────

async function ensureVectorIndex() {
  console.log('▶ Creating vector index sku_embedding (768 dims, cosine)...')
  try {
    await runNeo4j(`
      CREATE VECTOR INDEX sku_embedding IF NOT EXISTS
      FOR (s:SKU) ON (s.embedding)
      OPTIONS { indexConfig: {
        \`vector.dimensions\`: 3072,
        \`vector.similarity_function\`: 'cosine'
      }}
    `)
    console.log('  ✓ Index ready')
  } catch (err) {
    // Index may already exist — not an error
    console.log('  ✓ Index already exists:', err.message.slice(0, 60))
  }
}

// ── Find SKUs that still need embeddings ──────────────────────────────────────

async function getSkusWithoutEmbedding() {
  const records = await runNeo4j(`
    MATCH (s:SKU)
    WHERE s.embedding IS NULL
    RETURN s.sku_code AS sku_code
  `)
  return records.map(r => r.sku_code).filter(Boolean)
}

// ── Write batch of {sku_code, embedding} to Neo4j ────────────────────────────

async function writeEmbeddings(batch) {
  await runNeo4j(
    `UNWIND $batch AS item
     MATCH (s:SKU {sku_code: item.sku_code})
     CALL db.create.setNodeVectorProperty(s, 'embedding', item.embedding)`,
    { batch }
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Embed SKUs (Phase 2) ===')
  console.log(`Gemini: gemini-embedding-001 | Neo4j: ${NEO4J_URI}\n`)

  // 1. Ensure vector index exists
  await ensureVectorIndex()

  // 2. Load ref data for country group descriptions
  console.log('\n▶ Loading ref data...')
  const refGroups = await fetchAll('ref_support_countries', 'code,support_country')
  const groupDesc = {}
  for (const g of refGroups) groupDesc[g.code] = g.support_country ?? g.code
  console.log(`  ${refGroups.length} country groups loaded`)

  // 3. Fetch all active SKUs from sku_catalog
  console.log('\n▶ Fetching active SKUs from sku_catalog...')
  const allSkus = await fetchAll(
    'sku_catalog',
    'sku_code,product_code,country_group,sim_esim,data_amount,data_amount_unit,is_unlimited,day_amount,throttle_speed,call,kyc_needed,hotspot,network_type,note',
    [['status', 'Active']]
  )
  // Derive vendor_code from product_code[5:7], is_daily from data_policy char (sku_code[7])
  const DAILY_POLICIES = new Set(['A', 'B', 'P', 'Z'])
  for (const s of allSkus) {
    s.vendor_code = s.product_code?.slice(5, 7) ?? ''
    s.is_daily    = DAILY_POLICIES.has(s.sku_code?.[7] ?? '')
  }
  console.log(`  ${allSkus.length} active SKUs total`)

  // 4. Find which SKUs still need embeddings
  console.log('\n▶ Checking which SKUs already have embeddings...')
  const needEmbedding = await getSkusWithoutEmbedding()
  const needSet = new Set(needEmbedding)
  const todo = allSkus.filter(s => needSet.has(s.sku_code))
  console.log(`  ${todo.length} SKUs need embedding (${allSkus.length - todo.length} already done)`)

  if (todo.length === 0) {
    console.log('\n✅ All SKUs already embedded!')
    await driver.close()
    return
  }

  // 5. Embed in batches
  console.log(`\n▶ Embedding ${todo.length} SKUs (batch=${BATCH_SIZE}, delay=${BATCH_DELAY}ms)...`)
  console.log('  Estimated time: ~' + Math.ceil(todo.length * 50 / 1000 / 60) + ' minutes\n')

  let done = 0
  let errors = 0
  const writeBuffer = []

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE)

    // Embed batch concurrently
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

    // Flush to Neo4j every WRITE_EVERY embeddings
    if (writeBuffer.length >= WRITE_EVERY) {
      await writeEmbeddings(writeBuffer.splice(0))
      const pct = ((done / todo.length) * 100).toFixed(1)
      process.stdout.write(`  ${done}/${todo.length} (${pct}%) — ${errors} errors\r`)
    }

    await sleep(BATCH_DELAY)
  }

  // Final flush
  if (writeBuffer.length) await writeEmbeddings(writeBuffer.splice(0))

  console.log(`\n\n  ✓ Done: ${done} embedded, ${errors} errors`)

  // 6. Verify
  const remaining = await getSkusWithoutEmbedding()
  console.log(`\n▶ Verify: ${remaining.length} SKUs still without embedding`)
  console.log('\n✅ Embedding complete!')
  await driver.close()
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message)
  driver.close().then(() => process.exit(1))
})
