import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

const KEY = "portal_shopee_session"

function isCreator(role: string) { return role === "creator" }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  if (!data?.value) return NextResponse.json({ configured: false })

  try {
    const stored = JSON.parse(data.value)
    return NextResponse.json({
      configured: true,
      updated_at: stored.updated_at,
      // Mask sensitive values
      cookie_prefix: (stored.cookie as string)?.slice(0, 40) + "...",
    })
  } catch {
    return NextResponse.json({ configured: false })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { cookie, af_ac_enc_dat, af_ac_enc_sz_token, x_sap_ri, x_sap_sec } = body
  if (!cookie?.trim()) return NextResponse.json({ error: "cookie required" }, { status: 400 })

  // Strip control chars (newline, carriage return...) ngay khi lưu
  const clean = (s: string) => (s || "").replace(/[\x00-\x08\x0A-\x1F\x7F]/g, "").trim()

  const value = JSON.stringify({
    cookie:              clean(cookie),
    af_ac_enc_dat:       clean(af_ac_enc_dat  || ""),
    af_ac_enc_sz_token:  clean(af_ac_enc_sz_token || ""),
    x_sap_ri:            clean(x_sap_ri  || ""),
    x_sap_sec:           clean(x_sap_sec || ""),
    x_sz_sdk_version:    "1.12.33-sc.3",
    updated_at:          new Date().toISOString(),
  })

  const { data: existing } = await supabaseAdmin.from("app_settings").select("id").eq("key", KEY).maybeSingle()
  if (existing) {
    await supabaseAdmin.from("app_settings").update({ value }).eq("key", KEY)
  } else {
    await supabaseAdmin.from("app_settings").insert({ key: KEY, value, category: "portal" })
  }

  return NextResponse.json({ ok: true })
}
