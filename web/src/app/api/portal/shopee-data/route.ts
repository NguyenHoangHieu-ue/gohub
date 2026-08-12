import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"
import https                         from "node:https"

export const dynamic = "force-dynamic"

const SHOPEE_GQL = "https://banhang.shopee.vn/api/v3/affiliateplatform/gql"
const SESSION_KEY = "portal_shopee_session"

// Dùng node:https thay fetch() vì undici (Node 18+) block cookie header
function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const buf = Buffer.from(body, "utf-8")
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   "POST",
      headers:  { ...headers, "content-length": String(buf.length) },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 200, json: JSON.parse(Buffer.concat(chunks).toString("utf-8")) })
        } catch { reject(new Error("Shopee trả về response không hợp lệ")) }
      })
      res.on("error", reject)
    })
    req.on("error", reject)
    req.write(buf)
    req.end()
  })
}

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
  const headers: Record<string, string> = {
    "content-type":       "application/json; charset=UTF-8",
    "accept":             "application/json, text/plain, */*",
    "accept-encoding":    "gzip, deflate, br",
    "origin":             "https://banhang.shopee.vn",
    "referer":            "https://banhang.shopee.vn/portal/web-seller-affiliate/commission_analytics",
    "user-agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "cookie":             stored.cookie,
  }
  if (stored.af_ac_enc_dat)      headers["af-ac-enc-dat"]      = stored.af_ac_enc_dat
  if (stored.af_ac_enc_sz_token) headers["af-ac-enc-sz-token"] = stored.af_ac_enc_sz_token
  if (stored.x_sap_ri)           headers["x-sap-ri"]           = stored.x_sap_ri
  if (stored.x_sap_sec)          headers["x-sap-sec"]          = stored.x_sap_sec
  headers["x-sz-sdk-version"] = stored.x_sz_sdk_version || "1.12.33-sc.3"

  const { status, json } = await httpsPost(`${SHOPEE_GQL}?q=${query}`, headers, body)
  const j = json as any
  if (status >= 400) throw new Error(`Shopee API ${status}`)
  if (j?.errors?.length) throw new Error(j.errors[0]?.message || "GraphQL error")
  return j?.data
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
