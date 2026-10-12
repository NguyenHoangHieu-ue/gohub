import { supabaseAdmin } from "@/lib/supabase"
import { FRAME, VENDOR, type Frames, type ProductTpl } from "./builder"

import type { NccRow } from "./resolve"

export async function loadNcc3hk(): Promise<NccRow[]> {
  const { data, error } = await supabaseAdmin.from("ncc_3hk").select("zone,country,network,price_per_gb_hkd,is_kyc").order("country")
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ zone: String(r.zone ?? ""), country: String(r.country ?? ""), network: String(r.network ?? ""), price_per_gb_hkd: Number(r.price_per_gb_hkd), is_kyc: !!r.is_kyc }))
}

const TPL_COLS = "product_code,tenant,supported_countries,network_type,onsite_carrier,kyc_code,kyc_needed,kyc_links,note,activation_time,activation,local_phone_number,local_number_country,top_up_options,hotspot,apn_original,apn"

/** Product 3HK đã có theo mã nước (gom 1 truy vấn / nước, không N+1 theo sản phẩm). */
export async function loadTemplates(country3: string[]): Promise<Record<string, ProductTpl[]>> {
  const out: Record<string, ProductTpl[]> = {}
  const uniq = Array.from(new Set(country3.filter(c => /^[A-Z0-9]{3}$/.test(c))))
  await Promise.all(uniq.map(async c => {
    const { data } = await supabaseAdmin.from("products").select(TPL_COLS).like("product_code", `__${c}${VENDOR}_`).neq("status", "Deleted")
    out[c] = (data ?? []) as unknown as ProductTpl[]
  }))
  return out
}

/** Giá khung từ hệ thống: eSIM (USD) · SIM US (USD) · SIM VN (VND). null nếu thiếu / sai tiền tệ. */
export async function loadFrames(): Promise<Frames> {
  const { data } = await supabaseAdmin.from("skus").select("sku_code,latest_cogs,latest_cogs_currency").in("sku_code", [FRAME.esimUs, FRAME.simUs, FRAME.simVn])
  const get = (code: string, cur: string) => {
    const r = (data ?? []).find(x => x.sku_code === code)
    const v = Number(r?.latest_cogs)
    return r && r.latest_cogs_currency === cur && v > 0 ? v : null
  }
  return { esimUsUsd: get(FRAME.esimUs, "USD"), simUsUsd: get(FRAME.simUs, "USD"), simVnVnd: get(FRAME.simVn, "VND") }
}
