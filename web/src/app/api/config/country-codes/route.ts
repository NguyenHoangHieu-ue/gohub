import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery } from "@/lib/turso"
import { cachedQuery } from "@/lib/analytics-helpers"

// GET → [{code, country}] — đọc từ Turso country_codes (332 rows, đúng data).
// Fallback về gohub_dw nếu Turso không khả dụng.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const rows = await cachedQuery("country-codes", async () => {
      const data = await tursoQuery<{ code: string; country: string }>(
        "SELECT code, country FROM country_codes ORDER BY country"
      )
      return data.map(r => ({ code: String(r.code), country: String(r.country) }))
    })
    return NextResponse.json(rows)
  } catch (err: any) {
    console.error("[config/country-codes]", err.message)
    return NextResponse.json([], { status: 200 })
  }
}
