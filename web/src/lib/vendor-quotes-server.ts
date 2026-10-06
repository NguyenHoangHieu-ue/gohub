import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { flushByDeps } from "@/lib/analytics-helpers"
import { loadRefCountries, loadSupportCountries } from "@/lib/bc-datapool/server"
import type { MarketGroupLite } from "@/lib/vendor-quote-extract"

export const VENDOR_QUOTES_DEP = "vendor-quotes"
export const BUCKET = "vendor-quotes"   // riêng tư — báo giá là thông tin mật, mở qua signed URL

/** Ghi/đọc kho báo giá: admin/creator (hoặc user được cấp quyền ghi tab market). Trả username hoặc null. */
export async function requireQuoteWriter(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const username = session.user.username
  return (await canWriteTab(username, "market", ["admin", "creator"])) ? username : null
}

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
