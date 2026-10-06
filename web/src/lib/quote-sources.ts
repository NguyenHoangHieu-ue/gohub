// Nạp 3 nguồn báo giá đã có trong hệ thống + catalog SKU → bảng so giá cho SKU đang bán (mốc 2a tab Thị trường & Báo giá).
//  3HK: Supabase `ncc_3hk` (HKD/GB theo nước) · BC Datapool: `app_settings.bcdp.price_list` (file Pool Offer, CMHK HKD + Singtel USD)
//  WorldMove: `ncc_worldmove` (giá gói TWD, status active). Phí khung: SKU khung `?B000<vc>K00000` (eSIM profile) / `?D000<vc>K00000` (SIM).
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery, QUERY_TTL_MIN } from "@/lib/analytics-helpers"
import { loadEffectiveTable } from "@/lib/fx/server"
import { convert, currentMonth, type Ccy, type FxTable } from "@/lib/fx/table"
import { loadPriceList, loadRefCountries, loadSupportCountries, loadAssumptions } from "@/lib/bc-datapool/server"
import { nameToIso2, type RefCountryLite, type SupportCountryLite } from "@/lib/bc-datapool/iso"
import { FORMULA_KEYS, resolveFormula } from "@/lib/datapool-formula"
import { loadMarketData } from "@/lib/market-data"
import type { MarketData } from "@/lib/market-breakdown"
import {
  addPackage, addPoolPrice, compareRow, packageOffer, poolOffer, specFromSku,
  type CompareRow, type Offer, type PackageSource, type PlanKind, type PoolPrice, type PoolSource,
} from "@/lib/quote-compare"

export interface QuoteCompareData {
  quarter: string; group: MarketData["group"]
  fxMonth: string; vndPerUsd: number
  assumptions: { fixedPct: number; dailyPct: number }
  sources: { id: string; label: string; note: string }[]
  rows: CompareRow[]
  skipped: { reason: string; count: number }[]
  unresolvedNames: string[]          // tên nước trong báo giá không nhận ra (để bổ sung alias)
}

// dim_sku.vendor → id nguồn báo giá (để biết phương án nào là vendor hiện tại)
const VENDOR_SOURCE: Record<string, string> = {
  "3HKDATAPOOL": "3HK", "BCDATAPOOL(CMHK)": "BC_CMHK", "BCDATAPOOL(SINGTEL)": "BC_SINGTEL", WORLDMOVE: "WM",
}
const vendorSource = (v: string) => VENDOR_SOURCE[v.toUpperCase().replace(/\s+/g, "")] ?? null

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

function usd(t: FxTable, amount: number, ccy: string, month: string): number | null {
  if (!(amount > 0)) return null
  return convert(t, amount, ccy.toUpperCase() as Ccy, "USD", month)?.value ?? null
}

export async function loadQuoteCompare(quarter: string, group: MarketData["group"], bypass = false): Promise<QuoteCompareData> {
  return cachedQuery<QuoteCompareData>(`market-quotes:v1:${quarter}:${group}`, async () => {
    const month = currentMonth()
    const [market, fx, priceList, refs, groups, assumptionsBc, formulaRows, hk3, wm, frames] = await Promise.all([
      loadMarketData(quarter, group, bypass),
      loadEffectiveTable(),
      loadPriceList(),
      loadRefCountries(),
      loadSupportCountries(),
      loadAssumptions(),
      supabaseAdmin.from("app_settings").select("key,value").or("key.like.datapool.%,key.like.3hk.%").then(r => r.data ?? []),
      supabaseAdmin.from("ncc_3hk").select("country,network,price_per_gb_hkd,is_kyc").then(r => r.data ?? []),
      fetchAll<any>((a, b) => supabaseAdmin.from("ncc_worldmove")
        .select("vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,cogs,cogs_currency,is_kyc,status")
        .eq("status", "active").eq("sim_type", "eSIM").order("id").range(a, b)),
      supabaseAdmin.from("skus").select("sku_code,latest_cogs,latest_cogs_currency").like("sku_code", "__000__K00000").then(r => r.data ?? []),
    ])
    const t = fx.table
    const vndPerUsd = convert(t, 1, "USD", "VND", month)?.value
    if (!vndPerUsd) throw new Error("Thiếu tỷ giá USD→VND (Admin › Cài đặt › Tỷ Giá Nội Bộ)")
    const f = resolveFormula(formulaRows)
    const a = { fixedPct: f[FORMULA_KEYS.fixed], dailyPct: f[FORMULA_KEYS.daily] }

    const unresolved = new Set<string>()
    const iso2 = (name: string) => {
      const n = name.trim()
      const hit = /^[A-Z]{2}$/.test(n) && refs.some(r => r.code.toUpperCase() === n) ? n : nameToIso2(n, refs as RefCountryLite[], groups as SupportCountryLite[])
      if (!hit) unresolved.add(n)
      return hit
    }

    // Phí khung theo vendor code + tenant (VN = mã bắt đầu bằng số, US = chữ)
    const frameUsd = (vc: string, type: "B" | "D", tenant: "VN" | "US"): number | null => {
      const pick = (tn: "VN" | "US") => frames.find(r => r.sku_code[1] === type && r.sku_code.slice(5, 7) === vc && (/^\d/.test(r.sku_code) ? "VN" : "US") === tn)
      const r = pick(tenant) ?? pick(tenant === "VN" ? "US" : "VN")
      return r ? usd(t, Number(r.latest_cogs), String(r.latest_cogs_currency), month) : null
    }

    // ── Nguồn pool ──
    const hkdToUsd = usd(t, 1, "HKD", month)
    const cnyToUsd = usd(t, 1, "CNY", month)
    const pools: PoolSource[] = []
    if (hkdToUsd) {
      const byIso = new Map<string, PoolPrice>()
      for (const r of hk3) { const i = iso2(String(r.country)); if (i) addPoolPrice(byIso, i, { price: Number(r.price_per_gb_hkd), operator: String(r.network ?? ""), kyc: !!r.is_kyc }) }
      pools.push({
        id: "3HK", label: "3HK Datapool", currency: "HKD", toUsd: hkdToUsd, byIso,
        frameUsd: { eSIM: frameUsd("3D", "B", "US"), SIM: frameUsd("3D", "D", "VN") },
        unlimitedGbPerDay: s => s === 5 ? f[FORMULA_KEYS.unl500mb5] : s === 10 ? f[FORMULA_KEYS.unl500mb10] : null,
      })
    }
    if (priceList && hkdToUsd && cnyToUsd) {
      const whiteSim = frameUsd("WD", "D", "VN")
      for (const [pool, id, label] of [["CMHK", "BC_CMHK", "BC Datapool (CMHK)"], ["SINGTEL", "BC_SINGTEL", "BC Datapool (Singtel)"]] as const) {
        const pl = priceList.pools[pool]
        if (!pl) continue
        const toUsd = pl.currency === "HKD" ? hkdToUsd : 1
        const byIso = new Map<string, PoolPrice>()
        for (const r of pl.rows) { const i = iso2(r.coverage); if (i) addPoolPrice(byIso, i, { price: r.pricePerGb, operator: r.operator, kyc: r.kyc }) }
        const imsi = pl.imsiFee * toUsd
        pools.push({
          id, label, currency: pl.currency, toUsd, byIso,
          frameUsd: { eSIM: pl.esimFeeCny * cnyToUsd + imsi, SIM: whiteSim === null ? null : whiteSim + imsi },
          unlimitedGbPerDay: s => s === 10 ? assumptionsBc.unl3gb10 : null,
        })
      }
    }

    // ── Nguồn gói: WorldMove ──
    const wmSrc: PackageSource = { id: "WM", label: "WorldMove", offers: new Map(), simFrameUsd: frameUsd("WM", "D", "VN") }
    for (const r of wm) {
      const names = String(r.region ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)
      const isos = names.map(iso2)
      if (!isos.length || isos.some(x => !x)) continue
      const price = usd(t, Number(r.cogs), String(r.cogs_currency || "TWD"), month)
      if (!price || !r.days) continue
      const plan: PlanKind = r.is_unlimited ? "Unlimited" : r.is_daily ? "Daily" : "Fixed"
      addPackage(wmSrc, { iso: Array.from(new Set(isos as string[])).sort(), plan, dataGb: Number(r.data_gb) || 0, days: Number(r.days), priceUsd: price, name: String(r.product_name ?? r.vendor_product_id), kyc: !!r.is_kyc })
    }

    // ── SKU đang bán trong quý ──
    const cur = new Set(market.curMonths.map(m => market.months.indexOf(m)))
    const sold = new Map<number, { units: number; rev: number }>()
    for (const [si, mi, rev, , units] of market.cells) {
      if (!cur.has(mi)) continue
      const x = sold.get(si) ?? { units: 0, rev: 0 }
      x.units += units; x.rev += rev
      sold.set(si, x)
    }
    const codes = Array.from(sold.keys()).map(i => market.skus[i].sku)
    const catalog = new Map<string, any>()
    for (let i = 0; i < codes.length; i += 400) {
      const { data } = await supabaseAdmin.from("skus")
        .select("sku_code,tenant,data_amount,data_amount_unit,day_amount,latest_cogs,latest_cogs_currency").in("sku_code", codes.slice(i, i + 400))
      for (const r of data ?? []) catalog.set(String(r.sku_code), r)
    }
    const isoOfMarket = new Map(groups.map(g => [g.code, g.iso.split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))]))

    const rows: CompareRow[] = []
    const skip = new Map<string, number>()
    const bump = (r: string) => skip.set(r, (skip.get(r) ?? 0) + 1)
    sold.forEach(({ units, rev }, si) => {
      const s = market.skus[si]
      const c = catalog.get(s.sku)
      if (!c) return bump("SKU không có trong catalog Supabase")
      const iso = isoOfMarket.get(s.country_code) ?? []
      if (!iso.length) return bump("Mã thị trường chưa có danh sách nước (ref_support_countries)")
      const spec = specFromSku(s.sku, iso, c.data_amount, c.data_amount_unit, c.day_amount)
      if (!spec) return bump("Không phải gói data so được (khung/profile, mã cũ, thiếu dung lượng)")
      const offers: Offer[] = []
      for (const p of pools) { const o = poolOffer(p, spec, a); if (o) offers.push(o) }
      const w = packageOffer(wmSrc, spec); if (w) offers.push(w)
      rows.push(compareRow({
        sku: s.sku, market: s.country, vendor: s.vendor, form: spec.form, plan: spec.plan, size: s.size, units, rev,
        currentUsd: usd(t, Number(c.latest_cogs), String(c.latest_cogs_currency || "VND"), month),
      }, offers, vendorSource(s.vendor), vndPerUsd))
    })
    rows.sort((x, y) => (y.saveQuarterVnd ?? -Infinity) - (x.saveQuarterVnd ?? -Infinity) || y.rev - x.rev)

    return {
      quarter, group, fxMonth: month, vndPerUsd, assumptions: a,
      sources: [
        ...pools.map(p => ({ id: p.id, label: p.label, note: `${p.byIso.size} nước · ${p.currency}/GB` })),
        { id: "WM", label: "WorldMove", note: `${wmSrc.offers.size} gói eSIM (nước đơn/nhóm nước khớp được)` },
      ],
      rows,
      skipped: Array.from(skip.entries()).map(([reason, count]) => ({ reason, count })),
      unresolvedNames: Array.from(unresolved).slice(0, 50),
    }
  }, QUERY_TTL_MIN, bypass)
}
