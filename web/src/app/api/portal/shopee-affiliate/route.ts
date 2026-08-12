import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"
import { getAffiliateCreds, affiliateGraphQL } from "@/lib/shopee-affiliate"

export const dynamic = "force-dynamic"
export const maxDuration = 30

async function hasAccess(session: any): Promise<boolean> {
  const role = (session.user as any).role ?? ""
  if (role === "creator") return true
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "portal_access_users").maybeSingle()
  const allowed: string[] = data?.value ? JSON.parse(data.value) : []
  return allowed.includes((session.user as any).username ?? "")
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await hasAccess(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const creds = await getAffiliateCreds()
  if (!creds) return NextResponse.json({ error: "creds_missing", message: "Creator chưa lưu App ID / Secret." }, { status: 503 })

  const { query, variables } = await req.json()
  if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 })

  try {
    const { status, json } = await affiliateGraphQL(creds, query, variables ?? {})
    console.log("[shopee-affiliate] status:", status, "errors:", JSON.stringify(json?.errors ?? null)?.slice(0, 300))
    if (json?.errors?.length) {
      return NextResponse.json({ error: "graphql_error", message: json.errors[0]?.message || "GraphQL error", errors: json.errors, data: json.data ?? null }, { status: 200 })
    }
    if (status >= 400) {
      return NextResponse.json({ error: "http_error", message: `Shopee ${status}`, raw: json }, { status: 200 })
    }
    return NextResponse.json({ ok: true, data: json?.data ?? null })
  } catch (err: any) {
    console.error("[shopee-affiliate] error:", err.message)
    return NextResponse.json({ error: "fetch_error", message: err.message }, { status: 500 })
  }
}
