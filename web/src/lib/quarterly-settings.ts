// Shared settings cho Quarter Report: excluded customers + tier keyword mapping.
// Lưu trong Supabase app_settings. Dùng chung bởi quarterly-report + quarterly-b2b-customers.

import { supabaseAdmin } from "@/lib/supabase"

export const DEFAULT_EXCLUDED_CUSTOMERS = ["B2C Customer US", "B2C Customer VN", "B2B Ops"]

export const DEFAULT_TIER_KEYWORDS: Record<string, string[]> = {
  Strategic: ["STRATEGIC"],
  VIP:       ["VIP"],
  Gold:      ["GOLD"],
  Silver:    ["SILVER"],
}

export interface QuarterlySettings {
  excludedCustomers: string[]
  tierKeywords:      Record<string, string[]>
}

export async function fetchQuarterlySettings(): Promise<QuarterlySettings> {
  try {
    const [{ data: excl }, { data: tier }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("value").eq("key", "quarterly_excluded_customers").maybeSingle(),
      supabaseAdmin.from("app_settings").select("value").eq("key", "quarterly_tier_keywords").maybeSingle(),
    ])
    return {
      excludedCustomers: excl?.value ? JSON.parse(excl.value) : DEFAULT_EXCLUDED_CUSTOMERS,
      tierKeywords:      tier?.value ? JSON.parse(tier.value) : DEFAULT_TIER_KEYWORDS,
    }
  } catch {
    return { excludedCustomers: DEFAULT_EXCLUDED_CUSTOMERS, tierKeywords: DEFAULT_TIER_KEYWORDS }
  }
}

/** Tạo SQL fragment loại KH khỏi nhánh B2B.
 *  Dùng correlated NOT EXISTS tự chứa `dim_customer c` → chạy được KỂ CẢ khi outer query KHÔNG join
 *  dim_customer (quarterly-report sau refactor CTE chỉ join dim_order_source s → dùng c.name trực tiếp sẽ
 *  lỗi "missing FROM-clause entry for table c"). Chỉ cần outer có alias f (fact) + s (order_source). */
export function makeExcludeSql(excludedCustomers: string[]): string {
  if (excludedCustomers.length === 0) return ""
  const escaped = excludedCustomers.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")
  return `AND NOT (UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B' AND EXISTS (
    SELECT 1 FROM dim_customer c
    WHERE TRIM(c.code::text) = TRIM(f.customer_code) AND COALESCE(c.name, '') IN (${escaped})
  ))`
}

/** Hash ngắn của exclusion list để đưa vào cache key (auto-invalidate khi list thay đổi). */
export function exclHash(excludedCustomers: string[]): string {
  return [...excludedCustomers].sort().join("|").slice(0, 24)
}

/** Tạo hàm classifyTier động theo tierKeywords config. */
export function makeClassifyTier(tierKeywords: Record<string, string[]>) {
  return (priceListName: string | null): string => {
    if (!priceListName) return "Strategic"
    const p = priceListName.toUpperCase()
    for (const [tier, keywords] of Object.entries(tierKeywords)) {
      if (keywords.some(kw => p.includes(kw.toUpperCase()))) return tier
    }
    return "Strategic"
  }
}
