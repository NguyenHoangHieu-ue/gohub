import { digest, fmtNum } from "./digest"
import { SKU_SCOPES, buildProductCatalog, buildSkuPack } from "./catalog-packs"
import { gmPct, groupBy, type Dimension, type MarketData } from "@/lib/market-breakdown"

// "Gói dữ liệu" của Phòng Argon: số liệu hệ thống MỚI NHẤT lấy từ chính các endpoint của tab analytics (cùng logic, cùng số với tab) qua Bearer CRON_SECRET
// (cùng cơ chế prewarm), rút gọn thành văn bản rồi lưu thành nguồn của dự án. Chỉ GỌI endpoint trong danh sách dưới (chỉ đọc).
export interface PackDef {
  id: string; label: string; description: string
  noQuarter?: boolean                         // gói không theo quý (quý giả "all")
  scopes?: { id: string; label: string }[]    // gói theo NHÓM (vd vendor): giá trị chọn nằm ở trường quarter của nguồn
  noTool?: boolean                            // quá lớn / không phải số liệu kỳ → không đưa vào công cụ lấy số liệu của Argon
}
/** Quý giả cho gói không theo quý (vd Wiki) — đi vào external_id/meta để dùng chung đường thêm + đồng bộ. */
export const NO_QUARTER = "all"

export const PACKS: PackDef[] = [
  { id: "quarter-report", label: "Quarter Report — tổng quan quý", description: "Doanh thu, GP, CH.Cost, Group Cost, CM1, %3HK theo tháng (thực tế + pro-rata) cho tổng/B2B/B2C, quý trước, bảng kênh B2B/B2C." },
  { id: "b2b-tiers", label: "B2B theo nhóm khách (Strategic/VIP/Gold/Silver)", description: "Tổng từng nhóm theo tháng + 40 khách lớn nhất mỗi nhóm (doanh thu, GP, CH.Cost, CM1, %3HK, QoQ)." },
  { id: "squad-progress", label: "Squad Progress — tiến độ target", description: "Từng squad: doanh thu/GP/CM1/3HK so với target, mức rủi ro, vòng đời khách, và 40 khách lớn nhất mỗi squad." },
  { id: "market", label: "Thị trường — doanh thu theo nước / vendor / loại gói", description: "Doanh thu, GP, %GM, số lượng và so quý trước, gộp theo thị trường (top 30), vendor và kiểu gói." },
  { id: "period-overview", label: "Tổng quan kỳ — BOD + KPI tháng + target", description: "Tổng doanh thu/GP/GPM2/3HK so kỳ trước, KPI theo tháng, tiến độ target — từ đầu quý đến hôm qua." },
  { id: "channels", label: "Kênh bán — doanh thu / GP / CM1 theo kênh", description: "Từng kênh: doanh thu, GP, GPM2, số đơn, doanh thu kỳ trước và %MoM — từ đầu quý đến hôm qua (cùng số với bảng kênh ở tab Channels; không có CM1)." },
  { id: "product-catalog", label: "Danh mục Product (sync từ database)", description: "Mọi Product trừ Deleted: vendor, loại, quốc gia, nhà mạng, KYC, số SKU và khoảng giá vốn — để so sánh cấu hình/giá giữa Product, vendor.", noQuarter: true, noTool: true },
  { id: "skus-by-vendor", label: "SKU theo vendor (sync từ database)", description: "Từng SKU ĐANG ACTIVE của 1 nhóm vendor: data, thời hạn, throttle, giá vốn hiện tại, vendorSku. Chọn nhóm vendor; 3HK ~8.200 SKU (~480k token, gần nửa cửa sổ 1M — thêm khi cần).", scopes: SKU_SCOPES.map(x => ({ id: x.id, label: x.label })), noTool: true },
  { id: "wiki-business", label: "Wiki nghiệp vụ GoHub (từ Wiki trong hệ thống)", description: "Các trang Wiki nghiệp vụ hiện hành (chính sách, vendor, quy tắc giá, quy trình…), không gồm hướng dẫn kỹ thuật các tab. Không theo quý.", noQuarter: true },
]

/** Gói tính được theo khoảng ngày tuỳ chọn (đã đủ tham số startDate/endDate ở endpoint). */
export const RANGE_PACKS = ["period-overview", "channels"]

export interface QuarterRef { q: number; year: number; label: string; start: string; end: string }

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** "Q4-2026" → khoảng ngày; end = min(cuối quý, hôm qua theo giờ VN). Quý chưa bắt đầu → lỗi. */
export function parseQuarter(label: string, now = new Date()): QuarterRef {
  const m = label.match(/^Q([1-4])-(\d{4})$/)
  if (!m) throw new Error(`Quý không hợp lệ: "${label}" (dạng Q4-2026)`)
  const q = Number(m[1]), year = Number(m[2])
  const start = `${year}-${pad((q - 1) * 3 + 1)}-01`
  const qEnd = ymd(new Date(Date.UTC(year, q * 3, 0)))
  const yesterday = ymd(new Date(now.getTime() + 7 * 3600_000 - 86_400_000))
  if (yesterday < start) throw new Error(`${label} chưa có dữ liệu (bắt đầu ${start})`)
  return { q, year, label, start, end: yesterday < qEnd ? yesterday : qEnd }
}

async function call(origin: string, path: string): Promise<any> {
  if (!process.env.CRON_SECRET) throw new Error("Thiếu CRON_SECRET trên server")
  const res = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(150_000) })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${(j as { error?: string } | null)?.error ?? `HTTP ${res.status}`}`)
  return j
}

const keep = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))
const top = <T,>(a: unknown, key: string, n: number): T[] => (Array.isArray(a) ? ([...a] as Record<string, number>[]).sort((x, y) => Number(y[key] ?? 0) - Number(x[key] ?? 0)).slice(0, n) as unknown as T[] : [])

function marketTable(title: string, rows: ReturnType<typeof groupBy>): string {
  const body = rows.map(r => `| ${r.key} | ${fmtNum(r.rev)} | ${fmtNum(r.gp)} | ${gmPct(r.gp, r.rev).toFixed(1)}% | ${fmtNum(r.units)} | ${fmtNum(r.revPrev)} | ${r.revPrev > 0 ? `${((r.rev / r.revPrev - 1) * 100).toFixed(1)}%` : ""} | ${r.skuCount} |`)
  return `### ${title}\n| nhóm | doanh thu | GP | %GM | số lượng | doanh thu quý trước | %QoQ doanh thu | số SKU |\n|---|---|---|---|---|---|---|---|\n${body.join("\n")}`
}

/** Dựng nội dung 1 gói cho 1 quý. `origin` = gốc URL của chính server này (vd https://intel-v2.gohub.cloud). */
export async function buildPack(id: string, quarterLabel: string, origin: string, range?: { start: string; end: string }): Promise<{ title: string; text: string }> {
  if (id === "wiki-business") return buildWikiPack()
  if (id === "product-catalog") return buildProductCatalog()
  if (id === "skus-by-vendor") return buildSkuPack(quarterLabel)   // với gói theo nhóm, trường "quarter" chứa id nhóm vendor
  // Khoảng ngày tuỳ chọn (công cụ của Argon): chỉ các gói tính theo khoảng ngày, bỏ qua quý.
  if (range && !RANGE_PACKS.includes(id)) throw new Error(`Báo cáo "${id}" chỉ theo quý, không theo khoảng ngày`)
  const r: QuarterRef = range ? { q: 0, year: 0, label: `${range.start} → ${range.end}`, start: range.start, end: range.end } : parseQuarter(quarterLabel)
  const note = `Lấy lúc ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${r.label} · dữ liệu đến ${r.end} (hôm qua). Đơn vị tiền: VND. "pro-rata/PR" = chiếu cả tháng/quý theo số ngày đã qua.`
  switch (id) {
    case "quarter-report": {
      const j = await call(origin, `/api/analytics/quarterly-report?quarter=Q${r.q}&year=${r.year}&companyCode=ALL`)
      return { title: `📊 Quarter Report ${r.label}`, text: `${note}\n\n${digest(keep(j, ["quarter", "year", "months", "elapsed_days", "quarter_days", "summary", "quarterTotal", "prevQuarterTotals", "b2bChannels", "b2cChannels", "customerLifecycle"]), "Quarter Report", { maxRows: 120 })}` }
    }
    case "b2b-tiers": {
      const j = await call(origin, `/api/analytics/quarterly-b2b-customers?quarter=Q${r.q}&year=${r.year}&companyCode=ALL`)
      const tiers = (j.tiers ?? []).map((t: Record<string, unknown>) => ({
        ...Object.fromEntries(Object.entries(t).filter(([k, v]) => !Array.isArray(v) && (typeof v !== "object" || v === null) && k !== "byRegion")),
        months: t.months,
        top_customers: top<Record<string, unknown>>(t.customers, "revenue", 40).map(c => keep(c, ["code", "name", "region", "orgName", "revenue", "gm", "gmPct", "cc", "cm1", "cm1Pct", "hk3Rev", "hk3Pct", "qoqPct", "prevCm1"])),
      }))
      return { title: `📊 B2B theo nhóm khách ${r.label}`, text: `${note}\n(Số liệu chiếu: tháng đang chạy đã nhân hệ số theo ngày; xem cột actual/PR của từng tháng.)\n\n${tiers.map((t: Record<string, unknown>) => digest(t, `Nhóm ${String(t.tier)}`, { maxRows: 60 })).join("\n\n")}` }
    }
    case "squad-progress": {
      const j = await call(origin, `/api/analytics/squad-progress?quarter=Q${r.q}&year=${r.year}`)
      const squads = (j.squads ?? []).map((s: Record<string, unknown>) => ({
        ...Object.fromEntries(Object.entries(s).filter(([, v]) => v === null || typeof v !== "object")),
        risk_counts: s.risk_counts, tier_counts: s.tier_counts, lifecycle: s.lifecycle, monthly: s.monthly,
        top_customers: top<Record<string, unknown>>(s.customers, "revenue_pr", 40).map(c => keep(c, ["customer_code", "customer_name", "org_name", "sales_pic", "tier", "region", "lifecycle_state", "prev_revenue", "revenue", "revenue_pr", "target_rev", "cm1", "cm1_pr", "target_cm1", "hk3_pct", "risk_level"])),
      }))
      return { title: `📊 Squad Progress ${r.label}`, text: `${note}\n\n${digest(keep(j, ["quarter", "year", "elapsed_days", "quarter_days", "pr_factor", "totals"]), "Squad Progress — tổng", { maxRows: 60 })}\n\n${squads.map((s: Record<string, unknown>) => digest(s, `Squad ${String(s.name)}`, { maxRows: 60 })).join("\n\n")}` }
    }
    case "market": {
      const data = (await call(origin, `/api/analytics/market?quarter=${r.label}&group=ALL`)) as MarketData
      const dims: [Dimension, string, number][] = [["country", "Theo thị trường (top 30 theo doanh thu)", 30], ["vendor", "Theo vendor", 40], ["plan", "Theo kiểu gói", 10], ["form", "Theo loại sản phẩm", 12], ["service", "Theo dịch vụ", 6]]
      const blocks = dims.map(([d, t, n]) => marketTable(t, groupBy(data, d).sort((a, b) => b.rev - a.rev).slice(0, n)))
      const partial = r.end < ymd(new Date(Date.UTC(r.year, r.q * 3, 0)))
      const warn = partial ? `\n⚠️ ${r.label} CHƯA HẾT (mới đến ${r.end}) còn quý trước là cả quý → cột %QoQ chỉ phản ánh độ dài kỳ, KHÔNG phải tăng/giảm thật; hãy so cơ cấu (%GM, tỷ trọng) thay vì so tuyệt đối.` : ""
      return { title: `📊 Thị trường ${r.label}`, text: `${note}\nQuý trước để so: ${data.prevQuarter}. Tổng công ty = B2B + B2C, bỏ phí ship.${warn}\n\n${blocks.join("\n\n")}` }
    }
    case "period-overview": {
      const range = `startDate=${r.start}&endDate=${r.end}`
      const [bod, kpi, tgt] = await Promise.all([
        call(origin, `/api/analytics/bod-summary?${range}`),
        call(origin, `/api/analytics/monthly-kpis?${range}&companyCode=ALL`),
        call(origin, `/api/analytics/targets-summary?${range}`),
      ])
      return { title: `📊 Tổng quan kỳ ${r.start} → ${r.end}`, text: `${note}\n\n${digest(bod, "BOD Summary")}\n\n${digest(kpi, "KPI theo tháng")}\n\n${digest(tgt, "Target")}` }
    }
    case "channels": {
      const perf = await call(origin, `/api/analytics/channels/performance?startDate=${r.start}&endDate=${r.end}`)
      return { title: `📊 Kênh bán ${r.start} → ${r.end}`, text: `${note}\n\n${digest({ kenh: perf }, "Channel Performance", { maxRows: 100 })}` }
    }
    default:
      throw new Error(`Gói dữ liệu không có: ${id}`)
  }
}

/** Wiki nghiệp vụ: các trang không ẩn của kb_wiki_pages (trang kỹ thuật theo tab `is_hidden` bỏ — quá dài, không phải tri thức nghiệp vụ). */
async function buildWikiPack(): Promise<{ title: string; text: string }> {
  const { supabaseAdmin } = await import("@/lib/supabase")   // nạp muộn: các test thuần của gói dữ liệu không cần env Supabase
  const { data, error } = await supabaseAdmin.from("kb_wiki_pages").select("title,content,page_type,department,updated_at").eq("is_hidden", false).order("page_type").order("title")
  if (error) throw new Error(`Đọc Wiki lỗi: ${error.message}`)
  const pages = (data ?? []) as { title: string; content: string; page_type: string; department: string; updated_at: string }[]
  if (!pages.length) throw new Error("Wiki không có trang nghiệp vụ nào")
  const note = `Lấy lúc ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${pages.length} trang Wiki nghiệp vụ hiện hành.`
  const body = pages.map(p => `## ${p.title}\n(loại: ${p.page_type} · bộ phận: ${p.department} · sửa lần cuối ${p.updated_at.slice(0, 10)})\n\n${p.content.trim()}`).join("\n\n---\n\n")
  return { title: "📚 Wiki nghiệp vụ GoHub", text: `${note}\n\n${body}` }
}
