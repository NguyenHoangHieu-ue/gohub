// Truy vấn Supabase cho Product Catalogue (server-only). Không gọi gohub_dw, không doanh thu, không AI.
import { supabaseAdmin } from "@/lib/supabase"
import type {
  CatalogueIndex, CatalogueProductLite, CatalogueCountryRef, CatalogueVendorRef, SkuAggregate, DataKind,
} from "./types"
import { isHiddenStatus, toGb, UNLIMITED_GB, yesNo } from "./plain-language"

const PAGE = 1000            // Supabase project này cap 1000 dòng/response — phải phân trang
const PARALLEL = 4

/** Đọc toàn bộ bảng theo trang 1000 dòng. Đếm trước (1 request) rồi tải các trang song song có giới hạn — không N+1. */
export async function fetchAllRows<T = Record<string, unknown>>(
  table: string, select: string, orderCol: string,
): Promise<T[]> {
  const { count, error: cErr } = await supabaseAdmin.from(table).select(orderCol, { count: "exact", head: true })
  if (cErr) throw new Error(`[catalogue] đếm ${table}: ${cErr.message}`)
  const total = count ?? 0
  const starts: number[] = []
  for (let i = 0; i < total; i += PAGE) starts.push(i)
  const out: T[][] = new Array(starts.length)
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const slice = starts.slice(i, i + PARALLEL)
    const res = await Promise.all(slice.map(async (from, k) => {
      const { data, error } = await supabaseAdmin.from(table).select(select).order(orderCol).range(from, from + PAGE - 1)
      if (error) throw new Error(`[catalogue] đọc ${table}: ${error.message}`)
      return { k: i + k, rows: (data ?? []) as unknown as T[] }
    }))
    for (const r of res) out[r.k] = r.rows
  }
  return out.flat()
}

const SKU_LIVE = new Set(["Active", "Temporary"])

interface SkuMini {
  product_code: string; status: string | null; throttle_speed?: string | null
  data_amount: number | null; data_amount_unit: string | null; day_amount: number | null
}

export function aggregateSkus(rows: SkuMini[]): Map<string, SkuAggregate> {
  const m = new Map<string, SkuAggregate>()
  for (const r of rows) {
    if (!r.product_code || !SKU_LIVE.has(r.status ?? "")) continue
    const a = m.get(r.product_code) ?? { count: 0, gbMin: null, gbMax: null, hasUnlimited: false, daysMin: null, daysMax: null, throttles: [] }
    a.count++
    const th = (r.throttle_speed ?? "").trim()
    if (th && a.throttles.length < 4 && !a.throttles.includes(th)) a.throttles.push(th)
    const gb = toGb(r.data_amount, r.data_amount_unit)
    if (gb != null) {
      if (gb >= UNLIMITED_GB) a.hasUnlimited = true
      else {
        a.gbMin = a.gbMin == null ? gb : Math.min(a.gbMin, gb)
        a.gbMax = a.gbMax == null ? gb : Math.max(a.gbMax, gb)
      }
    }
    if (r.day_amount != null) {
      const d = Number(r.day_amount)
      a.daysMin = a.daysMin == null ? d : Math.min(a.daysMin, d)
      a.daysMax = a.daysMax == null ? d : Math.max(a.daysMax, d)
    }
    m.set(r.product_code, a)
  }
  return m
}

const EMPTY_AGG: SkuAggregate = { count: 0, gbMin: null, gbMax: null, hasUnlimited: false, daysMin: null, daysMax: null, throttles: [] }

function dataKindOf(v: string | null): DataKind {
  const s = (v ?? "").toLowerCase()
  if (s.startsWith("fixed")) return "fixed"
  if (s.startsWith("daily")) return "daily"
  return (v ?? "").trim() || null    // kiểu mới → giữ nguyên chuỗi gốc, giao diện tự hiện + tự thêm bộ lọc
}

export function parseCountries(v: string | null): string[] {
  return Array.from(new Set((v ?? "").split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))))
}

interface ProductRow {
  product_code: string; vendor_code: string | null; operator_code: string | null; tenant: string | null
  status: string | null; type_of_sim: string | null; data_type: string | null; network_type: string | null
  onsite_carrier: string | null; supported_countries: string | null; hotspot: string | null
  kyc_needed: string | null; local_phone_number: string | null; local_number_country: string | null
}

export function toLite(p: ProductRow, agg: Map<string, SkuAggregate>): CatalogueProductLite {
  return {
    code: p.product_code,
    vendorCode: p.vendor_code ?? "",
    operatorCode: p.operator_code,
    tenant: p.tenant ?? "",
    status: p.status ?? "",
    sim: (p.type_of_sim ?? "").trim() || "SIM",
    dataKind: dataKindOf(p.data_type),
    network: p.network_type,
    carrierRaw: p.onsite_carrier,
    countries: parseCountries(p.supported_countries),
    hotspot: yesNo(p.hotspot),
    kycNeeded: yesNo(p.kyc_needed),
    localNumber: yesNo(p.local_phone_number),
    localNumberCountry: p.local_number_country,
    sku: agg.get(p.product_code) ?? EMPTY_AGG,
  }
}

export async function buildCatalogueIndex(): Promise<CatalogueIndex> {
  const [products, skus, countries, vendors, sync] = await Promise.all([
    fetchAllRows<ProductRow>(
      "products",
      "product_code,vendor_code,operator_code,tenant,status,type_of_sim,data_type,network_type,onsite_carrier,supported_countries,hotspot,kyc_needed,local_phone_number,local_number_country",
      "product_code",
    ),
    fetchAllRows<SkuMini>("skus", "product_code,status,data_amount,data_amount_unit,day_amount,throttle_speed", "sku_code"),
    supabaseAdmin.from("ref_countries").select("code,name,name_vn,continent").limit(1000),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name,description").limit(1000),
    supabaseAdmin.from("sync_log").select("last_sync").eq("table_name", "products").maybeSingle(),
  ])
  if (countries.error) throw new Error(`[catalogue] ref_countries: ${countries.error.message}`)
  if (vendors.error) throw new Error(`[catalogue] ref_vendors: ${vendors.error.message}`)

  const agg = aggregateSkus(skus)
  return {
    // Inactive/Deleted không đưa lên Catalogue (loại từ server → payload nhỏ hơn, mọi bộ đếm/tab đều tự đúng)
    products: products.filter(p => !isHiddenStatus(p.status)).map(p => toLite(p, agg)),
    countries: (countries.data ?? []).map((c): CatalogueCountryRef => ({
      code: String(c.code), name: String(c.name ?? c.code), nameVn: c.name_vn ?? null, continent: c.continent ?? null,
    })),
    vendors: (vendors.data ?? []).map((v): CatalogueVendorRef => ({
      code: String(v.vendor_code), name: String(v.name ?? v.vendor_code),
      // dòng do sync tự thêm (tên tạm) — banner admin nhắc sửa cho đẹp
      autoAdded: String(v.description ?? "").startsWith("Tự thêm bởi sync"),
    })),
    lastSync: (sync.data?.last_sync as string | undefined) ?? null,
    generatedAt: new Date().toISOString(),
  }
}

/** Vai trò được xem giá vốn (COGS) trong ngăn chi tiết. */
export const COGS_ROLES = new Set(["admin", "creator", "product"])
