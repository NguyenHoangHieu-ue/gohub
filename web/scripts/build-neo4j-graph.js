/**
 * Phase 2: Build Neo4j graph relationships
 * Creates Country, CountryGroup, Listing nodes and all relationships.
 * Run ONCE before embed-skus.js:
 *   cd web && node scripts/build-neo4j-graph.js
 */

const path   = require('path')
const fs     = require('fs')
const neo4j  = require('neo4j-driver')
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
  console.error('Missing env: NEO4J_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS))
const sb     = createClient(SB_URL, SB_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function mergeNodes(label, keyProp, rows) {
  let done = 0
  for (const batch of chunks(rows, 100)) {
    await run(
      `UNWIND $batch AS p
       MERGE (n:${label} {${keyProp}: p.${keyProp}})
       SET n += p`,
      { batch }
    )
    done += batch.length
  }
  return done
}

// ── Step 1: Country nodes ──────────────────────────────────────────────────────

async function buildCountries() {
  console.log('\n▶ Step 1: Country nodes (ref_countries)...')
  const rows = await fetchAll('ref_countries', 'code,name')
  const nodes = rows.map(r => ({ code: r.code, name: r.name ?? r.code }))
  const n = await mergeNodes('Country', 'code', nodes)
  console.log(`  ✓ ${n} Country nodes`)
}

// ── Step 2: CountryGroup nodes ─────────────────────────────────────────────────

async function buildCountryGroups() {
  console.log('\n▶ Step 2: CountryGroup nodes (ref_support_countries)...')
  const rows = await fetchAll('ref_support_countries', 'code,support_country,country_codes')
  const nodes = rows.map(r => ({
    code:         r.code,
    description:  r.support_country ?? r.code,
    country_codes: r.country_codes ?? '',
  }))
  const n = await mergeNodes('CountryGroup', 'code', nodes)
  console.log(`  ✓ ${n} CountryGroup nodes`)
  return rows  // return for relationship building
}

// ── Step 3: CountryGroup -[:INCLUDES]-> Country ────────────────────────────────

async function buildGroupIncludes(groups) {
  console.log('\n▶ Step 3: CountryGroup-[:INCLUDES]->Country...')
  let count = 0
  for (const batch of chunks(groups, 50)) {
    // Build edges: [{group_code, iso_code}, ...]
    const edges = []
    for (const g of batch) {
      if (!g.country_codes) continue
      for (const iso of g.country_codes.split(/[\s,;|/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)) {
        edges.push({ group_code: g.code, iso_code: iso })
      }
    }
    if (!edges.length) continue
    await run(
      `UNWIND $edges AS e
       MATCH (g:CountryGroup {code: e.group_code})
       MATCH (c:Country      {code: e.iso_code})
       MERGE (g)-[:INCLUDES]->(c)`,
      { edges }
    )
    count += edges.length
  }
  console.log(`  ✓ ${count} INCLUDES relationships`)
}

// ── Step 4: Enrich Product nodes + COVERS_GROUP ────────────────────────────────

async function buildProductRelationships() {
  console.log('\n▶ Step 4: Enrich Products + COVERS_GROUP...')
  const rows = await fetchAll(
    'products',
    'product_code,type_of_sim,vendor_code,kyc_needed,call,note,network_type,hotspot',
    [['status', 'Active']]
  )

  let enriched = 0
  for (const batch of chunks(rows, 100)) {
    const props = batch.map(r => ({
      product_code:   r.product_code,
      type_of_sim:    r.type_of_sim    ?? null,
      vendor_code:    r.vendor_code    ?? null,
      kyc_needed:     r.kyc_needed     ?? null,
      call:           r.call           ?? null,
      note:           r.note           ?? null,
      network_type:   r.network_type   ?? null,
      hotspot:        r.hotspot        ?? null,
      // country_group = chars 2-4 (0-indexed) of product_code
      country_group:  r.product_code?.slice(2, 5) ?? null,
    }))

    await run(
      `UNWIND $props AS p
       MATCH (prod:Product {product_code: p.product_code})
       SET prod.type_of_sim  = p.type_of_sim,
           prod.vendor_code  = p.vendor_code,
           prod.kyc_needed   = p.kyc_needed,
           prod.call         = p.call,
           prod.note         = p.note,
           prod.network_type = p.network_type,
           prod.hotspot      = p.hotspot
       WITH prod, p
       WHERE p.country_group IS NOT NULL
       MATCH (g:CountryGroup {code: p.country_group})
       MERGE (prod)-[:COVERS_GROUP]->(g)`,
      { props }
    )
    enriched += batch.length
  }
  console.log(`  ✓ ${enriched} Products enriched + COVERS_GROUP set`)
}

// ── Step 5: Listing nodes + HAS_LISTING ───────────────────────────────────────

async function buildListings() {
  console.log('\n▶ Step 5: Listing nodes + HAS_LISTING...')
  const rows = await fetchAll(
    'listings',
    'listing_code,reference_product_code,listing_name_vn,listing_name_en,data_type_en,network_type,apn,status,tenant',
    [['status', 'Active']]
  )

  let done = 0
  for (const batch of chunks(rows, 100)) {
    const nodes = batch.map(r => ({
      listing_code:  r.listing_code,
      product_code:  r.reference_product_code,
      name_vn:       r.listing_name_vn  ?? null,
      name_en:       r.listing_name_en  ?? null,
      data_type:     r.data_type_en     ?? null,
      network_type:  r.network_type     ?? null,
      apn:           r.apn              ?? null,
      status:        r.status           ?? 'Active',
      tenant:        r.tenant           ?? null,
    }))

    await run(
      `UNWIND $nodes AS n
       MERGE (l:Listing {listing_code: n.listing_code})
       SET l += n
       WITH l, n
       MATCH (p:Product {product_code: n.product_code})
       MERGE (p)-[:HAS_LISTING]->(l)`,
      { nodes }
    )
    done += batch.length
  }
  console.log(`  ✓ ${done} Listing nodes + HAS_LISTING`)
}

// ── Verify ────────────────────────────────────────────────────────────────────

async function verify() {
  console.log('\n▶ Verify...')
  const counts = await run(`
    MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC
  `)
  for (const row of counts) console.log(`  ${row.label}: ${row.cnt}`)

  const rels = await run(`
    MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS cnt ORDER BY cnt DESC
  `)
  for (const r of rels) console.log(`  [:${r.type}]: ${r.cnt}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Build Neo4j Graph (Phase 2) ===')
  console.log(`Neo4j: ${NEO4J_URI}`)
  console.log(`Supabase: ${SB_URL}\n`)

  try {
    await buildCountries()
    const groups = await buildCountryGroups()
    await buildGroupIncludes(groups)
    await buildProductRelationships()
    await buildListings()
    await verify()
    console.log('\n✅ Graph build complete!')
  } catch (err) {
    console.error('\n❌ Error:', err.message)
    process.exit(1)
  } finally {
    await driver.close()
  }
}

main()
