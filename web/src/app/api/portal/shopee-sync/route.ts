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
  // Accept both old format {metrics,startDate,endDate} and new {monthly,products}
  const value = JSON.stringify({
    monthly:  body.monthly  ?? null,
    products: body.products ?? null,
    // legacy fallback
    metrics:  body.metrics  ?? null,
    startDate: body.startDate ?? null,
    endDate:   body.endDate   ?? null,
    synced_at: new Date().toISOString(),
  })

  const valueSize = Buffer.byteLength(value, "utf-8")
  console.log("[shopee-sync] payload size:", valueSize, "bytes, months:", body.monthly?.length, "products:", body.products?.total)

  const { data: existing } = await supabaseAdmin
    .from("app_settings").select("id").eq("key", DATA_KEY).maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin.from("app_settings").update({ value }).eq("key", DATA_KEY)
    if (error) {
      console.error("[shopee-sync] update error:", error)
      return NextResponse.json({ error: error.message, detail: "Supabase UPDATE failed" }, { status: 500, headers: CORS_HEADERS })
    }
  } else {
    const { error } = await supabaseAdmin.from("app_settings").insert({ key: DATA_KEY, value, category: "portal" })
    if (error) {
      console.error("[shopee-sync] insert error:", error)
      return NextResponse.json({ error: error.message, detail: "Supabase INSERT failed" }, { status: 500, headers: CORS_HEADERS })
    }
  }

  return NextResponse.json({ ok: true, saved: { bytes: valueSize, months: body.monthly?.length, products: body.products?.total } }, { headers: CORS_HEADERS })
}
