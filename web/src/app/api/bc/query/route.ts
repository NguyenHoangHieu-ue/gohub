import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { callBC } from "@/lib/bc-api"

// On-demand BC API proxy — chỉ cho phép query-only (không tạo/sửa/xóa đơn hàng)
const ALLOWED = new Set(["F011", "F012", "F023", "F046", "F042", "F054"])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ""
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { tradeType?: string; tradeData?: object; testSecret?: string; testKey?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { tradeType, tradeData, testSecret, testKey } = body

  // Test credential mode — chỉ admin/creator, chỉ F014 (balance, không side-effect)
  if (testSecret !== undefined) {
    if (!["admin", "creator"].includes(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    try {
      const result = await callBC("F014", {}, { key: testKey, secret: testSecret })
      return NextResponse.json(result)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  }

  if (!tradeType || !ALLOWED.has(tradeType)) {
    return NextResponse.json({ error: `tradeType not allowed: ${tradeType}` }, { status: 400 })
  }

  try {
    const result = await callBC(tradeType, tradeData ?? {})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
