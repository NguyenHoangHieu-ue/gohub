// BC Datapool (Billion Connect) API client — server-side only
// Protocol: POST REST, MD5 signature, UTC+8 timestamps
// WARNING: production API — không spam, BC sẽ chặn nếu gọi quá nhiều
import { createHash } from "crypto"

export const BC_SALES_METHOD = "1" // retail

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex")
}

function tradeTime(): string {
  const d = new Date()
  const utc8 = new Date(d.getTime() + 8 * 3600 * 1000)
  return utc8.toISOString().replace("T", " ").slice(0, 19)
}

export interface BCResponse<T = unknown> {
  tradeCode: string
  tradeMsg:  string
  tradeData?: T
}

export async function callBC<T = unknown>(
  tradeType: string,
  tradeData: object,
  override?: { key?: string; secret?: string },
): Promise<BCResponse<T>> {
  const url       = process.env.BC_DATAPOOL_BASE_API_URL ?? "https://apiint-flow.billionconnect.com/Flow/saler/2.0/invoke"
  const appKey    = override?.key    ?? process.env.BC_DATAPOOL_CHANNEL_ID
  const appSecret = override?.secret ?? process.env.BC_DATAPOOL_APP_SECRET
  if (!appKey || !appSecret) throw new Error("BC_DATAPOOL_CHANNEL_ID / BC_DATAPOOL_APP_SECRET not set")

  const body = JSON.stringify({ tradeType, tradeTime: tradeTime(), tradeData })
  const sign = md5(appSecret + body)

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json;charset=UTF-8",
      "x-channel-id":  appKey,
      "x-sign-method": process.env.BC_DATAPOOL_SIGN_METHOD ?? "md5",
      "x-sign-value":  sign,
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`BC HTTP ${res.status}`)
  return res.json()
}

// ── Bulk-sync endpoints (không cần order ID) ──────────────────────────────────
export type BCCountry = { continent: string; mcc: string; name: string; url?: string }
export type BCProduct = {
  skuId: string; name: string; type: string; days?: string; capacity?: string
  highFlowSize?: string; limitFlowSpeed?: string; hotspotSupport?: string
  planType?: string; validityPeroid?: string; desc?: string
  country?: object[]; apn?: string; operatorInfo?: string
}
export type BCPrice = { skuId: string; price: { copies: string; retailPrice: string; settlementPrice: string }[] }

export const bcGetCountries = () =>
  callBC<BCCountry[]>("F001", { salesMethod: BC_SALES_METHOD, language: "2" })

export const bcGetProducts = () =>
  callBC<BCProduct[]>("F002", { salesMethod: BC_SALES_METHOD, language: "2" })

export const bcGetPrices = () =>
  callBC<BCPrice[]>("F003", { salesMethod: BC_SALES_METHOD })

export const bcGetBalance = () =>
  callBC<{ saleBalance: string }>("F014", {})

// ── On-demand query endpoints ─────────────────────────────────────────────────
export const bcQueryOrder = (channelOrderId: string) =>
  callBC("F011", { channelOrderId })

export const bcQueryUsage = (iccid: string, channelOrderId?: string) =>
  callBC("F012", { iccid, ...(channelOrderId ? { channelOrderId } : {}), language: "2" })

export const bcQueryDailyFlow = (iccid: string, beginDate: string, endDate: string) =>
  callBC("F023", { iccid, beginDate, endDate })

export const bcQueryUsageV2 = (iccid: string, opts?: { channelOrderId?: string; orderId?: string }) =>
  callBC("F046", { iccid, ...opts, language: "2" })

export const bcQueryEsimStatus = (opts: { iccid?: string; eid?: string }) =>
  callBC("F042", opts)
