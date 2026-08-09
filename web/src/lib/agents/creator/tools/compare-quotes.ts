import { supabaseAdmin } from "@/lib/supabase"

interface VendorQuote {
  country:   string   // ISO code hoặc tên nước
  vendor:    string   // tên vendor
  data_gb:   number   // GB/ngày hoặc total GB
  days:      number
  is_daily:  boolean  // true = GB/ngày, false = fixed GB
  cogs_usd:  number   // giá vendor quote
}

export async function runCompareVendorQuotes(args: {
  quotes: VendorQuote[]
  fx_rate_usd_vnd?: number
}): Promise<any> {
  if (!args.quotes?.length) return { error: "quotes array là bắt buộc và không được rỗng." }

  // Lấy FX rate: ưu tiên args → app_settings
  let fxRate = args.fx_rate_usd_vnd
  if (!fxRate) {
    try {
      const { data } = await supabaseAdmin.from("app_settings")
        .select("value").eq("key", "fx.usd_vnd").maybeSingle()
      fxRate = data?.value ? parseFloat(data.value) : 25000
    } catch { fxRate = 25000 }
  }

  const results = await Promise.all(args.quotes.map(async q => {
    // Tìm SKU gần nhất trong Supabase để lấy COGS hiện tại
    let currentCogs: number | null = null
    let matchedSku: string | null = null
    try {
      const dataAmount = q.is_daily ? q.data_gb : q.data_gb / q.days  // GB/ngày
      const { data: skus } = await supabaseAdmin.from("skus")
        .select("sku_code, latest_cogs, latest_cogs_currency, data_amount, data_amount_unit, day_amount, is_daily")
        .eq("is_daily", q.is_daily)
        .eq("day_amount", q.days)
        .gte("data_amount", dataAmount * 0.9)
        .lte("data_amount", dataAmount * 1.1)
        .not("latest_cogs", "is", null)
        .limit(5)

      if (skus?.length) {
        const { data: prods } = await supabaseAdmin.from("products")
          .select("product_code, country_group, vendor_code")
          .ilike("country_group", `%${q.country}%`)
          .ilike("vendor_code", `%${q.vendor.slice(0, 4)}%`)
          .in("product_code", skus.map(s => s.sku_code.slice(0, 8)))
          .limit(3)

        if (prods?.length) {
          const matched = skus.find(s => prods.some(p => s.sku_code.startsWith(p.product_code)))
          if (matched) {
            const cogs = parseFloat(matched.latest_cogs || "0")
            currentCogs = matched.latest_cogs_currency === "VND" ? cogs / fxRate! : cogs
            matchedSku = matched.sku_code
          }
        }
      }
    } catch { /* skip nếu query fail */ }

    const newCogsUsd = q.cogs_usd
    const newCogsVnd = newCogsUsd * fxRate!
    const delta = currentCogs !== null ? newCogsUsd - currentCogs : null
    const deltaVnd = delta !== null ? delta * fxRate! : null
    const deltaPct = (currentCogs && delta !== null) ? (delta / currentCogs) * 100 : null

    return {
      vendor: q.vendor,
      country: q.country,
      spec: `${q.is_daily ? `${q.data_gb}GB/ngày` : `${q.data_gb}GB fixed`} × ${q.days} ngày`,
      new_cogs_usd: newCogsUsd,
      new_cogs_vnd: Math.round(newCogsVnd),
      current_cogs_usd: currentCogs,
      matched_sku: matchedSku,
      delta_usd: delta !== null ? Math.round(delta * 100) / 100 : null,
      delta_vnd: deltaVnd !== null ? Math.round(deltaVnd) : null,
      delta_pct: deltaPct !== null ? Math.round(deltaPct * 10) / 10 : null,
      recommendation: delta === null
        ? "Chưa có SKU tương đương để so sánh"
        : delta < -0.01
          ? `✅ RẺ HƠN ${Math.abs(delta).toFixed(2)} USD (${Math.abs(deltaPct!).toFixed(1)}%) — nên cập nhật COGS`
          : delta > 0.01
            ? `⚠️ ĐẮT HƠN ${delta.toFixed(2)} USD (${deltaPct!.toFixed(1)}%) — xem xét lại`
            : "≈ Bằng nhau — không cần thay đổi",
    }
  }))

  const cheaper = results.filter(r => r.delta_pct !== null && r.delta_pct < -1)
  const more_expensive = results.filter(r => r.delta_pct !== null && r.delta_pct > 1)

  return {
    fx_rate_used: fxRate,
    comparison: results,
    summary: {
      total_quotes: results.length,
      cheaper_than_current: cheaper.length,
      more_expensive: more_expensive.length,
      no_match_found: results.filter(r => r.delta_pct === null).length,
    },
  }
}
