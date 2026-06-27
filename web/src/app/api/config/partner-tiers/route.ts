import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getPartnerTiers, cachedQuery } from "@/lib/analytics-helpers"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tiers = await cachedQuery("partner-tiers", getPartnerTiers)
  return NextResponse.json(tiers)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "partner_tiers",
    value: JSON.stringify(body),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
