// Tên thị trường dễ đọc cho tab Thị trường & Báo giá. Nhóm nhiều nước trong ref_support_countries chỉ có danh sách hàng chục tên nước
// (vd E33 = "United Kingdom, Denmark, Austria, …") — QA s225 với vai người dùng không rành: không đọc nổi. Quy tắc:
//  1 nước → tên tiếng Việt · 2–3 nước → nối tên ("Úc – New Zealand") · ≥ 4 nước → "Châu Âu · 34 nước (E33)" theo châu lục chiếm ≥ 75%.
import { supabaseAdmin } from "@/lib/supabase"
import { countryNameVn } from "@/lib/catalogue/country-index"

const CONTINENT_VN: Record<string, string> = {
  Africa: "Châu Phi", Americas: "Châu Mỹ", Asia: "Châu Á", Europe: "Châu Âu", "Middle East": "Trung Đông", Oceania: "Châu Đại Dương",
}

export function marketName(code: string, iso: string[], continentOf: (iso: string) => string | null): string {
  if (iso.length === 1) return countryNameVn(iso[0])
  if (iso.length >= 2 && iso.length <= 3) return iso.map(i => countryNameVn(i)).join(" – ")
  if (!iso.length) return code
  const count = new Map<string, number>()
  for (const i of iso) { const c = continentOf(i); if (c) count.set(c, (count.get(c) ?? 0) + 1) }
  const [top, n] = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const region = top && n / iso.length >= 0.75 ? CONTINENT_VN[top] ?? top : "Nhiều khu vực"
  return `${region} · ${iso.length} nước (${code})`
}

export const parseIsoList = (s: string | null | undefined) =>
  String(s ?? "").split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))

/** Mã thị trường (3 ký tự trong SKU) → tên dễ đọc. 2 lần đọc Supabase, không N+1. */
export async function loadMarketNames(): Promise<Map<string, string>> {
  const [{ data: groups }, { data: refs }] = await Promise.all([
    supabaseAdmin.from("ref_support_countries").select("code,country_codes"),
    supabaseAdmin.from("ref_countries").select("code,continent"),
  ])
  const cont = new Map((refs ?? []).map(r => [String(r.code).toUpperCase(), r.continent as string | null]))
  return new Map((groups ?? []).filter(g => g.code && g.code !== "000")
    .map(g => [String(g.code), marketName(String(g.code), parseIsoList(g.country_codes), i => cont.get(i) ?? null)]))
}
