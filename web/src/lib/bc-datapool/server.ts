import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"
import { countryNameVn } from "@/lib/catalogue/country-index"
import { FRAME_SKU } from "./codes"
import type { PlanCatalog } from "./plan-catalog"
import type { Fx, PriceList } from "./types"

export const PRICE_LIST_KEY = "bcdp.price_list"
export const PLAN_CATALOG_KEY = "bcdp.plan_catalog"

export async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  return !!session && (await canWrite(session, "bc-datapool", ["admin", "creator"]))
}

export async function loadPriceList(): Promise<PriceList | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", PRICE_LIST_KEY).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) as PriceList } catch { return null }
}

/** Tỷ giá lấy từ "Tỷ giá nội bộ" (app_settings fx.*) — không có thì báo lỗi rõ, không tự đoán. */
export async function loadFx(): Promise<Fx> {
  const { data, error } = await supabaseAdmin.from("app_settings").select("key,value").in("key", ["fx.hkd_usd", "fx.usd_cny", "fx.usd_vnd"])
  if (error) throw new Error(error.message)
  const m = new Map((data ?? []).map(r => [r.key as string, parseFloat(String(r.value))]))
  const fx = { hkdPerUsd: m.get("fx.hkd_usd"), cnyPerUsd: m.get("fx.usd_cny"), vndPerUsd: m.get("fx.usd_vnd") }
  for (const [k, v] of Object.entries(fx))
    if (!v || !Number.isFinite(v) || v <= 0) throw new Error(`Thiếu/sai tỷ giá nội bộ (${k}) — vào Admin › Cài đặt › Tỷ Giá Nội Bộ`)
  return fx as Fx
}

export interface SupportCountry { code: string; en: string; vn: string; iso: string }

export async function loadSupportCountries(): Promise<SupportCountry[]> {
  const { data, error } = await supabaseAdmin.from("ref_support_countries").select("code,support_country,support_country_vn,country_codes").order("code")
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(r => r.code && r.code !== "000")
    .map(r => {
      const iso = String(r.country_codes ?? "").trim()
      const first = iso.split(/[,\s]+/)[0] ?? ""
      const vn = r.support_country_vn || (/^[A-Za-z]{2}$/.test(first) && !iso.includes(",") ? countryNameVn(first) : String(r.support_country ?? ""))
      return { code: String(r.code), en: String(r.support_country ?? ""), vn, iso }
    })
}

/** Mã đã có trong hệ thống — gom theo lô (không N+1) để cảnh báo trùng trước khi xuất. */
export async function findExisting(table: "products" | "skus", column: "product_code" | "sku_code", codes: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  const uniq = Array.from(new Set(codes))
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await supabaseAdmin.from(table).select(column).in(column, uniq.slice(i, i + 100))
    for (const r of (data ?? []) as unknown as Record<string, string>[]) found.add(r[column])
  }
  return found
}

export async function loadPlanCatalog(): Promise<PlanCatalog | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", PLAN_CATALOG_KEY).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) as PlanCatalog } catch { return null }
}

export const catalogSummary = (c: PlanCatalog | null) =>
  c ? { uploadedAt: c.uploadedAt, files: c.files, lastDiff: c.lastDiff ?? null, esim: c.plans.filter(p => p.sim === "eSIM").length, sim: c.plans.filter(p => p.sim === "SIM").length } : null

/** Giá SIM trắng (VND) = latest_cogs của SKU khung SIM BC Datapool trong hệ thống. null nếu chưa có / khác VND. */
export async function loadWhiteSimVnd(): Promise<number | null> {
  const { data } = await supabaseAdmin.from("skus").select("latest_cogs,latest_cogs_currency").eq("sku_code", FRAME_SKU.VN).maybeSingle()
  const v = Number(data?.latest_cogs)
  return data && data.latest_cogs_currency === "VND" && v > 0 ? v : null
}
