// Đề xuất kế hoạch quý tự động (My Metrics › Kế hoạch quý, s227 — Hiếu: "hệ thống tự phân tích và đưa ra đề xuất, anh duyệt lại
// để thực hiện"). Chỉ phần việc của Product: giá vốn, vendor/nguồn hàng, mở thị trường chưa có — không đề xuất việc bán hàng.
// Logic thuần (không I/O): đầu vào là doanh thu theo SKU (MarketData) và bảng so giá vendor (QuoteCompareData) đã có ở tab Thị trường.
import { OTHER_MARKET, type MarketData } from "@/lib/market-breakdown"
import type { QuoteCompareData } from "@/lib/quote-sources"
import type { PlanKind } from "@/lib/okr-plan"

export type ProposalGroup = "Giá vốn" | "Vendor & nguồn hàng" | "Mở rộng thị trường"

export interface Proposal {
  key: string                     // ổn định giữa các lần tính → duyệt/bỏ qua rồi không hiện lại
  group: ProposalGroup
  title: string
  reason: string                  // số liệu làm căn cứ
  action: string                  // nên làm gì
  priority: number                // lớn = quan trọng hơn (doanh thu liên quan, VND)
  offPriority?: boolean           // đi ngược thứ tự ưu tiên vendor (3HK → BC Datapool) — Hiếu muốn vẫn thấy để tự cân nhắc
  track?: { kind: PlanKind; scope: { country?: string; vendor?: string }; target: number; label: string }
}

const DATAPOOL_SOURCES = new Set(["3HK", "BC_CMHK", "BC_SINGTEL"])

// Thứ tự ưu tiên vendor (wiki business/chon-vendor.md, chốt 2026-09-27): 3HK → BC Datapool → (SĐT local) → vendor khác; KHÔNG dùng giá
// để vượt thứ tự. Nhật Bản cũng theo thứ tự chung (Hiếu chốt 2026-10-07): KDDI chỉ có gói Unlimited, là "vendor khác" — giữ lại vì
// KDDI trả phí quảng cáo/phí khác. Ngoại lệ tạm: Đài Loan/Hong Kong đang dùng WM (3HK cần KYC). Số nhỏ = ưu tiên cao.
const vendorTier = (v: string) => { const n = v.replace(/\s+/g, "").toUpperCase(); return n === "3HKDATAPOOL" ? 1 : n.startsWith("BCDATAPOOL") ? 2 : 4 }
const sourceTier = (s: string) => s === "3HK" ? 1 : s.startsWith("BC_") ? 2 : 4
const isKddi = (v: string) => v.replace(/\s+/g, "").toUpperCase() === "KDDI"
const WM_EXCEPTION_MARKETS = new Set(["Đài Loan", "Hong Kong", "Hồng Kông"])
export function switchAllowed(market: string, currentVendor: string, source: string): boolean {
  const cur = vendorTier(currentVendor)
  if (source === "WM" && WM_EXCEPTION_MARKETS.has(market)) return true
  return sourceTier(source) <= cur
}
// Hiếu (s227b): vẫn hiện 3HK → BC Datapool (cùng là Datapool, rẻ hơn) nhưng gắn nhãn ngoài thứ tự; 3HK → vendor khác thì không.
const offPriorityAllowed = (_market: string, currentVendor: string, source: string) =>
  vendorTier(currentVendor) === 1 && sourceTier(source) === 2
const tr = (vnd: number) => vnd >= 1e9 ? `${(vnd / 1e9).toFixed(1)} tỷ` : `${Math.round(vnd / 1e6)}tr`
const pct = (x: number) => `${x.toFixed(1)}%`
const short = (label: string) => label.replace(" (đang chào)", "")

interface MarketAgg { rev: number; gp: number }

function byMarket(data: MarketData, months: string[]): Map<string, MarketAgg> {
  const set = new Set(months)
  const m = new Map<string, MarketAgg>()
  for (const [si, mi, rev, gp] of data.cells) {
    if (!set.has(data.months[mi])) continue
    const c = data.skus[si].country
    if (c === OTHER_MARKET) continue
    const a = m.get(c) ?? { rev: 0, gp: 0 }
    a.rev += rev; a.gp += gp
    m.set(c, a)
  }
  return m
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1

export interface ProposalInput {
  analysis: MarketData            // quý đủ dữ liệu gần nhất (quý phân tích) — kèm quý trước nó để xem xu hướng
  compare: QuoteCompareData | null
  current: MarketData | null      // quý đang chạy (để thấy thị trường đang tăng nhanh); null nếu trùng quý phân tích
  topMarkets?: number
}

export function buildProposals({ analysis, compare, current, topMarkets = 15 }: ProposalInput): Proposal[] {
  const out: Proposal[] = []
  const prevMonths = analysis.months.filter(m => !analysis.curMonths.includes(m))
  const cur = byMarket(analysis, analysis.curMonths)
  const prev = byMarket(analysis, prevMonths)
  const totalRev = [...cur.values()].reduce((s, a) => s + a.rev, 0)
  const totalGp = [...cur.values()].reduce((s, a) => s + a.gp, 0)
  const companyGm = totalRev > 0 ? totalGp / totalRev * 100 : 0
  const top = [...cur.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, topMarkets)
  const q = analysis.quarter.replace("-", "/")

  // 1. Giá vốn: gói đang bán có nơi nhập rẻ hơn — gộp theo thị trường × (vendor đang dùng → nơi rẻ hơn), xếp theo doanh thu các gói đó.
  if (compare) {
    const groups = new Map<string, { market: string; from: string; to: string; toSource: string; off: boolean; n: number; sumPct: number; maxPct: number; rev: number }>()
    for (const r of compare.rows) {
      // Nơi rẻ hơn rẻ nhất mà KHÔNG đi ngược thứ tự ưu tiên vendor (best của bảng so giá có thể là WM rẻ nhất nhưng thấp ưu tiên hơn).
      if (r.baseUsd === null) continue
      const cheaper = r.offers.filter(o => o.usd < r.baseUsd!).sort((x, y) => x.usd - y.usd)
      const inOrder = cheaper.find(o => switchAllowed(r.market, r.vendor, o.source))
      const best = inOrder ?? cheaper.find(o => offPriorityAllowed(r.market, r.vendor, o.source))
      if (!best) continue
      const off = !inOrder
      const savePct = (r.baseUsd - best.usd) / r.baseUsd * 100
      const k = `${r.market}|${r.vendor}|${best.source}`
      const g = groups.get(k) ?? { market: r.market, from: r.vendor, to: short(best.label), toSource: best.source, off, n: 0, sumPct: 0, maxPct: 0, rev: 0 }
      g.n++; g.sumPct += savePct; g.maxPct = Math.max(g.maxPct, savePct); g.rev += r.rev
      groups.set(k, g)
    }
    ;[...groups.values()].filter(g => g.n >= 2 || g.rev >= 20e6).sort((a, b) => b.rev - a.rev).slice(0, 8).forEach(g => {
      const datapool = DATAPOOL_SOURCES.has(g.toSource)
      out.push({
        key: `switch|${g.market}|${g.from}|${g.toSource}`, group: "Giá vốn",
        title: `${g.market}: chuyển ${g.n} gói từ ${g.from} sang ${g.to}`,
        reason: `Giá vốn mỗi gói rẻ hơn trung bình ${pct(g.sumPct / g.n)} (nhiều nhất ${pct(g.maxPct)}); các gói này bán ${tr(g.rev)} trong quý ${q}.`,
        action: g.off
          ? `Ngoài thứ tự ưu tiên vendor (3HK đứng trước BC Datapool) — chỉ chuyển nếu chênh giá đáng kể và ${g.to} đạt chất lượng mạng/KYC/MOQ; vẫn tính vào %Datapool.`
          : `Kiểm chất lượng mạng, yêu cầu định danh (KYC), số lượng tối thiểu (MOQ) của ${g.to}; đạt thì làm SKU mới và chuyển dần.${datapool ? " Đồng thời tăng tỷ trọng Datapool." : ""}${isKddi(g.from) ? " Lưu ý KDDI đang trả phí quảng cáo/phí khác cho GoHub — tính khoản này trước khi chuyển." : ""}`,
        priority: g.off ? g.rev * 0.7 : g.rev,
        offPriority: g.off || undefined,
      })
    })

    // Báo giá vendor gửi về đang chờ quyết: rẻ hơn ở bao nhiêu gói đang bán.
    for (const s of compare.sources.filter(x => x.quoteId && x.status === "reviewing")) {
      const wins = compare.rows.filter(r => { const o = r.offers.find(x => x.source === s.id); return o && r.baseUsd !== null && o.usd < r.baseUsd && switchAllowed(r.market, r.vendor, s.id) })
      if (!wins.length) continue
      const rev = wins.reduce((a, r) => a + r.rev, 0)
      const avg = wins.reduce((a, r) => { const o = r.offers.find(x => x.source === s.id)!; return a + (r.baseUsd! - o.usd) / r.baseUsd! * 100 }, 0) / wins.length
      out.push({
        key: `quote|${s.quoteId}`, group: "Vendor & nguồn hàng",
        title: `Chốt báo giá ${short(s.label)}: rẻ hơn ở ${wins.length} gói đang bán`,
        reason: `Rẻ hơn trung bình ${pct(avg)} ở các gói đang nhập từ vendor ưu tiên thấp hơn hoặc ngang; các gói đó bán ${tr(rev)} trong quý ${q}. Báo giá đang ở trạng thái "đang xem".`,
        action: "Đàm phán và thử mạng, rồi chuyển báo giá sang Chấp nhận / Từ chối ở tab Thị trường & Báo giá.",
        priority: rev,
      })
    }
  }

  // 2. Thị trường lớn có biên lãi thấp hoặc đang tụt.
  for (const [market, a] of top) {
    const gm = a.rev > 0 ? a.gp / a.rev * 100 : 0
    const p = prev.get(market)
    const gmPrev = p && p.rev > 0 ? p.gp / p.rev * 100 : null
    if (gmPrev !== null && gmPrev - gm >= 3) {
      out.push({
        key: `gmdrop|${market}`, group: "Giá vốn",
        title: `${market}: biên lãi giảm từ ${pct(gmPrev)} xuống ${pct(gm)}`,
        reason: `Doanh thu quý ${q} ${tr(a.rev)} (top ${topMarkets} thị trường); GM% giảm ${(gmPrev - gm).toFixed(1)} điểm % so với quý trước.`,
        action: "Tìm gói/vendor kéo biên lãi xuống (giá vốn tăng hay chuyển sang gói lãi thấp), đàm phán lại hoặc đổi nguồn.",
        priority: a.rev,
        track: { kind: "market_gm", scope: { country: market }, target: +gmPrev.toFixed(1), label: `GM% ${market} về lại ${pct(gmPrev)}` },
      })
    } else if (companyGm - gm >= 5) {
      const target = +Math.min(companyGm, gm + 3).toFixed(1)
      out.push({
        key: `lowgm|${market}`, group: "Giá vốn",
        title: `${market}: biên lãi ${pct(gm)}, thấp hơn trung bình công ty ${pct(companyGm)}`,
        reason: `Doanh thu quý ${q} ${tr(a.rev)} (top ${topMarkets} thị trường).`,
        action: "Rà giá vốn các gói bán nhiều của thị trường này, tìm vendor rẻ hơn hoặc gói Datapool thay thế.",
        priority: a.rev * 0.8,
        track: { kind: "market_gm", scope: { country: market }, target, label: `GM% ${market} lên ${pct(target)}` },
      })
    }
  }

  // 3. Phụ thuộc 1 vendor quá lớn.
  const vendorRev = new Map<string, number>()
  const curSet = new Set(analysis.curMonths)
  for (const [si, mi, rev] of analysis.cells) if (curSet.has(analysis.months[mi])) vendorRev.set(analysis.skus[si].vendor, (vendorRev.get(analysis.skus[si].vendor) ?? 0) + rev)
  for (const [vendor, rev] of vendorRev) {
    const share = totalRev > 0 ? rev / totalRev * 100 : 0
    if (share < 60 || vendorTier(vendor) <= 2) continue       // 3HK/BC Datapool là ưu tiên số 1–2 + KPI %Datapool → không đề xuất giảm
    const target = +Math.floor(share - 3).toFixed(0)
    out.push({
      key: `depend|${vendor}`, group: "Vendor & nguồn hàng",
      title: `Giảm phụ thuộc ${vendor} (đang ${pct(share)} doanh thu)`,
      reason: `Quý ${q}: ${tr(rev)} / ${tr(totalRev)} doanh thu đi qua ${vendor} — vendor gặp sự cố hoặc tăng giá là ảnh hưởng gần hết doanh thu.`,
      action: "Chuẩn bị nguồn dự phòng cho các thị trường lớn nhất của vendor này (ưu tiên BC Datapool), thử mạng sẵn.",
      priority: rev * 0.3,
      track: { kind: "vendor_dependency", scope: { vendor }, target, label: `Tỷ trọng ${vendor} ≤ ${target}%` },
    })
  }

  // 4. Thị trường đang tăng nhanh ở quý đang chạy → đàm phán giá theo sản lượng.
  if (current && current.quarter !== analysis.quarter) {
    const days = daysBetween(current.curStart, current.cutoff)
    if (days >= 14) {
      const now = byMarket(current, current.curMonths)
      const baseDays = daysBetween(analysis.curStart, analysis.curEnd)
      for (const [market, a] of top) {
        const n = now.get(market)
        if (!n || a.rev < 50e6) continue
        const growth = (n.rev / days) / (a.rev / baseDays) * 100 - 100
        if (growth < 30) continue
        out.push({
          key: `growth|${market}`, group: "Vendor & nguồn hàng",
          title: `${market}: doanh thu/ngày đang tăng ${pct(growth)} — đàm phán giá theo sản lượng`,
          reason: `${days} ngày đầu quý ${current.quarter.replace("-", "/")} bán ${tr(n.rev)}, nhịp mỗi ngày cao hơn quý ${q}.`,
          action: "Dùng sản lượng tăng để xin giá tốt hơn từ vendor hiện tại hoặc chào vendor khác; kiểm tồn/khung SIM đủ.",
          priority: n.rev,
        })
      }
    }
  }

  // 5. Nước đã có nơi báo giá mà GoHub chưa bán gói riêng — ưu tiên nước chưa bán dưới mọi hình thức.
  if (compare) {
    compare.gaps.slice(0, 8).forEach((g, i) => {
      const best = g.ref.find(r => r.best)?.best
      const ref = g.ref.find(r => r.best)
      out.push({
        key: `gap|${g.iso}`, group: "Mở rộng thị trường",
        title: `Mở gói riêng cho ${g.name}`,
        reason: `${g.regional.length ? `Hiện chỉ bán trong gói nhóm (${g.regional.slice(0, 2).join(", ")}${g.regional.length > 2 ? "…" : ""})` : "Chưa bán dưới hình thức nào"}; đã có báo giá từ ${g.sources.map(short).join(", ")}${best && ref ? ` — ${ref.spec.toLowerCase()} rẻ nhất ${best.usd.toFixed(2)} USD (${short(best.label)})` : ""}.`,
        action: "Kiểm nhu cầu (đơn hỏi, đối thủ đang bán), chọn vendor, tạo sản phẩm + SKU ở tab Tạo sản phẩm.",
        priority: 5e6 - i,           // xếp sau các việc có doanh thu đi kèm
      })
    })
  }

  return out.sort((a, b) => b.priority - a.priority)
}

/** Quý dùng để phân tích: kế hoạch cho quý đang chạy hoặc quý tới → quý đủ 3 tháng gần nhất; quý đã qua → chính quý đó. */
export function analysisQuarterFor(planQuarter: string, currentQuarter: string, prevOf: (q: string) => string): string {
  const rank = (l: string) => { const [qq, y] = l.split("-"); return Number(y) * 10 + Number(qq.slice(1)) }
  return rank(planQuarter) >= rank(currentQuarter) ? prevOf(currentQuarter) : planQuarter
}
