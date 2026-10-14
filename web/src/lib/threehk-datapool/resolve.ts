import { ISO3, nameToIso2, pickSupportCountry, pickSupportGroup } from "@/lib/bc-datapool/iso"
import type { SupportCountry } from "@/lib/bc-datapool/server"
import type { ThkPrice } from "./builder"

export interface NccRow { zone: string; country: string; network: string; price_per_gb_hkd: number; is_kyc: boolean }

/** Giá áp dụng = nước đắt nhất trong các nước của gói (quy tắc chung với BC Datapool). */
export function priceOf(rows: NccRow[], countries: string[]): ThkPrice | null {
  const chosen = countries.map(c => rows.find(r => r.country === c)).filter((r): r is NccRow => !!r && r.price_per_gb_hkd > 0)
  if (!chosen.length || chosen.length !== countries.length) return null
  const top = chosen.reduce((m, r) => (r.price_per_gb_hkd > m.price_per_gb_hkd ? r : m))
  const network = chosen.length > 1 ? chosen.map(r => `${r.country}: ${r.network}`).join("\n") : chosen[0].network
  return { pricePerGbHkd: top.price_per_gb_hkd, network, kyc: chosen.some(r => r.is_kyc) }
}

export interface ResolvedSupport { code: string; iso: string; en: string; vn: string; hint: string }

/**
 * Mã nước/nhóm nước hỗ trợ của 1 gói: 1 nước → khớp tên (hoặc ISO), nhiều mã cùng tên thì ưu tiên ISO alpha-3; nhiều nước → nhóm có tập nước KHỚP ĐÚNG.
 * Không chắc thì để trống mã + giải thích (không tự đặt mã).
 */
export function resolveSupport(countries: string[], groups: SupportCountry[], refs: { code: string; name: string }[]): ResolvedSupport {
  if (countries.length > 1) {
    const g = pickSupportGroup(groups, countries, refs)
    const first = g.matches[0]
    const hint = g.unresolved.length ? `Không nhận ra nước: ${g.unresolved.join(", ")}`
      : g.matches.length === 0 ? `Chưa có nhóm nước hỗ trợ nào gồm đúng ${g.iso.join(", ")} (không thừa, không thiếu) — tạo nhóm trước hoặc tự nhập mã`
      : g.matches.length > 1 ? `Có ${g.matches.length} nhóm cùng đúng các nước này: ${g.matches.map(m => m.code).join(", ")} — nhập mã đúng`
      : `Khớp nhóm ${first.code} (${first.iso})`
    return { code: g.matches.length === 1 ? first.code : "", iso: first?.iso ?? g.iso.join(", "), en: first?.en ?? countries.join(", "), vn: first?.vn ?? "", hint }
  }
  const name = countries[0] ?? ""
  let { match, code, candidates } = pickSupportCountry(groups, name)
  if (!match) {
    // Tên trong ncc_3hk khác tên nhóm hỗ trợ (US/USA, South Korea...) → tìm theo ISO2
    const iso2 = nameToIso2(name, refs, groups)
    const single = iso2 ? groups.filter(g => g.iso.split(/[,\s]+/).filter(Boolean).join() === iso2) : []
    if (single.length) {
      const exact = single.find(g => g.code === ISO3[iso2!])
      match = exact ?? single[0]; code = exact?.code ?? (single.length === 1 ? single[0].code : ""); candidates = exact || single.length === 1 ? [] : single.map(g => g.code)
    }
  }
  return {
    code, iso: match?.iso ?? "", en: match?.en ?? name, vn: match?.vn ?? "",
    hint: !match ? `Không tìm thấy nước "${name}" trong Nhóm Nước Hỗ Trợ — nhập mã tay` : candidates.length ? `Có nhiều mã cho ${name}: ${candidates.join(", ")} — chọn mã đúng` : "",
  }
}


export interface CoveredGroup { code: string; en: string; countries: string[] }

/** Nhóm nước hỗ trợ (≥ 2 nước) mà MỌI nước đều có trong bảng giá ncc_3hk → chọn 1 phát thêm cả nhóm. */
export function coveredGroups(ncc: NccRow[], groups: SupportCountry[], refs: { code: string; name: string }[]): CoveredGroup[] {
  const nameByIso = new Map<string, string>()
  for (const r of ncc) { const i = nameToIso2(r.country, refs, groups); if (i && !nameByIso.has(i)) nameByIso.set(i, r.country) }
  const out: CoveredGroup[] = []
  for (const g of groups) {
    const isos = g.iso.split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))
    if (isos.length < 2 || !isos.every(i => nameByIso.has(i))) continue
    out.push({ code: g.code, en: g.en, countries: isos.map(i => nameByIso.get(i)!) })
  }
  return out.sort((a, b) => b.countries.length - a.countries.length || a.code.localeCompare(b.code))
}
