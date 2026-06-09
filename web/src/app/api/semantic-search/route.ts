import { NextRequest, NextResponse } from 'next/server'

// Phase 1: Basic semantic search API
// TODO: Add vector embeddings and Neo4j vector index in Phase 1.5

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 10 } = await req.json()

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    console.log(`[Phase 1] Semantic search: "${query}"`)

    // Mock results for Phase 1 (using hardcoded data from Neo4j)
    // Real implementation will use vector search
    const mockResults = [
      {
        code: 'PKG-7D-DATA',
        name: 'Goi data 7 ngay 10GB',
        sku_count: 5,
        score: 0.95,
      },
      {
        code: 'PKG-7D-VOICE',
        name: 'Goi voice 7 ngay unlimited',
        sku_count: 3,
        score: 0.85,
      },
      {
        code: 'PKG-30D-DATA',
        name: 'Goi data 30 ngay 30GB',
        sku_count: 4,
        score: 0.75,
      },
    ]

    return NextResponse.json({
      query,
      status: 'Phase 1 - Mock data',
      note: 'Vector search will be implemented in Phase 1.5 with Neo4j vector index',
      results: mockResults.slice(0, limit),
      count: mockResults.length,
    })
  } catch (error) {
    console.error('[Semantic Search] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    )
  }
}
