import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCountryMappings } from "@/lib/analytics-helpers"

// GET → [{code, country}] — port intel /api/config/country-codes (intel đọc Turso country_codes).
// Web lấy map region-code → tên nước từ gohub_dw qua getCountryMappings (dùng cho hiển thị region ở Products).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const map = await getCountryMappings()
    const rows = Object.entries(map).map(([code, country]) => ({ code, country }))
    return NextResponse.json(rows)
  } catch (err: any) {
    console.error("[config/country-codes]", err.message)
    return NextResponse.json([], { status: 200 })
  }
}
