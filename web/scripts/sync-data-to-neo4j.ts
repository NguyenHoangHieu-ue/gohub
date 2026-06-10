/**
 * Phase 1: Sync Supabase → Neo4j
 * Imports products, SKUs, countries from Supabase to Neo4j Aura
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load from .env.local in project root
const projectRoot = path.dirname(path.dirname(__dirname))
dotenv.config({ path: path.join(projectRoot, '.env.local') })

// Neo4j functions (inline for script compatibility)
import neo4j from 'neo4j-driver'

let driver: ReturnType<typeof neo4j.driver> | null = null

function getNeo4jDriver() {
  if (driver) return driver
  const uri = process.env.NEO4J_URI || 'neo4j+s://1481bc12.databases.neo4j.io'
  const user = process.env.NEO4J_USER || '1481bc12'
  const password = process.env.NEO4J_PASSWORD

  if (!password) throw new Error('NEO4J_PASSWORD not set')

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    encrypted: 'ENCRYPTION_ON',
  })
  return driver
}

async function runQuery(query: string, params: Record<string, any> = {}): Promise<any[]> {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    const result = await session.run(query, params)
    return result.records.map((record) => record.toObject())
  } finally {
    await session.close()
  }
}

async function createNode(label: string, properties: Record<string, any>): Promise<boolean> {
  const propsStr = Object.keys(properties)
    .map((k) => `${k}: $${k}`)
    .join(', ')
  const query = `CREATE (n:${label} {${propsStr}}) RETURN n`
  try {
    await runQuery(query, properties)
    return true
  } catch {
    return false
  }
}

async function createNodes(label: string, nodes: Array<Record<string, any>>): Promise<number> {
  let count = 0
  for (const node of nodes) {
    if (await createNode(label, node)) count++
  }
  return count
}

async function countNodes(label: string): Promise<number> {
  const result = await runQuery(`MATCH (n:${label}) RETURN count(n) as count`)
  return result[0]?.count || 0
}

async function closeDriver() {
  if (driver) {
    await driver.close()
    driver = null
  }
}

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

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
    created_at: p.created_at,
  }))

  const count = await createNodes('Product', nodes)
  console.log(`  ✓ Created ${count}/${products.length} Product nodes`)
  return count
}

async function syncSKUs() {
  console.log('\n🎯 Syncing SKUs...')

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  let allSKUs: any[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const { data: skus } = await sb
      .from('skus')
      .select('*')
      .range(offset, offset + limit - 1)

    if (!skus || skus.length === 0) break

    allSKUs.push(...skus)
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

async function runSync() {
  console.log('=' + '='.repeat(49))
  console.log('PHASE 1: Supabase → Neo4j Data Sync')
  console.log('=' + '='.repeat(49))

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

    // Verify
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
    await closeDriver()
  }
}

runSync()
