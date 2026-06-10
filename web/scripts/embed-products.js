/**
 * Phase 2: Add Gemini embeddings to Neo4j Product nodes
 * Run: node scripts/embed-products.js
 *
 * - Embeds product_name + vendor_code + type_of_sim text
 * - Stores embedding vector on each Product node
 * - Creates Neo4j vector index for similarity search
 */

const path = require('path')
const fs   = require('fs')
const neo4j = require('neo4j-driver')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// Load env
let envPath = path.join(__dirname, '../../.env.local')
if (!fs.existsSync(envPath)) envPath = path.join(__dirname, '../../.env')
require('dotenv').config({ path: envPath })

const NEO4J_URI      = process.env.NEO4J_URI      || 'neo4j+s://1481bc12.databases.neo4j.io'
const NEO4J_USER     = process.env.NEO4J_USER     || '1481bc12'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD
const GEMINI_KEY     = process.env.GEMINI_KEY

if (!NEO4J_PASSWORD) throw new Error('NEO4J_PASSWORD not set')
if (!GEMINI_KEY)     throw new Error('GEMINI_KEY not set')

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))
const genAI  = new GoogleGenerativeAI(GEMINI_KEY)

async function runQuery(query, params = {}) {
  const session = driver.session()
  try {
    const result = await session.run(query, params)
    return result.records.map(r => r.toObject())
  } finally {
    await session.close()
  }
}

// Gemini text-embedding-004 — 768 dimensions
async function embedText(text) {
  const model  = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  return result.embedding.values
}

// Batch embed với rate limit (5 req/s cho Gemini Embedding)
async function embedBatch(texts) {
  const results = []
  for (const text of texts) {
    const vec = await embedText(text)
    results.push(vec)
    await new Promise(r => setTimeout(r, 220)) // ~4.5 req/s
  }
  return results
}

async function createVectorIndex() {
  console.log('\n📐 Creating Neo4j vector index...')
  try {
    await runQuery(`
      CREATE VECTOR INDEX product_embeddings IF NOT EXISTS
      FOR (p:Product) ON (p.embedding)
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: 768,
          \`vector.similarity_function\`: 'cosine'
        }
      }
    `)
    console.log('  ✓ Vector index created (or already exists)')
  } catch (e) {
    console.log(`  ⚠ Vector index: ${e.message}`)
  }
}

async function embedAllProducts() {
  console.log('\n🔍 Fetching products from Neo4j...')
  const products = await runQuery(`
    MATCH (p:Product)
    WHERE p.embedding IS NULL
    RETURN p.product_code AS code, p.product_name AS name,
           p.vendor_code AS vendor, p.type_of_sim AS sim_type
  `)

  console.log(`  Found ${products.length} products without embeddings`)
  if (products.length === 0) {
    console.log('  ✓ All products already embedded')
    return 0
  }

  const BATCH = 20
  let embedded = 0

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)
    console.log(`  Embedding batch ${Math.floor(i/BATCH)+1}/${Math.ceil(products.length/BATCH)} (${batch.length} products)...`)

    const texts = batch.map(p => {
      const parts = [
        p.name   || '',
        p.vendor ? `vendor ${p.vendor}` : '',
        p.sim_type ? `${p.sim_type}` : '',
      ]
      return parts.filter(Boolean).join(', ')
    })

    const vectors = await embedBatch(texts)

    // Store embeddings back to Neo4j
    for (let j = 0; j < batch.length; j++) {
      await runQuery(
        `MATCH (p:Product {product_code: $code}) SET p.embedding = $embedding`,
        { code: batch[j].code, embedding: vectors[j] }
      )
    }

    embedded += batch.length
    console.log(`  ✓ ${embedded}/${products.length} embedded`)
  }

  return embedded
}

async function main() {
  console.log('='.repeat(50))
  console.log('PHASE 2: Embed Products → Neo4j')
  console.log('='.repeat(50))

  await createVectorIndex()
  const count = await embedAllProducts()

  console.log('\n' + '='.repeat(50))
  console.log(`✓ DONE — ${count} products embedded`)
  console.log('='.repeat(50))

  await driver.close()
}

main().catch(e => { console.error('✗ FAILED:', e); process.exit(1) })
