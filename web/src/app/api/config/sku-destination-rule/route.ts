import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
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

// POST { prefix, codeLength, offset } → lưu quy tắc trích mã vùng SKU
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "admin" && session.user?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const rule = {
      prefix:     String(body.prefix ?? "E").toUpperCase().slice(0, 1) || "E",
      codeLength: Math.max(1, Math.min(5, parseInt(body.codeLength) || 3)),
      offset:     Math.max(0, Math.min(10, parseInt(body.offset) || 3)),
    }
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "sku_destination_rule", value: JSON.stringify(rule), category: "analytics" }, { onConflict: "key" })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, rule })
  } catch (err: any) {
    console.error("[config/sku-destination-rule POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
