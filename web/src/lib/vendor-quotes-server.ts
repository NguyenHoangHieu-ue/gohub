import { supabaseAdmin } from "@/lib/supabase"
import { requireCreatorGrant, MARKET_USERS_KEY } from "@/lib/creator-access"
import { flushByDeps } from "@/lib/analytics-helpers"
import { loadRefCountries, loadSupportCountries } from "@/lib/bc-datapool/server"
import type { MarketGroupLite } from "@/lib/vendor-quote-extract"

export const VENDOR_QUOTES_DEP = "vendor-quotes"
export const BUCKET = "vendor-quotes"   // riêng tư — báo giá là thông tin mật, mở qua signed URL

/** Ghi/đọc kho báo giá: creator + người được creator cấp tab Thị trường & Báo giá. Trả username hoặc null. */
export const requireQuoteWriter = () => requireCreatorGrant(MARKET_USERS_KEY)

/** Nhóm nhiều nước (để AI map vùng như "Europe") + tập ISO2 hợp lệ. */
export async function loadQuoteGeo(): Promise<{ groups: MarketGroupLite[]; validIso: Set<string> }> {
  const [refs, support] = await Promise.all([loadRefCountries(), loadSupportCountries()])
  return {
    groups: support.filter(g => g.iso.includes(",")).map(g => ({ code: g.code, en: g.en, iso: g.iso })),
    validIso: new Set(refs.map(r => r.code.toUpperCase())),
  }
}

export async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET)
  if (!data) await supabaseAdmin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 })
}

/** Báo giá đổi → bảng so giá (cache market-quotes) phải tính lại. */
export const flushQuoteCompare = () => flushByDeps([VENDOR_QUOTES_DEP])
