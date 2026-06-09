/**
 * Phase 1: Sync Supabase → Neo4j
 * Run with: node scripts/sync-to-neo4j.js
 */

const path = require('path')
const fs = require('fs')
const neo4j = require('neo4j-driver')
const { createClient } = require('@supabase/supabase-js')

// Load env from project root (.env.local)
let envPath = path.join(__dirname, '../../.env.local')
if (!fs.existsSync(envPath)) {
  envPath = path.join(__dirname, '../../.env')
}
require('dotenv').config({ path: envPath })

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j+s://1481bc12.databases.neo4j.io'
const NEO4J_USER = process.env.NEO4J_USER || '1481bc12'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

let driver = null

function getDriver() {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
  }
  return driver
}

async function runQuery(query, params = {}) {
  const driver = getDriver()
  const session = driver.session()
  try {
    const result = await session.run(query, params)
    return result.records.map((r) => r.toObject())
  } finally {
    await session.close()
  }
}

async function createNodes(label, nodes) {
  if (nodes.length === 0) return 0

  // Batch create - each node individually to get accurate count
  let count = 0
  const batchSize = 50

  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize)

    // Build Cypher: UNWIND nodes then CREATE/MATCH to avoid duplicates
    const query = `
      UNWIND $batch as props
      CREATE (n:${label})
      SET n += props
      RETURN count(n) as cnt
    `

    try {
      const result = await runQuery(query, { batch })
      count += result[0]?.cnt || 0
    } catch (e) {
      // Log first error only
      if (i === 0) {
        console.log(`  First batch error: ${e.message}`)
      }
    }
  }

  return count
}

async function countNodes(label) {
  const result = await runQuery(`MATCH (n:${label}) RETURN count(n) as count`)
  return result[0]?.count || 0
}

async function syncProducts() {
  console.log('\n📦 Syncing Products...')
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: products } = await sb.from('products').select('*')

  if (!products || products.length === 0) {
    console.log('  No products found')
    return 0
  }

  const nodes = products.map((p) => ({
    product_code: p.product_code,
    product_name: p.product_name,
    vendor_code: p.vendor_code,
    type_of_sim: p.type_of_sim,
  }))

  const count = await createNodes('Product', nodes)
  console.log(`  ✓ Created ${count}/${products.length} Product nodes`)
  return count
}

async function syncSKUs() {
  console.log('\n🎯 Syncing SKUs...')
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  let allSKUs = []
  let offset = 0
  const limit = 1000

  while (true) {
    const { data: skus } = await sb
      .from('skus')
      .select('*')
      .range(offset, offset + limit - 1)

    if (!skus || skus.length === 0) break

    allSKUs = allSKUs.concat(skus)
    offset += limit
    console.log(`  Fetched ${allSKUs.length} SKUs...`)
  }

  const nodes = allSKUs.map((s) => ({
    sku_code: s.sku_code,
    product_code: s.product_code,
    days: s.day_amount,
    data_gb: s.data_amount,
    status: s.status,
  }))

  const count = await createNodes('SKU', nodes)
  console.log(`  ✓ Created ${count}/${allSKUs.length} SKU nodes`)
  return count
}

async function syncCountries() {
  console.log('\n🌍 Syncing Countries...')
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: countries } = await sb.from('ref_countries').select('*')

  if (!countries || countries.length === 0) {
    console.log('  No countries found')
    return 0
  }

  const nodes = countries.map((c) => ({
    code: c.code,
    name: c.name,
    iso_code: c.iso_code,
  }))

  const count = await createNodes('Country', nodes)
  console.log(`  ✓ Created ${count}/${countries.length} Country nodes`)
  return count
}

async function createRelationships() {
  console.log('\n🔗 Creating Relationships...')

  const query = `
    MATCH (p:Product), (s:SKU)
    WHERE p.product_code = s.product_code
    CREATE (p)-[:HAS_SKU]->(s)
    RETURN count(*) as count
  `

  const result = await runQuery(query)
  const count = result[0]?.count || 0
  console.log(`  ✓ Created ${count} Product-[:HAS_SKU]->SKU relationships`)
  return count
}

async function main() {
  console.log('='.repeat(50))
  console.log('PHASE 1: Supabase → Neo4j Data Sync')
  console.log('='.repeat(50))

  try {
    const products = await syncProducts()
    const skus = await syncSKUs()
    const countries = await syncCountries()
    const rels = await createRelationships()

    console.log('\n' + '='.repeat(50))
    console.log('✓ SYNC COMPLETE')
    console.log('='.repeat(50))
    console.log(`Products:      ${products}`)
    console.log(`SKUs:          ${skus}`)
    console.log(`Countries:     ${countries}`)
    console.log(`Relationships: ${rels}`)
    console.log('='.repeat(50))

    console.log('\n📊 Verification:')
    const pCount = await countNodes('Product')
    const sCount = await countNodes('SKU')
    const cCount = await countNodes('Country')
    console.log(`  Products in DB: ${pCount}`)
    console.log(`  SKUs in DB: ${sCount}`)
    console.log(`  Countries in DB: ${cCount}`)
  } catch (error) {
    console.error('\n✗ SYNC FAILED:', error)
  } finally {
    if (driver) await driver.close()
  }
}

main()
