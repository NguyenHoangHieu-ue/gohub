import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI }       from "@google/generative-ai"
import { runQuery }                 from "@/lib/neo4j-client"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)

async function embedText(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: "gemini-embedding-001" })
  const result = await model.embedContent(text.slice(0, 500))
  return result.embedding.values
}

export async function POST(req: NextRequest) {
  try {
    const { query, topK = 10 } = await req.json()
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query required" }, { status: 400 })
    }

    const embedding = await embedText(query)

    // Vector search — index 'sku_embedding' created by embed-skus.js
    const records = await runQuery<{ sku_code: string; score: number }>(
      `CALL db.index.vector.queryNodes('sku_embedding', $topK, $embedding)
       YIELD node AS sku, score
       WHERE score > 0.65
       RETURN sku.sku_code AS sku_code, score
       ORDER BY score DESC`,
      { topK, embedding }
    )

    return NextResponse.json({
      query,
      results: records.map(r => ({ sku_code: r.sku_code, score: r.score })),
    })
  } catch (err: any) {
    const isIndexMissing = err?.message?.includes("index") || err?.message?.includes("embedding")
    if (isIndexMissing) {
      return NextResponse.json({
        query: "",
        results: [],
        note: "Vector index not ready — run: node scripts/embed-skus.js",
      })
    }
    console.error("[semantic-search]", err?.message)
    return NextResponse.json({ error: err?.message ?? "internal error" }, { status: 500 })
  }
}
