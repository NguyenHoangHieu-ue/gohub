// Shared settings cho Quarter Report: excluded customers + tier keyword mapping.
// Lưu trong Supabase app_settings. Dùng chung bởi quarterly-report + quarterly-b2b-customers.

import { supabaseAdmin } from "@/lib/supabase"

// Prefix cache hiện hành của quarterly-report/quarterly-b2b-customers — đặt ở lib dùng chung (KHÔNG đặt
// trong route.ts vì Next.js App Router chỉ cho export tên hàm đã biết như GET/POST/dynamic/maxDuration...,
// export thêm named const khác sẽ fail type-check route). quarterly-cache-flush import trực tiếp 2 hằng
// này thay vì hardcode string — nhớ đổi CẢ 2 chỗ (đây + rawCacheKey trong route.ts tương ứng) khi bump
// version (bài học s169: prefix list hardcode ở nơi khác quên bump theo → nút "Tải lại mới" thành no-op).
export const QREPORT_CACHE_PREFIX = "qreport_raw_v9:"
export const QB2B_CACHE_PREFIX    = "qb2b_raw_v8:"

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
 *  Hỗ trợ 2 dạng entry:
 *   - customer_code (alphanumeric không khoảng trắng): match trực tiếp f.customer_code → ổn định khi đổi tên
 *   - Tên KH (có khoảng trắng / ký tự đặc biệt): match qua dim_customer.name → backward-compat với cài đặt cũ
 */
export function makeExcludeSql(excludedCustomers: string[]): string {
  if (excludedCustomers.length === 0) return ""

  // code: không có khoảng trắng, chỉ alphanumeric/- (vd: wHWSYmE541)
  const isCode = (e: string) => /^[A-Za-z0-9_-]+$/.test(e.trim())
  const codes = excludedCustomers.filter(isCode)
  const names = excludedCustomers.filter(e => !isCode(e))

  const parts: string[] = []
  if (codes.length > 0) {
    const esc = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(", ")
    parts.push(`TRIM(f.customer_code) IN (${esc})`)
  }
  if (names.length > 0) {
    const esc = names.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")
    parts.push(`EXISTS (SELECT 1 FROM dim_customer cx WHERE TRIM(cx.code::text) = TRIM(f.customer_code) AND COALESCE(cx.name, '') IN (${esc}))`)
  }
  if (parts.length === 0) return ""
  return `AND NOT (UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B' AND (${parts.join(" OR ")}))`
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
