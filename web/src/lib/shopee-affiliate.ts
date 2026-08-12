import crypto from "node:crypto"
import { supabaseAdmin } from "@/lib/supabase"

// Shopee Affiliate Open Platform — GraphQL, ký SHA256 (KHÔNG dính browser fingerprint).
// Endpoint theo region (mặc định VN). Auth: SHA256(appId + timestamp + payload + secret) hex.
// payload PHẢI là ĐÚNG chuỗi JSON body gửi đi → ký và gửi cùng 1 string.
const AFFILIATE_ENDPOINT = "https://open-api.affiliate.shopee.vn/graphql"
const CREDS_KEY = "portal_affiliate_creds"

export interface AffiliateCreds { appId: string; secret: string }

export async function getAffiliateCreds(): Promise<AffiliateCreds | null> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", CREDS_KEY).maybeSingle()
  if (!data?.value) return null
  try {
    const c = JSON.parse(data.value)
    return c.appId && c.secret ? { appId: c.appId, secret: c.secret } : null
  } catch { return null }
}

export async function saveAffiliateCreds(appId: string, secret: string): Promise<void> {
  const value = JSON.stringify({ appId, secret, updated_at: new Date().toISOString() })
  await supabaseAdmin.from("app_settings").upsert(
    { key: CREDS_KEY, value, category: "portal" },
    { onConflict: "key" },
  )
}

export async function affiliateGraphQL(
  creds: AffiliateCreds,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const payload   = JSON.stringify({ query, variables })
  const timestamp = Math.floor(Date.now() / 1000)
  const base      = `${creds.appId}${timestamp}${payload}${creds.secret}`
  const signature = crypto.createHash("sha256").update(base, "utf8").digest("hex")

  const res = await fetch(AFFILIATE_ENDPOINT, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `SHA256 Credential=${creds.appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,   // gửi ĐÚNG string đã ký
  })
  let json: any = null
  try { json = await res.json() } catch { json = { raw: await res.text().catch(() => "") } }
  return { status: res.status, json }
}
