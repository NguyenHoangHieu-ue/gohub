import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getSkuDestinationRule } from "@/lib/analytics-helpers"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const rule = await getSkuDestinationRule()
    return NextResponse.json(rule)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
