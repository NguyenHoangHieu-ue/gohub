import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

export const dynamic = "force-dynamic"

const SHOPEE_GQL = "https://banhang.shopee.vn/api/v3/affiliateplatform/gql"
const SESSION_KEY = "portal_shopee_session"

// Convert YYYY-MM-DD to ICT (UTC+7) Unix timestamp seconds
function toICTTs(dateStr: string, endOfDay: boolean): string {
  const suffix = endOfDay ? "T23:59:59+07:00" : "T00:00:00+07:00"
  return String(Math.floor(new Date(`${dateStr}${suffix}`).getTime() / 1000))
}

async function getStoredSession() {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", SESSION_KEY).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) as Record<string, string> } catch { return null }
}

async function shopeeGQL(stored: Record<string, string>, query: string, variables: Record<string, unknown>) {
  const body = JSON.stringify({ operationName: query, query: GQL_QUERIES[query], variables })
  const res = await fetch(`${SHOPEE_GQL}?q=${query}`, {
    method: "POST",
    headers: {
      "content-type":       "application/json; charset=UTF-8",
      "accept":             "application/json, text/plain, */*",
      "origin":             "https://banhang.shopee.vn",
      "referer":            "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics",
      "user-agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "cookie":             stored.cookie,
      "af-ac-enc-dat":      stored.af_ac_enc_dat      || "",
      "af-ac-enc-sz-token": stored.af_ac_enc_sz_token || "",
      "x-sap-ri":           stored.x_sap_ri           || "",
      "x-sap-sec":          stored.x_sap_sec          || "",
      "x-sz-sdk-version":   stored.x_sz_sdk_version   || "1.12.33-sc.3",
    },
    body,
  })
  if (!res.ok) throw new Error(`Shopee API ${res.status}`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0]?.message || "GraphQL error")
  return json.data
}

const GQL_QUERIES: Record<string, string> = {
  QueryCommissionKeyMetrics: `
    query QueryCommissionKeyMetrics(
      $startTime: Long
      $endTime: Long
      $commissionType: InsightCommissionType
    ) {
      QueryCommissionKeyMetrics(
        startTime: $startTime
        endTime: $endTime
        commissionType: $commissionType
      ) {
        affiliates
        itemsSold
        orderAmount
        estCommission
      }
    }
  `,
  QueryCommissionList: `
    query QueryCommissionList(
      $startTime: Long
      $endTime: Long
      $commissionType: InsightCommissionType
      $page: Int
      $pageSize: Int
    ) {
      QueryCommissionList(
        startTime: $startTime
        endTime: $endTime
        commissionType: $commissionType
        page: $page
        pageSize: $pageSize
      ) {
        total
        list {
          itemId
          itemName
          itemImage
          orderAmount
          itemsSold
          estCommission
          commissionRate
        }
      }
    }
  `,
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Portal access check
  const role = (session.user as any).role ?? ""
  if (role !== "creator") {
    const { data: portalSetting } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "portal_access_users").maybeSingle()
    const allowed: string[] = portalSetting?.value ? JSON.parse(portalSetting.value) : []
    const username = (session.user as any).username ?? ""
    if (!allowed.includes(username)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const stored = await getStoredSession()
  if (!stored) return NextResponse.json({ error: "session_not_configured", message: "Chưa lưu session Shopee. Creator cần cập nhật session." }, { status: 503 })

  const { searchParams } = req.nextUrl
  const type      = searchParams.get("type")      || "commission_metrics"
  const startDate = searchParams.get("startDate") || ""
  const endDate   = searchParams.get("endDate")   || ""
  const page      = parseInt(searchParams.get("page") || "1")

  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const startTime = toICTTs(startDate, false)
  const endTime   = toICTTs(endDate, true)
  const variables: Record<string, unknown> = {
    commissionType: "TARGET_COMMISSION",
    startTime,
    endTime,
  }

  try {
    if (type === "commission_list") {
      variables.page     = page
      variables.pageSize = 20
      const data = await shopeeGQL(stored, "QueryCommissionList", variables)
      return NextResponse.json({ ok: true, data: data?.QueryCommissionList })
    } else {
      const data = await shopeeGQL(stored, "QueryCommissionKeyMetrics", variables)
      return NextResponse.json({ ok: true, data: data?.QueryCommissionKeyMetrics })
    }
  } catch (err: any) {
    const isAuth = err.message?.includes("401") || err.message?.includes("403")
    return NextResponse.json({
      error: isAuth ? "session_expired" : "fetch_error",
      message: isAuth ? "Session Shopee đã hết hạn. Creator cần cập nhật lại." : err.message,
    }, { status: isAuth ? 401 : 500 })
  }
}
