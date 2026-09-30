/**
 * Đổi COGS theo các khoá phẳng `fx.*` (chatbot, MCP...). Quy ước lưu: "số đơn vị ngoại tệ cho 1 USD" (VD fx.hkd_usd = 7.801 nghĩa là
 * 1 USD = 7.801 HKD) — nên ngoại tệ → USD là CHIA, không phải nhân. (Trước đây code nhân với 0.128 kiểu "USD cho 1 HKD" trong khi DB
 * lưu 7.801 → COGS HKD bị đổi sai ~60 lần.)
 * VND → USD dùng tỷ giá Inc (`fx.vnd_usd_inc`), USD → VND dùng tỷ giá JSC (`fx.usd_vnd`); COGS gốc đã là VND thì giữ nguyên số VND.
 */
const PER_USD_KEY: Record<string, [string, number]> = {
  HKD: ["fx.hkd_usd", 7.8], TWD: ["fx.twd_usd", 31.5], CNY: ["fx.usd_cny", 6.8], JPY: ["fx.usd_jpy", 155],
  THB: ["fx.usd_thb", 33], EUR: ["fx.usd_eur", 0.86], GBP: ["fx.usd_gbp", 0.74], SGD: ["fx.usd_sgd", 1.28],
}

export function convertCogsFlat(cogs: number, currency: string, fx: Record<string, number>): { usd: number; vnd: number } {
  const usdVnd = fx["fx.usd_vnd"] ?? 26000
  const vndToUsd = fx["fx.vnd_usd_inc"] ?? usdVnd
  const cur = (currency ?? "").toUpperCase()
  let usd: number
  if (cur === "USD") usd = cogs
  else if (cur === "VND") usd = cogs / vndToUsd
  else if (PER_USD_KEY[cur]) usd = cogs / (fx[PER_USD_KEY[cur][0]] ?? PER_USD_KEY[cur][1])
  else usd = cogs
  return { usd: Math.round(usd * 10000) / 10000, vnd: cur === "VND" ? Math.round(cogs) : Math.round(usd * usdVnd) }
}
