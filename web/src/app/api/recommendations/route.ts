import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }         from 'next-auth'
import { authOptions }              from '@/lib/auth'
import { runQuery }                 from '@/lib/neo4j-client'

// GET /api/recommendations?sku=<sku_code>&limit=5
// Returns similar SKUs from Neo4j graph (same product family or similar duration/data)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const skuCode = searchParams.get('sku')
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '5'), 20)

  if (!skuCode) return NextResponse.json({ error: 'sku parameter required' }, { status: 400 })

  try {
    // Find similar SKUs: same product family OR similar days + data_gb range
    const results = await runQuery<{
      sku_code:    string
      product_code: string
      days:        number
      data_gb:     number
      status:      string
      reason:      string
    }>(
      `MATCH (target:SKU {sku_code: $skuCode})<-[:HAS_SKU]-(p:Product)
       MATCH (p)-[:HAS_SKU]->(sibling:SKU)
       WHERE sibling.sku_code <> $skuCode AND sibling.status = 'Active'
       WITH sibling, 'same_product' AS reason
       LIMIT $limit

       UNION

       MATCH (target:SKU {sku_code: $skuCode})
       MATCH (similar:SKU)
       WHERE similar.sku_code <> $skuCode
         AND similar.status = 'Active'
         AND abs(similar.days - target.days) <= 2
       WITH similar AS sibling, 'similar_duration' AS reason
       LIMIT $limit

       RETURN sibling.sku_code AS sku_code, sibling.product_code AS product_code,
              sibling.days AS days, sibling.data_gb AS data_gb,
              sibling.status AS status, reason
       LIMIT $limit`,
      { skuCode, limit }
    )

    return NextResponse.json({ sku: skuCode, recommendations: results, count: results.length })
  } catch (error: any) {
    console.error('[Recommendations] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
