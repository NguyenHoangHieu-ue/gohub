// Breakdown chi tiết KH Mới / Quay lại / Rời bỏ của Quarter Report (s203) — hàm thuần, không I/O (có unit test).
// Định nghĩa GIỮ NGUYÊN như ô tổng quan cũ (`classifyB2BLifecycle`): xem b2b-lifecycle.ts.
//   B2B  — dữ liệu từng khách trong gohub_dw (mã KH, tier, PIC).
//   B2C  — bảng doanh thu chỉ có vài mã KH chung (VN/US B2C Customer) nên danh sách từng khách lấy từ Admin GoHub API
//          (`userType` new/returning theo API; "rời bỏ" = có mua quý trước nhưng quý này không xuất hiện).

import { classifyB2BLifecycle, type B2BLifecycleRow } from "@/lib/analytics-engine/b2b-lifecycle"
import type { AdminCustomerDetail } from "@/lib/admin-gohub"

export type LifecycleStateKey = "new" | "recurring" | "inactive"

/** 1 dòng hiển thị trong bảng breakdown (dùng chung B2B/B2C). */
export interface LifecycleRow {
  id: string                    // mã KH (B2B) / customerId (B2C)
  name: string
  tag: string                   // B2B: tier (Strategic/VIP/...); B2C: thị trường (VN/US)
  owner: string                 // B2B: PIC phụ trách; B2C: email đã che
  revenue: number               // doanh thu quý này
  prevRevenue: number           // doanh thu quý trước
  firstOrderAt: string | null   // ngày mua đầu tiên
  lastOrderAt: string | null    // ngày mua gần nhất (chỉ B2C có)
}

export interface LifecycleStateDetail {
  count: number                 // tổng số KH đúng định nghĩa (KHÔNG bị cắt bởi limit)
  revenue: number               // new/recurring: doanh thu quý này; inactive: doanh thu quý trước đã mất
  recentCount?: number          // inactive: số KH có doanh thu quý liền trước (danh sách chỉ liệt kê nhóm này với B2B)
  rows: LifecycleRow[]          // đã sắp theo doanh thu giảm dần, cắt còn `limit`
  truncated: boolean
}

export interface LifecycleDetail {
  new: LifecycleStateDetail
  recurring: LifecycleStateDetail
  inactive: LifecycleStateDetail
}

export const LIFECYCLE_ROW_LIMIT = 500

// ── B2B ───────────────────────────────────────────────────────────────────────

export interface B2BCandidate { code: string; revenue: number; prevRevenue: number; firstOrderAt: string; pic: string | null }

/**
 * Bước 1 (chưa cần tên/tier): phân loại + chọn ĐÚNG các mã cần hiển thị. Caller tra tên/tier/PIC cho các mã đó rồi gọi `attachB2BProfiles`.
 * Rời bỏ B2B: đếm TẤT CẢ (~112.000 KH từng mua) nhưng chỉ LIỆT KÊ nhóm có doanh thu quý liền trước (đây mới là KH cần theo dõi).
 */
export function selectB2BLifecycle(args: {
  lifecycleRows: B2BLifecycleRow[]
  revThisQ: Map<string, number>
  revPrevQ: Map<string, number>
  qStart: string
  qEnd: string
  limit?: number
}) {
  const limit = args.limit ?? LIFECYCLE_ROW_LIMIT
  const active = new Set([...args.revThisQ.entries()].filter(([, v]) => v !== 0).map(([c]) => c))
  const stateOf = classifyB2BLifecycle(args.lifecycleRows, active, args.qStart, args.qEnd)
  const rowByCode = new Map(args.lifecycleRows.map(r => [r.customer_code, r]))

  const buckets: Record<LifecycleStateKey, B2BCandidate[]> = { new: [], recurring: [], inactive: [] }
  const totals = { new: { count: 0, revenue: 0 }, recurring: { count: 0, revenue: 0 }, inactive: { count: 0, revenue: 0, recent: 0 } }

  stateOf.forEach((state, code) => {
    const lr = rowByCode.get(code)
    const revenue = args.revThisQ.get(code) || 0
    const prevRevenue = args.revPrevQ.get(code) || 0
    if (state === "inactive") {
      totals.inactive.count++
      totals.inactive.revenue += prevRevenue
      if (prevRevenue > 0) {
        totals.inactive.recent++
        buckets.inactive.push({ code, revenue: 0, prevRevenue, firstOrderAt: lr?.first_order_date ?? "", pic: lr?.sales_pic_code ?? null })
      }
    } else {
      totals[state].count++
      totals[state].revenue += revenue
      buckets[state].push({ code, revenue, prevRevenue, firstOrderAt: lr?.first_order_date ?? "", pic: lr?.sales_pic_code ?? null })
    }
  })

  const sortKey = (state: LifecycleStateKey) => (c: B2BCandidate) => state === "inactive" ? c.prevRevenue : c.revenue
  ;(Object.keys(buckets) as LifecycleStateKey[]).forEach(state => {
    const key = sortKey(state)
    buckets[state].sort((a, b) => key(b) - key(a))
  })

  return {
    totals,
    selected: {
      new: buckets.new.slice(0, limit),
      recurring: buckets.recurring.slice(0, limit),
      inactive: buckets.inactive.slice(0, limit),
    },
    listed: { new: buckets.new.length, recurring: buckets.recurring.length, inactive: buckets.inactive.length },
  }
}

export interface B2BProfile { name: string; tier: string; picName: string }

export function attachB2BProfiles(
  sel: ReturnType<typeof selectB2BLifecycle>,
  profileOf: (code: string) => B2BProfile | undefined,
  limit = LIFECYCLE_ROW_LIMIT,
): LifecycleDetail {
  const toRow = (c: B2BCandidate): LifecycleRow => {
    const p = profileOf(c.code)
    return {
      id: c.code, name: p?.name || c.code, tag: p?.tier || "", owner: p?.picName || c.pic || "",
      revenue: Math.round(c.revenue), prevRevenue: Math.round(c.prevRevenue), firstOrderAt: c.firstOrderAt || null, lastOrderAt: null,
    }
  }
  const build = (state: LifecycleStateKey): LifecycleStateDetail => {
    const t = sel.totals[state]
    const rows = sel.selected[state].map(toRow)
    return {
      count: t.count, revenue: Math.round(t.revenue),
      ...(state === "inactive" ? { recentCount: sel.totals.inactive.recent } : {}),
      rows, truncated: sel.listed[state] > Math.min(limit, rows.length),
    }
  }
  return { new: build("new"), recurring: build("recurring"), inactive: build("inactive") }
}

// ── B2C ───────────────────────────────────────────────────────────────────────

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

export function buildB2CLifecycleDetail(cur: AdminCustomerDetail[], prev: AdminCustomerDetail[], limit = LIFECYCLE_ROW_LIMIT): LifecycleDetail {
  const curIds = new Set(cur.map(c => c.id))
  const prevRevById = new Map(prev.map(c => [c.id, c.revenueVnd]))

  const toRow = (c: AdminCustomerDetail, revenue: number, prevRevenue: number): LifecycleRow => ({
    id: c.id, name: c.name || "(chưa có tên)", tag: c.market, owner: c.emailMasked,
    revenue, prevRevenue, firstOrderAt: day(c.firstOrderAt), lastOrderAt: day(c.lastOrderAt),
  })
  const detail = (rowsAll: LifecycleRow[], revenueOf: (r: LifecycleRow) => number): LifecycleStateDetail => {
    const sorted = [...rowsAll].sort((a, b) => revenueOf(b) - revenueOf(a))
    return { count: sorted.length, revenue: sorted.reduce((s, r) => s + revenueOf(r), 0), rows: sorted.slice(0, limit), truncated: sorted.length > limit }
  }

  const news = cur.filter(c => c.userType === "new").map(c => toRow(c, c.revenueVnd, prevRevById.get(c.id) || 0))
  const recurring = cur.filter(c => c.userType !== "new").map(c => toRow(c, c.revenueVnd, prevRevById.get(c.id) || 0))
  const inactive = prev.filter(c => !curIds.has(c.id)).map(c => toRow(c, 0, c.revenueVnd))

  const out: LifecycleDetail = {
    new: detail(news, r => r.revenue),
    recurring: detail(recurring, r => r.revenue),
    inactive: detail(inactive, r => r.prevRevenue),
  }
  out.inactive.recentCount = out.inactive.count   // B2C: mọi KH rời bỏ đều là KH có mua quý trước
  return out
}
