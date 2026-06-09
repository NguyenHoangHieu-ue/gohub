import { NextRequest, NextResponse } from 'next/server'
import { runQuery, closeDriver } from '@/lib/neo4j-client'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY)

async function getEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'embedding-001' })

  const result = await model.embedContent(text)
  return result.embedding.values
}

async function cosineSimilarity(a: number[], b: number[]): Promise<number> {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  return normA > 0 && normB > 0 ? dot / (normA * normB) : 0
}

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 10 } = await req.json()

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    console.log(`[Semantic Search] Query: "${query}"`)

    // Get embedding for query
    const queryEmbedding = await getEmbedding(query)

    // Search products by name similarity (naive approach for now)
    // TODO: Implement vector search when Neo4j vector index is ready
    const result = await runQuery<any>(
      `
      MATCH (p:Product)-[:HAS_SKU]->(s:SKU)
      RETURN p.product_code as code, p.product_name as name,
             count(s) as sku_count,
             s.days as min_days, s.data_gb as min_data
      LIMIT $limit
      `,
      { limit }
    )

    // Score by text similarity (basic keyword matching)
    const scored = result.map((item) => {
      const score = calculateTextSimilarity(query, item.name)
      return { ...item, score }
    })

    const ranked = scored.sort((a, b) => b.score - a.score).slice(0, limit)

    await closeDriver()

    return NextResponse.json({
      query,
      embedding_dim: queryEmbedding.length,
      results: ranked,
      count: ranked.length,
    })
  } catch (error) {
    console.error('[Semantic Search] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function calculateTextSimilarity(a: string, b: string): number {
  const words_a = a.toLowerCase().split(/\s+/)
  const words_b = b.toLowerCase().split(/\s+/)

  const matches = words_a.filter((w) =>
    words_b.some((wb) => wb.includes(w) || w.includes(wb))
  ).length

  return matches / Math.max(words_a.length, words_b.length)
}
