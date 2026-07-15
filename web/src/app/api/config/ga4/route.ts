import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ga4Sites } from "@/lib/ga4"

// Danh sách site GA4 (id, name, propertyId, siteUrl) — cho selector. Không trả credentials.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const localPreview = process.env.NODE_ENV === "development" && req.nextUrl.searchParams.get("localPreview") === "1"
  if (!session && !localPreview) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ sites: await ga4Sites() })
  } catch (err) {
    console.error("[config/ga4]", (err as Error).message)
    return NextResponse.json({ sites: [] })
  }
}
