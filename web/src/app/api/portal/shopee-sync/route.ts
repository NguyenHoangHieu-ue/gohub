import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin }             from "@/lib/supabase"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "https://banhang.shopee.vn",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

const TOKEN_KEY = "portal_sync_token"
const DATA_KEY  = "portal_shopee_data"

async function getToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", TOKEN_KEY).maybeSingle()
  return data?.value ?? null
}

// Preflight cho CORS từ banhang.shopee.vn
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  // Auth: Bearer token
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  const stored = await getToken()
  if (!stored || token !== stored) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS })
  }

  const body = await req.json()
  const { metrics, list, startDate, endDate } = body

  const value = JSON.stringify({
    metrics,
    list: list ?? null,
    startDate,
    endDate,
    synced_at: new Date().toISOString(),
  })

  const { data: existing } = await supabaseAdmin
    .from("app_settings").select("id").eq("key", DATA_KEY).maybeSingle()
  if (existing) {
    await supabaseAdmin.from("app_settings").update({ value }).eq("key", DATA_KEY)
  } else {
    await supabaseAdmin.from("app_settings").insert({ key: DATA_KEY, value, category: "portal" })
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
