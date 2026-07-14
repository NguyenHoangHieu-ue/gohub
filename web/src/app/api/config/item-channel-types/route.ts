import { NextResponse }    from "next/server"
import { supabaseAdmin }  from "@/lib/supabase"
import { getServerSession } from "next-auth"
import { authOptions }    from "@/lib/auth"

const KEY = "item_channel_types"

const ITEM_CHANNEL_DEFAULTS: Record<string, string[]> = {
  B2C: ["B2C", "ECO"],
  B2B: ["OD", "WS", "Strategic", "TIER", "SILVER", "DEAL", "B2B"],
}

export async function GET() {
  const { data: setting } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", KEY).maybeSingle()
  let config = ITEM_CHANNEL_DEFAULTS
  try { if (setting?.value) config = JSON.parse(setting.value) } catch {}

  // Distinct item_type values for reference display
  const { data: items } = await supabaseAdmin
    .from("items").select("item_type").eq("status", "Active")
  const allTypes: string[] = [...new Set(
    (items ?? []).map((it: any) => it.item_type as string).filter(Boolean)
  )].sort()

  return NextResponse.json({ config, allTypes, defaults: ITEM_CHANNEL_DEFAULTS })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await req.json() as Record<string, string[]>
  const { error } = await supabaseAdmin.from("app_settings")
    .upsert({ key: KEY, value: JSON.stringify(body), label: "Item Channel Types" }, { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
