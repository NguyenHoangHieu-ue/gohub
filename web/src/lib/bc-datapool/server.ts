import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"
import { countryNameVn } from "@/lib/catalogue/country-index"
import { loadEffectiveTable } from "@/lib/fx/server"
import { currentMonth, monthLabel, rateAt } from "@/lib/fx/table"
import { FRAME_SKU } from "./codes"
import type { PlanCatalog } from "./plan-catalog"
import { FORMULA_KEYS, resolveFormula } from "@/lib/datapool-formula"
import type { Assumptions, Fx, PriceList } from "./types"

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

/**
 * Tỷ giá lấy từ bảng "Tỷ giá nội bộ theo tháng" (Admin › Cài đặt) theo THÁNG HIỆN TẠI (chưa nhập thì lấy tháng gần nhất trước đó):
 * USD→VND = JSC · VND→USD = Inc · HKD/CNY↔USD = Inc. Thiếu tỷ giá thì báo rõ, không tự đoán.
 */
export async function loadFx(): Promise<Fx & { month: string; source: string }> {
  const { table, source } = await loadEffectiveTable()
  const month = currentMonth()
  const pick = (id: string, name: string) => {
    const hit = rateAt(table, id, month)
    if (!hit) throw new Error(`Thiếu tỷ giá nội bộ ${name} cho ${monthLabel(month)} — vào Admin › Cài đặt › Tỷ Giá Nội Bộ`)
    return hit.rate
  }
  return {
    hkdPerUsd: pick("INC:HKD/USD", "HKD/USD (Gohub Inc)"),
    cnyPerUsd: pick("INC:CNY/USD", "CNY/USD (Gohub Inc)"),
    vndPerUsd: pick("JSC:VND/USD", "VND/USD (Gohub JSC)"),
    vndPerUsdInc: pick("INC:VND/USD", "VNĐ/USD (Gohub Inc)"),
    month, source,
  }
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
export async function findExisting(table: "products" | "skus", column: "product_code" | "sku_code", codes: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const uniq = Array.from(new Set(codes))
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await supabaseAdmin.from(table).select(`${column},status`).in(column, uniq.slice(i, i + 100))
    for (const r of (data ?? []) as unknown as Record<string, string>[]) found.set(r[column], r.status ?? "?")
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

/** Giả định COGS lấy từ Admin › Cài đặt › Công thức Datapool (BC Datapool Unlimited = gói 3GB tốc độ cao + Unlimited 10Mbps → 1.7 GB/ngày). */
export async function loadAssumptions(): Promise<Assumptions> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").or("key.like.datapool.%,key.like.3hk.%")
  const f = resolveFormula(data ?? [])
  return {
    fixedPct: f[FORMULA_KEYS.fixed], dailyPct: f[FORMULA_KEYS.daily],
    unl3gb10: f[FORMULA_KEYS.unl3gb10],
  }
}
