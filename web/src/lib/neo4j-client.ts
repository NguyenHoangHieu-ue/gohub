import neo4j from 'neo4j-driver'

let driver: ReturnType<typeof neo4j.driver> | null = null

export function getNeo4jDriver() {
  if (driver) return driver

  const uri = process.env.NEO4J_URI || 'neo4j+s://1481bc12.databases.neo4j.io'
  const user = process.env.NEO4J_USER || '1481bc12'
  const password = process.env.NEO4J_PASSWORD

  if (!password) {
    throw new Error('NEO4J_PASSWORD environment variable not set')
  }

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    encrypted: 'ENCRYPTION_ON',
  })

  return driver
}

export async function runQuery<T = any>(
  query: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const driver = getNeo4jDriver()
  const session = driver.session()

  try {
    const result = await session.run(query, params)
    return result.records.map((record) => record.toObject() as unknown as T)
  } finally {
    await session.close()
  }
}

export async function createNode(
  label: string,
  properties: Record<string, any>
): Promise<boolean> {
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

export async function createNodes(
  label: string,
  nodes: Array<Record<string, any>>
): Promise<number> {
  let count = 0
  for (const node of nodes) {
    if (await createNode(label, node)) {
      count++
    }
  }
  return count
}

export async function countNodes(label: string): Promise<number> {
  const result = await runQuery<{ count: number }>(
    `MATCH (n:${label}) RETURN count(n) as count`
  )
  return result[0]?.count || 0
}

export async function closeDriver() {
  if (driver) {
    await driver.close()
    driver = null
  }
}
