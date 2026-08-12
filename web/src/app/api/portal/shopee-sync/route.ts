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
  // Format mới: { monthly, datasets } — datasets = mọi bảng GraphQL portal tự tải (bắt qua interceptor)
  // Vẫn nhận format cũ { metrics, products } để tương thích ngược.
  const value = JSON.stringify({
    monthly:  body.monthly  ?? null,
    datasets: body.datasets ?? null,   // { [queryName]: { variables, data, at } }
    // legacy fallback
    products:  body.products  ?? null,
    metrics:   body.metrics   ?? null,
    startDate: body.startDate ?? null,
    endDate:   body.endDate   ?? null,
    synced_at: new Date().toISOString(),
  })

  const valueSize = Buffer.byteLength(value, "utf-8")
  const dsKeys = body.datasets ? Object.keys(body.datasets) : []
  console.log("[shopee-sync] size:", valueSize, "months:", body.monthly?.length, "datasets:", dsKeys.join(","))

  // UPSERT thay SELECT+INSERT/UPDATE — tránh race condition khi script chạy song song
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: DATA_KEY, value, category: "portal" }, { onConflict: "key" })

  if (error) {
    console.error("[shopee-sync] upsert error:", error)
    // Fallback: try plain UPDATE nếu upsert không hỗ trợ onConflict trên key này
    const { error: updateErr } = await supabaseAdmin
      .from("app_settings").update({ value }).eq("key", DATA_KEY)
    if (updateErr) {
      console.error("[shopee-sync] fallback update error:", updateErr)
      return NextResponse.json({ error: updateErr.message, detail: "Supabase write failed" }, { status: 500, headers: CORS_HEADERS })
    }
  }

  return NextResponse.json({ ok: true, saved: { bytes: valueSize, months: body.monthly?.length ?? 0, datasets: dsKeys } }, { headers: CORS_HEADERS })
}
