import { supabaseAdmin } from "@/lib/supabase"

// Danh sách kênh B2C — dùng để lọc chi phí kênh (opCost) chỉ trong phạm vi B2C,
// tránh kênh B2B/ecom (VN-Ecom, Traveloka...) lọt vào Revenue & Gross Profit Trend.
export const B2C_CHANNELS = [
  "VN-Loyalty",
  "VN-Web eSIM",
  "VN-Social",
  "Mobile-App",
  "Global-Web",
  "VN-Web SIM",
  "Misc.",
  "Topup",
  "US-B2C Portal",
  "Global-B2C",
]

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

type CostValue = { type?: string; value?: number }

function parseCostValue(value: unknown): CostValue {
  if (!value) return { type: "amount", value: 0 }
  if (typeof value === "object") return value as CostValue
  try { return JSON.parse(String(value)) as CostValue } catch { return { type: "amount", value: 0 } }
}

function amountOnly(value: CostValue): number {
  return value?.type === "amount" ? Number(value.value) || 0 : 0
}

export async function getB2CChannelBudgetByMonth(months: string[]): Promise<Record<string, number>> {
  const budget = Object.fromEntries(months.map(month => [month, 0])) as Record<string, number>
  if (months.length === 0) return budget

  const { data, error } = await supabaseAdmin
    .from("analytics_channel_costs")
    .select("channel, month, ads, platform_fee, sponsor_products, media")
    .in("month", months)
    .in("channel", B2C_CHANNELS)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const month = String(row.month)
    if (budget[month] === undefined) continue
    const costs = {
      ads: parseCostValue(row.ads),
      platformFee: parseCostValue(row.platform_fee),
      sponsorProducts: parseCostValue(row.sponsor_products),
      media: parseCostValue(row.media),
    }
    budget[month] += COST_KEYS.reduce((sum, key) => sum + amountOnly(costs[key]), 0)
  }

  return budget
}
