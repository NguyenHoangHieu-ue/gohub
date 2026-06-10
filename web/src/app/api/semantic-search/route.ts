import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI }       from '@google/generative-ai'
import { runQuery }                 from '@/lib/neo4j-client'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)

async function embedQuery(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 10 } = await req.json()
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 })

    // Embed the query
    const queryVec = await embedQuery(query)

    // Neo4j vector similarity search
    const results = await runQuery<{
      code: string
      name: string
      vendor: string
      sim_type: string
      score: number
    }>(
      `CALL db.index.vector.queryNodes('product_embeddings', $limit, $queryVec)
       YIELD node AS p, score
       RETURN p.product_code AS code, p.product_name AS name,
              p.vendor_code AS vendor, p.type_of_sim AS sim_type,
              score
       ORDER BY score DESC`,
      { limit, queryVec }
    )

    return NextResponse.json({ query, results, count: results.length })
  } catch (error: any) {
    // Graceful fallback if vector index not ready
    if (error.message?.includes('index') || error.message?.includes('embedding')) {
      return NextResponse.json({
        query: req.url,
        results: [],
        count: 0,
        note: 'Vector index not ready — run scripts/embed-products.js first',
      })
    }
    console.error('[Semantic Search] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    )
  }
}
