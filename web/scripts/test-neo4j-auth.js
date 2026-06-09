const path = require('path')
const fs = require('fs')

// Find .env.local by going up from scripts dir
let envPath = path.join(__dirname, '../../.env.local')
if (!fs.existsSync(envPath)) {
  envPath = path.join(__dirname, '../../.env')
}
console.log('Loading from:', envPath)
require('dotenv').config({ path: envPath })
const neo4j = require('neo4j-driver')

const uri = process.env.NEO4J_URI
const user = process.env.NEO4J_USER
const pass = process.env.NEO4J_PASSWORD

console.log('NEO4J_URI:', uri)
console.log('NEO4J_USER:', user)
console.log('NEO4J_PASSWORD:', pass ? pass.substring(0, 10) + '...' : 'NOT SET')

if (!uri || !user || !pass) {
  console.error('Missing environment variables!')
  process.exit(1)
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass))

async function test() {
  const session = driver.session()
  try {
    console.log('\nTesting basic query...')
    const result = await session.run('RETURN 1 as test')
    console.log('✓ SUCCESS: Query executed')
    console.log('  Result:', result.records[0].toObject())
  } catch (e) {
    console.log('✗ ERROR:', e.code)
    console.log('  Message:', e.message)
  } finally {
    await session.close()
    await driver.close()
  }
}

test()
