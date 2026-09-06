"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Activity, Search, Filter, Download, RefreshCw, Calendar, Package,
  ChevronUp, ChevronDown, Database, BarChart3,
} from "lucide-react"
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { exportRawRows, exportAOA } from "@/lib/export-excel"
import { CHART_GRID_COLOR } from "@/components/dashboard-kit"

// Port "y hệt" gohub-intel ThreeHKDataUsage. Data qua /api/analytics/query (SELECT-only).
// Bỏ motion/react (không dùng), inline getDefaultDateRange/formatDate.

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
  if (today.getDate() <= 7) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0)
    return { startDate: fmt(start), endDate: fmt(end) }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}
const formatDate = (d?: string) => {
  if (!d) return "-"
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("vi-VN")
}

// Số ngày của gói từ mã SKU — xử lý CẢ cũ + mới:
//   MỚI: ...UNL<days> kết thúc bằng số, không có 'D' (vd 3ACHN3DBUNL05 → 05).
//   CŨ:  ...<days>D (bỏ token P1/P2 trước, vd AS43DUNLIP103D → 03; ECHN3DP1UNLI05D → 05).
const daysOfSku = (sku: string): number | null => {
  const mNew = sku.match(/UNL(\d+)$/i)
  if (mNew) return parseInt(mNew[1])
  const mOld = sku.replace(/P[12]/i, "").match(/(\d+)D$/i)
  return mOld ? parseInt(mOld[1]) : null
}


// Rút gọn tên nhóm tốc độ cho nhãn biểu đồ: "500MB high-speed · throttle 5 mbps" → "500MB·5mbps".
const groupShort = (g: string) => g.replace(" high-speed · throttle ", "·").replace(" mbps", "mbps")

interface DataUsageRecord {
  order_code: string
  iccid: string
  sku: string
  sku_type: string
  data_amount_gb: number
  total_data_gb: number
  usage_pct: number
  first_report_date: string
  activation_date: string
  record_count: number
}

interface SKUMetrics {
  sku: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
}

interface SKUTypeMetrics {
  sku_type: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
}

// Nhóm gói Unlimited 3HK = (high-speed × throttle). Hiện chỉ có 3 loại:
//   500MB·5mbps · 500MB·10mbps · 1GB·10mbps.
interface SpeedGroupMetrics {
  speed_group: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
  sim_days: number       // Σ(active_sims × số ngày gói) — mẫu số cho GB/ngày/SIM
  actual_per_day: number // GB thực dùng/ngày/SIM (trọng số) = total_usage_gb ÷ sim_days
  plan_per_day: number   // GB kế hoạch/ngày/SIM (trọng số) = total_plan_gb ÷ sim_days (từ data_amount_gb)
}

// Một dòng trong bảng "Data Usage by Country × Month (TB)".
interface CountryUsageRow {
  country: string
  monthly: Record<string, number>  // ym ("YYYY-MM") -> TB
  total: number                    // tổng TB toàn kỳ hiển thị
  runRate: number                  // TB tháng mới nhất × 12
}

// Nhãn tháng tiếng Anh viết hoa cho cột (khớp mẫu NCC): "2026-06" -> "JUN". Nếu bảng trải nhiều năm thì thêm "'YY".
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const monthLabel = (ym: string, multiYear: boolean) => {
  const [y, m] = ym.split("-")
  const idx = parseInt(m, 10) - 1
  const name = MONTH_ABBR[idx] ?? ym
  return multiYear ? `${name} '${y.slice(2)}` : name
}
// TB 2 chữ số thập phân theo vi-VN (dấu phẩy) — khớp mẫu "16,92".
const fmtTB = (n: number) => (n || 0).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Nhóm tốc độ (high-speed × throttle) được tính SERVER-side ở /api/analytics/3hk-speed-map:
// gộp throttle_speed product DB (chính) + offer_name + giá (cogs) + ký tự SKU (P1=10/P2=5).
// Trang chỉ tra map[sku].group. (Trước đây suy client-side từ mã SKU; mã CŨ bị đảo 5/10mbps.)

export default function ThreeHKDataUsagePage() {
  const [data, setData] = useState<DataUsageRecord[]>([])
  const [skuMetrics, setSkuMetrics] = useState<SKUMetrics[]>([])
  const [skuTypeMetrics, setSkuTypeMetrics] = useState<SKUTypeMetrics[]>([])
  // Map sku -> nhóm tốc độ (server tính sẵn: throttle_speed + offer + giá). Tách 500MB vs 1GB × 5/10mbps.
  const [speedMap, setSpeedMap] = useState<Record<string, { group: string | null; source?: string }>>({})
  const [loading, setLoading] = useState(false)
  const [loadingSKU, setLoadingSKU] = useState(false)
  const [loadingType, setLoadingType] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [skuPage, setSkuPage] = useState(1)
  const skuPageSize = 10
  const [hasMore, setHasMore] = useState(true)
  const pageSize = 50

  const [activeTab, setActiveTab] = useState<"all" | "Daily" | "Fixed" | "Unlimited">("all")

  // Để rỗng ban đầu → mount effect đặt kỳ = đầu-tháng(max-data) .. max-data (3HK có thể chậm sync vài tháng).
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  // Ngày chỉ áp khi bấm "Lọc" (không tự lọc mỗi lần đổi ngày). appliedTick bump → chạy lại query.
  const [appliedTick, setAppliedTick] = useState(0)
  const [sortConfig, setSortConfig] = useState<{ key: keyof DataUsageRecord; direction: "asc" | "desc" }>({ key: "first_report_date", direction: "desc" })

  const [skuSort, setSkuSort] = useState<{ key: keyof SKUMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })
  const [skuTypeSort, setSkuTypeSort] = useState<{ key: keyof SKUTypeMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })

  const [totals, setTotals] = useState({ totalUsage: 0, totalCapacity: 0, avgUsage: 0, count: 0 })

  // Sub-report: Data Usage by Country × Month (TB). Nguồn data_usage_log (log thô có cột country),
  // đơn vị TB = data_gb / 1024. Độc lập với kỳ/tab của bảng chính — luôn hiển thị trend theo tháng
  // (tối đa 12 tháng gần nhất). RUN-RATE 12M = tổng tháng mới nhất × 12 (ước năm hoá).
  const [countryMonths, setCountryMonths] = useState<string[]>([])
  const [countryRows, setCountryRows] = useState<CountryUsageRow[]>([])
  const [countryGrand, setCountryGrand] = useState<{ monthly: Record<string, number>; total: number; runRate: number }>({ monthly: {}, total: 0, runRate: 0 })
  const [loadingCountry, setLoadingCountry] = useState(false)
  const [countryError, setCountryError] = useState<string | null>(null)

  const runQuery = async (sql: string) => {
    const res = await fetch("/api/analytics/query", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Server error: ${res.status}`)
    }
    return res.json()
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Default thông minh: lấy ngày data mới nhất của 3HK → đặt kỳ = đầu tháng(max) .. max.
  // Tránh trông "rỗng" khi data 3HK chậm sync (vd mới đến hết tháng trước). Fallback = tháng hiện tại.
  useEffect(() => {
    (async () => {
      try {
        const rows = await runQuery(`
          SELECT MAX(first_report_date)::date AS max_d
          FROM fact_data_usage
          WHERE sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','') = '3HKDATAPOOL')
        `)
        const maxD = rows?.[0]?.max_d ? new Date(rows[0].max_d) : null
        if (maxD && !isNaN(maxD.getTime())) {
          // Dùng UTC: first_report_date lưu ở 00:00:00 UTC. Nếu format theo giờ LOCAL, trình duyệt lệch
          // UTC (vd US) sẽ lùi 1 ngày → mất SIM của ngày cuối kỳ (lệch báo cáo NCC). getUTC* ổn định mọi tz.
          const p = (n: number) => String(n).padStart(2, "0")
          const endStr   = `${maxD.getUTCFullYear()}-${p(maxD.getUTCMonth()+1)}-${p(maxD.getUTCDate())}`
          const startStr = `${maxD.getUTCFullYear()}-${p(maxD.getUTCMonth()+1)}-01`
          setStartDate(startStr); setEndDate(endStr); setAppliedTick(t => t + 1); return
        }
      } catch (e) { console.error("Error fetching 3hk max date:", e) }
      const d = getDefaultDateRange(); setStartDate(d.startDate); setEndDate(d.endDate); setAppliedTick(t => t + 1)
    })()
  }, [])

  // Map sku -> nhóm tốc độ (1 lần): server gộp throttle_speed product DB + offer_name + giá để tách
  // 500MB/1GB × 5/10mbps. Không phụ thuộc khoảng ngày.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics/3hk-speed-map")
        if (!res.ok) return
        const json = await res.json()
        setSpeedMap(json.map || {})
      } catch (e) { console.error("Error fetching 3hk speed map:", e) }
    })()
  }, [])

  // Sub-report Country × Month: tải lại mỗi khi bấm "Lọc" (appliedTick thay đổi).
  // Hiển thị TẤT CẢ nước (không gộp OTHERS). Dùng startDate/endDate của page.
  useEffect(() => {
    if (!startDate || !endDate) return
    ;(async () => {
      setLoadingCountry(true); setCountryError(null)
      try {
        const sql = `
          SELECT COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
                 to_char(report_date::date, 'YYYY-MM')          AS ym,
                 ROUND((SUM(data_gb) / 1024.0)::numeric, 4)    AS tb
          FROM data_usage_log
          WHERE report_date IS NOT NULL
            AND report_date::date BETWEEN '${startDate}'::date AND '${endDate}'::date
          GROUP BY 1, 2
          ORDER BY 1, 2
        `
        const rows: Array<{ country: string; ym: string; tb: string }> = await runQuery(sql)

        const monthSet = new Set<string>()
        const byCountry: Record<string, Record<string, number>> = {}
        for (const r of rows) {
          const ym = r.ym; const tb = parseFloat(r.tb || "0")
          monthSet.add(ym)
          ;(byCountry[r.country] ??= {})[ym] = (byCountry[r.country][ym] ?? 0) + tb
        }
        const months = Array.from(monthSet).sort()
        const latest = months[months.length - 1]

        // Dựng dòng theo country, sắp theo tổng giảm dần. KHÔNG gộp OTHERS — hiện tất cả nước.
        const all: CountryUsageRow[] = Object.entries(byCountry).map(([country, monthly]) => {
          const total = months.reduce((s, m) => s + (monthly[m] ?? 0), 0)
          return { country, monthly, total, runRate: (monthly[latest] ?? 0) * 12 }
        }).sort((a, b) => b.total - a.total)

        // GRAND TOTAL
        const grandMonthly: Record<string, number> = {}
        for (const m of months) grandMonthly[m] = all.reduce((s, r) => s + (r.monthly[m] ?? 0), 0)
        const grandTotal = all.reduce((s, r) => s + r.total, 0)

        setCountryMonths(months)
        setCountryRows(all)
        setCountryGrand({ monthly: grandMonthly, total: grandTotal, runRate: (grandMonthly[latest] ?? 0) * 12 })
      } catch (e: any) {
        console.error("Error fetching country usage:", e)
        setCountryError("Không tải được bảng Usage by Country.")
      } finally {
        setLoadingCountry(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTick, startDate, endDate])

  useEffect(() => {
    if (!startDate || !endDate) return  // chờ mount effect đặt kỳ mặc định thông minh
    const loadAllData = async () => {
      setLoading(true)
      setError(null)
      try {
        await Promise.all([fetchTotals(), fetchSKUTypeMetrics(), fetchSKUMetrics(), fetchRecords(1, true)])
        setSkuPage(1)
      } catch (err) {
        console.error("Error in batch data fetch:", err)
        setError("Network error: Could not reach the server or query timed out.")
      } finally {
        setLoading(false)
      }
    }
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTick, debouncedSearch, sortConfig, activeTab])

  const sortedSkuMetrics = useMemo(() => {
    const items = [...skuMetrics]
    items.sort((a, b) => {
      const aVal = a[skuSort.key]
      const bVal = b[skuSort.key]
      if (typeof aVal === "number" && typeof bVal === "number") {
        return skuSort.direction === "asc" ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (aStr < bStr) return skuSort.direction === "asc" ? -1 : 1
      if (aStr > bStr) return skuSort.direction === "asc" ? 1 : -1
      return 0
    })
    return items
  }, [skuMetrics, skuSort])

  const paginatedSkuMetrics = useMemo(() => {
    return sortedSkuMetrics.slice((skuPage - 1) * skuPageSize, skuPage * skuPageSize)
  }, [sortedSkuMetrics, skuPage, skuPageSize])

  const sortedSkuTypeMetrics = useMemo(() => {
    const items = [...skuTypeMetrics]
    items.sort((a, b) => {
      const aVal = a[skuTypeSort.key]
      const bVal = b[skuTypeSort.key]
      if (typeof aVal === "number" && typeof bVal === "number") {
        return skuTypeSort.direction === "asc" ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (aStr < bStr) return skuTypeSort.direction === "asc" ? -1 : 1
      if (aStr > bStr) return skuTypeSort.direction === "asc" ? 1 : -1
      return 0
    })
    return items
  }, [skuTypeMetrics, skuTypeSort])

  // Breakdown Unlimited theo (high-speed × throttle) — gom skuMetrics (đã lọc Unlimited) theo datatype SKU + offer.
  const speedGroups = useMemo<SpeedGroupMetrics[]>(() => {
    if (activeTab !== "Unlimited") return []
    const acc: Record<string, SpeedGroupMetrics> = {}
    for (const sm of skuMetrics) {
      const group = speedMap[sm.sku]?.group
      if (!group) continue   // bỏ SKU không xác định datatype
      const g = acc[group] ?? (acc[group] = { speed_group: group, active_sims: 0, total_plan_gb: 0, total_usage_gb: 0, avg_usage_pct: 0, sim_days: 0, actual_per_day: 0, plan_per_day: 0 })
      g.active_sims    += sm.active_sims
      g.total_plan_gb  += sm.total_plan_gb
      g.total_usage_gb += sm.total_usage_gb
      const dd = daysOfSku(sm.sku)
      if (dd && dd > 0) g.sim_days += sm.active_sims * dd
    }
    const list = Object.values(acc)
    for (const g of list) {
      g.avg_usage_pct  = g.total_plan_gb > 0 ? (g.total_usage_gb / g.total_plan_gb) * 100 : 0
      g.actual_per_day = g.sim_days > 0 ? g.total_usage_gb / g.sim_days : 0
      g.plan_per_day   = g.sim_days > 0 ? g.total_plan_gb  / g.sim_days : 0
    }
    return list.sort((a, b) => a.speed_group.localeCompare(b.speed_group))
  }, [activeTab, skuMetrics, speedMap])

  // Danh sách SKU thuộc từng nhóm tốc độ — cho nút "Chi tiết" bung ra (user tự kiểm phân loại).
  const speedGroupMembers = useMemo<Record<string, SKUMetrics[]>>(() => {
    if (activeTab !== "Unlimited") return {}
    const acc: Record<string, SKUMetrics[]> = {}
    for (const sm of skuMetrics) {
      const group = speedMap[sm.sku]?.group
      if (!group) continue
      ;(acc[group] ??= []).push(sm)
    }
    for (const g of Object.keys(acc)) acc[g].sort((a, b) => b.total_usage_gb - a.total_usage_gb)
    return acc
  }, [activeTab, skuMetrics, speedMap])

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Dữ liệu biểu đồ so sánh 3 loại gói: Thực tế (GB/ngày/SIM, trung bình có trọng số) vs Giả định.
  const speedChart = useMemo(() => {
    if (activeTab !== "Unlimited") return []
    return speedGroups.map(sg => {
      const members = speedGroupMembers[sg.speed_group] ?? []
      let usage = 0, plan = 0, simDays = 0
      for (const m of members) {
        const d = daysOfSku(m.sku)
        usage += m.total_usage_gb
        plan  += m.total_plan_gb
        if (d && d > 0) simDays += m.active_sims * d
      }
      const actual = simDays > 0 ? usage / simDays : 0
      // Kế hoạch/ngày = tổng data_amount_gb ÷ tổng (SIM×ngày) — mức 3HK cấp/ngày (từ DB), KHÔNG hardcode
      // theo throttle (spec cũ 1.6/1.8-theo-mbps BỊ NGƯỢC chiều A/B so với data_amount_gb thực tế).
      const assume = simDays > 0 ? plan / simDays : 0
      return { name: groupShort(sg.speed_group), actual: +actual.toFixed(3), assume: +assume.toFixed(3), usagePct: +sg.avg_usage_pct.toFixed(1) }
    })
  }, [activeTab, speedGroups, speedGroupMembers])

  // Biểu đồ phân bố mức data dùng/ngày/SIM (GB) — đếm số SIM theo dải tiêu dùng, chồng theo nhóm gói.
  const USAGE_BUCKETS = [
    { label: "0–0.5",  min: 0,   max: 0.5 },
    { label: "0.5–1",  min: 0.5, max: 1   },
    { label: "1–1.5",  min: 1,   max: 1.5 },
    { label: "1.5–2",  min: 1.5, max: 2   },
    { label: "2–2.5",  min: 2,   max: 2.5 },
    { label: "2.5–3",  min: 2.5, max: 3   },
    { label: "≥3",     min: 3,   max: Infinity },
  ]
  const usageDist = useMemo(() => {
    if (activeTab !== "Unlimited") return { rows: [] as Record<string, number | string>[], groups: [] as string[] }
    const groups = speedGroups.map(sg => groupShort(sg.speed_group))
    const rows: Record<string, number | string>[] = USAGE_BUCKETS.map(b => {
      const o: Record<string, number | string> = { range: b.label }
      for (const g of groups) o[g] = 0
      return o
    })
    for (const sg of speedGroups) {
      const gname = groupShort(sg.speed_group)
      for (const m of speedGroupMembers[sg.speed_group] ?? []) {
        const d = daysOfSku(m.sku)
        if (!d || d <= 0 || m.active_sims <= 0) continue
        const perDay = m.total_usage_gb / m.active_sims / d
        const bi = USAGE_BUCKETS.findIndex(b => perDay >= b.min && perDay < b.max)
        if (bi >= 0) rows[bi][gname] = (rows[bi][gname] as number) + m.active_sims
      }
    }
    return { rows, groups }
  }, [activeTab, speedGroups, speedGroupMembers])

  // GB/ngày/SIM per SKU (cho tab Unlimited — chỉ số đúng nghĩa thay cho "Usage %" vô nghĩa với gói không giới hạn).
  const gbPerDaySimOfSku = (sm: SKUMetrics): number | null => {
    const d = daysOfSku(sm.sku)
    return d && d > 0 && sm.active_sims > 0 ? sm.total_usage_gb / sm.active_sims / d : null
  }
  // Trung bình có trọng số GB/ngày/SIM toàn bộ gói Unlimited (cho summary card).
  const unlimitedGbPerDaySim = useMemo(() => {
    if (activeTab !== "Unlimited") return null
    let usage = 0, simDays = 0
    for (const sm of skuMetrics) {
      const d = daysOfSku(sm.sku)
      if (!d || d <= 0 || sm.active_sims <= 0) continue
      usage += sm.total_usage_gb
      simDays += sm.active_sims * d
    }
    return simDays > 0 ? usage / simDays : null
  }, [activeTab, skuMetrics])

  // Search + tab filter áp trên bảng bundles (đã gom) → tên cột trần.
  const searchClause = () => debouncedSearch ? `
    AND (
      order_code ILIKE '%${debouncedSearch.replace(/'/g, "''")}%' OR
      iccid ILIKE '%${debouncedSearch.replace(/'/g, "''")}%' OR
      sku ILIKE '%${debouncedSearch.replace(/'/g, "''")}%'
    )
  ` : ""
  const tabClause = () => {
    const tabValue = activeTab === "Daily" ? "Daily Data" : activeTab === "Fixed" ? "Fixed Data" : activeTab === "Unlimited" ? "Unlimited Data" : "all"
    return activeTab !== "all" ? `AND sku_type = '${tabValue}'` : ""
  }

  // CTE chung mọi bảng 3HK. Định nghĩa kỳ: SIM/bundle "thuộc kỳ" nếu CÓ bản ghi usage
  // (first_report_date) TRONG kỳ (khớp báo cáo NCC "SIM có usage trong kỳ"), KHÔNG chỉ SIM
  // phát sinh lần đầu trong kỳ. Usage/plan gom từ CÁC BẢN GHI TRONG KỲ.
  const V3HK = "sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','') = '3HKDATAPOOL')"
  const bundlesCTE = () => `
    WITH period_records AS (
      SELECT iccid, order_code, sku, sku_type, total_data_gb, data_amount_gb, first_report_date, activation_date
      FROM fact_data_usage
      WHERE ${V3HK}
        AND first_report_date >= '${startDate}' AND first_report_date <= '${endDate}'
    ),
    bundles AS (
      SELECT iccid, order_code, MAX(sku) AS sku,
             CASE WHEN UPPER(MAX(sku)) LIKE '%UNL%' THEN 'Unlimited Data' ELSE MAX(sku_type) END AS sku_type,
             MIN(first_report_date) AS first_report_date, MAX(activation_date) AS activation_date,
             SUM(total_data_gb) AS total_data_gb, MAX(data_amount_gb) AS data_amount_gb, COUNT(*) AS record_count
      FROM period_records GROUP BY iccid, order_code
    )`

  const fetchSKUTypeMetrics = async () => {
    setLoadingType(true)
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT COALESCE(sku_type, 'Unknown') as sku_type, COUNT(*) as active_sims,
          SUM(data_amount_gb) as total_plan_gb, SUM(total_data_gb) as total_usage_gb,
          CASE WHEN SUM(data_amount_gb) > 0 THEN (SUM(total_data_gb) / SUM(data_amount_gb)) * 100 ELSE 0 END as avg_usage_pct
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        GROUP BY 1 ORDER BY total_usage_gb DESC
      `
      const result = await runQuery(sql)
      setSkuTypeMetrics(result.map((r: any) => ({
        sku_type: r.sku_type,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
    } catch (e) {
      console.error("Error fetching SKU Type metrics:", e); throw e
    } finally {
      setLoadingType(false)
    }
  }

  const fetchSKUMetrics = async () => {
    setLoadingSKU(true)
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT sku, COUNT(*) as active_sims, SUM(data_amount_gb) as total_plan_gb, SUM(total_data_gb) as total_usage_gb,
          CASE WHEN SUM(data_amount_gb) > 0 THEN (SUM(total_data_gb) / SUM(data_amount_gb)) * 100 ELSE 0 END as avg_usage_pct
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        GROUP BY 1 ORDER BY total_usage_gb DESC
      `
      const result = await runQuery(sql)
      setSkuMetrics(result.map((r: any) => ({
        sku: r.sku,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
    } catch (e) {
      console.error("Error fetching SKU metrics:", e); throw e
    } finally {
      setLoadingSKU(false)
    }
  }

  const fetchTotals = async () => {
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT SUM(total_data_gb) as total_usage, SUM(data_amount_gb) as total_capacity,
          CASE WHEN SUM(data_amount_gb) > 0 THEN (SUM(total_data_gb) / SUM(data_amount_gb)) * 100 ELSE 0 END as avg_usage,
          COUNT(*) as total_count
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
      `
      const result = await runQuery(sql)
      if (result && result[0]) {
        setTotals({
          totalUsage: parseFloat(result[0].total_usage || 0),
          totalCapacity: parseFloat(result[0].total_capacity || 0),
          avgUsage: parseFloat(result[0].avg_usage || 0),
          count: parseInt(result[0].total_count || 0),
        })
      }
    } catch (e) {
      console.error("Error fetching totals:", e); throw e
    }
  }

  const fetchRecords = async (pageNum: number, isNewSearch: boolean = false) => {
    if (isNewSearch) setLoading(true)
    else setLoadingMore(true)

    setError(null)
    try {
      const offset = (pageNum - 1) * pageSize
      const sql = `
        ${bundlesCTE()}
        SELECT order_code, iccid, sku, sku_type,
          COALESCE(data_amount_gb, 0) as data_amount_gb,
          COALESCE(total_data_gb, 0) as total_data_gb,
          CASE WHEN data_amount_gb > 0 THEN (total_data_gb / data_amount_gb) * 100 ELSE 0 END as usage_pct,
          first_report_date, activation_date, record_count
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        ORDER BY ${sortConfig.key === "first_report_date" ? "first_report_date" : sortConfig.key} ${sortConfig.direction}
        LIMIT ${pageSize} OFFSET ${offset}
      `
      const result = await runQuery(sql)
      if (Array.isArray(result)) {
        const formatted = result.map((r: any) => ({
          ...r,
          data_amount_gb: parseFloat(r.data_amount_gb || 0),
          total_data_gb: parseFloat(r.total_data_gb || 0),
          usage_pct: parseFloat(r.usage_pct || 0),
        }))
        setData(formatted)
        setHasMore(formatted.length === pageSize)
      }
    } catch (err) {
      console.error("Error fetching 3HK data usage:", err)
      setError("Could not load data usage statistics.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const [exportingRecords, setExportingRecords] = useState(false)
  // Xuất TẤT CẢ records của kỳ/tab hiện tại ra Excel (query KHÔNG phân trang).
  const exportRecords = async () => {
    if (exportingRecords) return
    setExportingRecords(true)
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT order_code, iccid, sku, sku_type,
          COALESCE(data_amount_gb, 0) as data_amount_gb,
          COALESCE(total_data_gb, 0) as total_data_gb,
          CASE WHEN data_amount_gb > 0 THEN (total_data_gb / data_amount_gb) * 100 ELSE 0 END as usage_pct,
          first_report_date, activation_date, record_count
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        ORDER BY ${sortConfig.key === "first_report_date" ? "first_report_date" : sortConfig.key} ${sortConfig.direction}
      `
      const result = await runQuery(sql)
      const rows = (Array.isArray(result) ? result : []).map((r: any) => ({
        "Order Code": r.order_code || "",
        "ICCID": r.iccid || "",
        "SKU": r.sku || "",
        "SKU Type": r.sku_type || "",
        "Plan (GB)": parseFloat(r.data_amount_gb || 0),
        "Actual (GB)": parseFloat(r.total_data_gb || 0),
        "Usage %": Number(parseFloat(r.usage_pct || 0).toFixed(2)),
        "First Report": r.first_report_date || "",
        "Activation": r.activation_date || "",
        "Records": r.record_count || 0,
      }))
      exportRawRows(rows, `3hk-records-${activeTab}-${startDate}_to_${endDate}`, "Records")
    } catch (err) {
      console.error("Error exporting 3HK records:", err)
    } finally {
      setExportingRecords(false)
    }
  }

  const handlePageChange = (pageNum: number) => {
    setPage(pageNum)
    fetchRecords(pageNum, true)
  }

  const handleSort = (key: keyof DataUsageRecord) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }))
    setPage(1)
  }

  // Bảng country có trải nhiều năm không → quyết định nhãn tháng có kèm "'YY".
  const countryMultiYear = useMemo(
    () => new Set(countryMonths.map(m => m.slice(0, 4))).size > 1,
    [countryMonths],
  )

  // Xuất Excel bảng Country × Month (bao gồm cột Total, Run-rate + dòng GRAND TOTAL).
  const exportCountryCsv = () => {
    if (countryRows.length === 0) return
    const header = ["Country", ...countryMonths.map(m => monthLabel(m, countryMultiYear)), "Total", "Run-rate 12M"]
    const num = (n: number) => Number((n || 0).toFixed(2))
    const rows: (string | number)[][] = [
      ...countryRows.map(r => [r.country, ...countryMonths.map(m => num(r.monthly[m] ?? 0)), num(r.total), num(r.runRate)]),
      ["GRAND TOTAL", ...countryMonths.map(m => num(countryGrand.monthly[m] ?? 0)), num(countryGrand.total), num(countryGrand.runRate)],
    ]
    exportAOA(header, rows, `3hk-usage-by-country-${new Date().toISOString().slice(0, 10)}`, "By Country")
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-brand-600" />
            3HK Data Usage
          </h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích hành vi &amp; hiệu suất sản phẩm theo kỳ cước</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(["all", "Daily", "Fixed", "Unlimited"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === tab ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {tab === "all" ? "Tất cả" : tab}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search ICCID, Order Code..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm" />
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-brand-500/20">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-medium focus:outline-none" />
            <span className="text-slate-300 mx-1">—</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-medium focus:outline-none" />
          </div>

          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />

          <button onClick={() => { setPage(1); setAppliedTick(t => t + 1) }}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-sm active:scale-95">Lọc</button>

          <button onClick={() => { setPage(1); fetchTotals(); fetchSKUMetrics(); fetchSKUTypeMetrics(); fetchRecords(1, true) }}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-all shadow-sm">
            <RefreshCw className={cn("w-5 h-5", (loading || loadingMore || loadingSKU || loadingType) && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-brand-50 rounded-xl text-brand-600"><BarChart3 className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Usage</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatNumber(totals.totalUsage)} GB</p>
          <p className="text-xs text-slate-500 mt-1">Actual data consumed</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600"><Database className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Capacity</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatNumber(totals.totalCapacity)} GB</p>
          <p className="text-xs text-slate-500 mt-1">Total data allocated in plans</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600"><RefreshCw className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {activeTab === "Unlimited" ? "Avg. GB/ngày/SIM" : "Avg. Usage %"}
            </span>
          </div>
          {activeTab === "Unlimited" ? (
            <>
              <p className="text-2xl font-bold text-slate-900">
                {unlimitedGbPerDaySim != null ? `${unlimitedGbPerDaySim.toFixed(2)} GB` : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">Data high-speed dùng/ngày/SIM (gói unlimited)</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900">{totals.avgUsage.toFixed(1)}%</p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, totals.avgUsage)}%` }} />
              </div>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Package className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active SIMs</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totals.count.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Sim tracks in this period</p>
        </div>
      </div>

      {/* Data Usage by Country × Month (TB) — sub-report từ data_usage_log */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-600" />
              Data Usage by Country × Month (TB)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Nguồn <code className="text-slate-600">data_usage_log</code> · Đơn vị TB (data_gb/1024)
              {countryMonths.length > 0 && (
                <> · Tháng {monthLabel(countryMonths[0], countryMultiYear)} – {monthLabel(countryMonths[countryMonths.length - 1], countryMultiYear)}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {countryMonths.length > 0 && (
              <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5 whitespace-nowrap">
                RUN-RATE 12M = {monthLabel(countryMonths[countryMonths.length - 1], countryMultiYear)} × 12 = {fmtTB(countryGrand.runRate)} TB
              </span>
            )}
            <button onClick={exportCountryCsv} disabled={countryRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        {loadingCountry ? (
          <div className="p-8 text-center text-sm text-slate-400">Đang tải dữ liệu theo quốc gia…</div>
        ) : countryError ? (
          <div className="p-8 text-center text-sm text-rose-500">{countryError}</div>
        ) : countryRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Không có dữ liệu usage theo quốc gia.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="sticky left-0 z-10 bg-slate-700 px-3 py-2.5 text-left font-bold text-xs uppercase tracking-wider">Country</th>
                  {countryMonths.map((m) => (
                    <th key={m} className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider whitespace-nowrap">{monthLabel(m, countryMultiYear)}</th>
                  ))}
                  <th className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider bg-slate-800 whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider bg-brand-700 whitespace-nowrap">Run-rate 12M</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((row) => (
                  <tr key={row.country} className={cn("border-b border-slate-100 hover:bg-slate-50/70", row.country === "OTHERS" && "text-slate-500 italic")}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">{row.country}</td>
                    {countryMonths.map((m) => (
                      <td key={m} className="px-3 py-2 tabular-nums text-slate-600">{fmtTB(row.monthly[m] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-2 tabular-nums font-bold text-slate-900 bg-slate-50">{fmtTB(row.total)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-brand-700 bg-brand-50/60">{fmtTB(row.runRate)}</td>
                  </tr>
                ))}
                <tr className="bg-amber-50 border-t-2 border-amber-200 font-bold text-slate-900">
                  <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2.5 text-left uppercase text-xs tracking-wider">Grand Total</td>
                  {countryMonths.map((m) => (
                    <td key={m} className="px-3 py-2.5 tabular-nums">{fmtTB(countryGrand.monthly[m] ?? 0)}</td>
                  ))}
                  <td className="px-3 py-2.5 tabular-nums bg-amber-100">{fmtTB(countryGrand.total)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-brand-800 bg-brand-100/70">{fmtTB(countryGrand.runRate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SKU Type Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-600" />
            Average Usage by SKU Type
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                {([
                  { key: "sku_type" as const, label: "SKU Type", align: "" },
                  { key: "active_sims" as const, label: "Active SIMs", align: "text-center" },
                  { key: "total_plan_gb" as const, label: "Total Plan (GB)", align: "text-right" },
                  { key: "total_usage_gb" as const, label: "Total Actual (GB)", align: "text-right" },
                  { key: "avg_usage_pct" as const, label: "Avg. Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => setSkuTypeSort(prev => ({ key: col.key, direction: prev.key === col.key && prev.direction === "asc" ? "desc" : "asc" }))}>
                    {col.label} {skuTypeSort.key === col.key && (skuTypeSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingType ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : sortedSkuTypeMetrics.length > 0 ? (
                sortedSkuTypeMetrics.map((sm, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-100">{sm.sku_type}</span>
                    </td>
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sm.active_sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                        {sm.avg_usage_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", sm.avg_usage_pct > 80 ? "bg-rose-500" : sm.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, sm.avg_usage_pct)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-6 py-6 text-center text-slate-400 text-sm">No SKU type metrics available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unlimited Breakdown theo nhóm tốc độ (high-speed + throttle) — chỉ tab Unlimited */}
      {activeTab === "Unlimited" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Unlimited — Breakdown theo gói (high-speed × throttle)
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">3 loại: 500MB·5mbps · 500MB·10mbps · 1GB·10mbps. Mã CŨ phân loại theo P-code (P2=5, P1=10, PY=1GB·10); mã MỚI theo cột throttle_speed Product DB (A=5, B=10; tách 500MB/1GB ở 10mbps).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nhóm tốc độ</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Active SIMs</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Plan (GB)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Actual (GB)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-indigo-500 uppercase tracking-wider text-right">GB/ngày/SIM</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Thực tế / Kế hoạch %</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingSKU ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse"><td colSpan={7} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                  ))
                ) : speedGroups.length > 0 ? (
                  speedGroups.map((sg, idx) => {
                    const expanded = expandedGroup === sg.speed_group
                    const members = speedGroupMembers[sg.speed_group] ?? []
                    return (
                    <React.Fragment key={idx}>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">{sg.speed_group}</span>
                      </td>
                      <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sg.active_sims.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sg.total_plan_gb)}</td>
                      <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sg.total_usage_gb)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("text-sm font-bold", sg.actual_per_day > sg.plan_per_day ? "text-rose-600" : "text-emerald-600")} title={`Kế hoạch ${sg.plan_per_day.toFixed(2)} GB/ngày/SIM`}>
                          {sg.actual_per_day.toFixed(2)} GB
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("text-sm font-bold", sg.avg_usage_pct > 100 ? "text-rose-600" : sg.avg_usage_pct > 80 ? "text-amber-600" : "text-emerald-600")}>
                          {sg.avg_usage_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={cn("h-1.5 rounded-full", sg.avg_usage_pct > 80 ? "bg-rose-500" : sg.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${Math.min(100, sg.avg_usage_pct)}%` }} />
                          </div>
                          <button onClick={() => setExpandedGroup(expanded ? null : sg.speed_group)}
                            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                            Chi tiết ({members.length})
                            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={7} className="px-6 py-3">
                          <p className="text-[11px] text-slate-400 mb-2">
                            Kế hoạch (GB/ngày/SIM) = data_amount_gb ÷ số ngày gói (mức 3HK cấp/ngày, từ DB).
                            Thực tế = Total Actual ÷ Active SIMs ÷ số ngày gói.
                            <span className="text-rose-600 font-semibold"> Đỏ</span> = thực tế vượt kế hoạch (SIM dùng quá mức 3HK cấp → chi phí datapool cao hơn dự kiến),
                            <span className="text-emerald-600 font-semibold"> xanh</span> = trong kế hoạch.
                          </p>
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60">
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">SKU</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Active SIMs</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Plan (GB)</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Kế hoạch (GB/ngày/SIM)</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Actual (GB)</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Avg. Usage %</th>
                                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">GB/ngày/SIM</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {members.length > 0 ? members.map((m, j) => {
                                  const d = daysOfSku(m.sku)
                                  // Kế hoạch/ngày = data_amount_gb ÷ ngày (từ DB) — mức 3HK cấp/ngày cho gói này.
                                  const planPerDay = (d && d > 0 && m.active_sims > 0) ? m.total_plan_gb / m.active_sims / d : null
                                  const gbPerDaySim = (d && d > 0 && m.active_sims > 0) ? m.total_usage_gb / m.active_sims / d : null
                                  const over = gbPerDaySim != null && planPerDay != null && gbPerDaySim > planPerDay
                                  return (
                                  <tr key={j} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{m.sku}</td>
                                    <td className="px-4 py-2 text-center text-slate-600 text-xs font-medium">{m.active_sims.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right text-slate-600 text-xs">{formatNumber(m.total_plan_gb)}</td>
                                    <td className="px-4 py-2 text-right text-slate-500 text-xs">
                                      {planPerDay == null ? "—" : `${planPerDay.toFixed(2)} GB`}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-900 text-xs">{formatNumber(m.total_usage_gb)}</td>
                                    <td className="px-4 py-2 text-right text-xs font-bold text-slate-700">{m.avg_usage_pct.toFixed(1)}%</td>
                                    <td className={cn("px-4 py-2 text-right text-xs font-bold", gbPerDaySim == null ? "text-slate-300" : over ? "text-rose-600" : "text-emerald-600")}>
                                      {gbPerDaySim == null ? "—" : `${gbPerDaySim.toFixed(2)} GB`}
                                    </td>
                                  </tr>
                                  )
                                }) : (
                                  <tr><td colSpan={7} className="px-4 py-3 text-center text-slate-400 text-xs">Không có SKU</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    )
                  })
                ) : (
                  <tr><td colSpan={7} className="px-6 py-6 text-center text-slate-400 text-sm">Không có dữ liệu nhóm Unlimited trong kỳ này</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Biểu đồ so sánh mức sử dụng 3 loại gói (chỉ tab Unlimited) */}
      {activeTab === "Unlimited" && speedChart.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              So sánh mức sử dụng theo nhóm — Thực tế (GB/ngày/SIM) vs Kế hoạch
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Cột Thực tế <span className="text-rose-600 font-semibold">đỏ</span> = vượt mức 3HK cấp/ngày của nhóm (chi phí datapool cao hơn dự kiến), <span className="text-emerald-600 font-semibold">xanh</span> = trong kế hoạch. Cột xám = mức kế hoạch/ngày (data_amount_gb ÷ ngày).</p>
          </div>
          <div className="p-4" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speedChart} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" GB" width={60} />
                <Tooltip formatter={(v: number, n: string) => [`${Number(v).toFixed(2)} GB`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="assume" name="Kế hoạch (GB/ngày)" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Thực tế (GB/ngày/SIM)" radius={[4, 4, 0, 0]}>
                  {speedChart.map((d, i) => (
                    <Cell key={i} fill={d.actual > d.assume ? "#e11d48" : "#10b981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Biểu đồ phân bố mức data dùng/ngày/SIM của các gói Unlimited (chỉ tab Unlimited) */}
      {activeTab === "Unlimited" && usageDist.groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Phân bố mức data sử dụng/ngày — theo loại gói Unlimited
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Trục X = dải GB dùng/ngày/SIM, trục Y = số SIM (Active). Cột chồng theo nhóm tốc độ. Đường tham chiếu: giả định 1.6GB (5mbps) · 1.8GB (10mbps).</p>
          </div>
          <div className="p-4" style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageDist.rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} unit=" GB" />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={48} allowDecimals={false} />
                <Tooltip formatter={(v: number, n: string) => [`${v} SIM`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {usageDist.groups.map((g, i) => (
                  <Bar key={g} dataKey={g} name={g} stackId="d"
                    fill={["#6366f1", "#f59e0b", "#10b981", "#0ea5e9"][i % 4]} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SKU Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-brand-600" />
            Average Usage by SKU
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                {([
                  { key: "sku" as const, label: "SKU", align: "" },
                  { key: "active_sims" as const, label: "Active SIMs", align: "text-center" },
                  { key: "total_plan_gb" as const, label: "Total Plan (GB)", align: "text-right" },
                  { key: "total_usage_gb" as const, label: "Total Actual (GB)", align: "text-right" },
                  { key: "avg_usage_pct" as const, label: activeTab === "Unlimited" ? "GB/ngày/SIM" : "Avg. Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => setSkuSort(prev => ({ key: col.key, direction: prev.key === col.key && prev.direction === "asc" ? "desc" : "asc" }))}>
                    {col.label} {skuSort.key === col.key && (skuSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingSKU ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : paginatedSkuMetrics.length > 0 ? (
                paginatedSkuMetrics.map((sm, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-bold text-slate-900 text-sm">{sm.sku}</td>
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sm.active_sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      {activeTab === "Unlimited" ? (() => {
                        const g = gbPerDaySimOfSku(sm)
                        return <span className="text-sm font-bold text-slate-700">{g != null ? `${g.toFixed(2)} GB` : "—"}</span>
                      })() : (
                        <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                          {sm.avg_usage_pct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", sm.avg_usage_pct > 80 ? "bg-rose-500" : sm.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, sm.avg_usage_pct)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">No SKU metrics available</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* SKU Pagination */}
        {sortedSkuMetrics.length > skuPageSize && (
          <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {Math.min((skuPage - 1) * skuPageSize + 1, sortedSkuMetrics.length)} to {Math.min(skuPage * skuPageSize, sortedSkuMetrics.length)} of {sortedSkuMetrics.length} SKUs
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setSkuPage(p => Math.max(1, p - 1))} disabled={skuPage === 1}
                className="p-1 border border-slate-200 rounded-lg bg-white disabled:opacity-50 text-slate-500">
                <ChevronUp className="w-4 h-4 -rotate-90" />
              </button>
              <span className="text-xs font-bold text-slate-600 px-2">{skuPage} / {Math.ceil(sortedSkuMetrics.length / skuPageSize)}</span>
              <button onClick={() => setSkuPage(p => Math.min(Math.ceil(sortedSkuMetrics.length / skuPageSize), p + 1))} disabled={skuPage >= Math.ceil(sortedSkuMetrics.length / skuPageSize)}
                className="p-1 border border-slate-200 rounded-lg bg-white disabled:opacity-50 text-slate-500">
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-end gap-4">
          <button onClick={exportRecords} disabled={exportingRecords} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50">
            <Download className="w-4 h-4" />
            {exportingRecords ? "Exporting..." : "Export"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {([
                  { key: "order_code" as const, label: "Order Code", align: "" },
                  { key: "iccid" as const, label: "ICCID", align: "" },
                  { key: "sku" as const, label: "Product / SKU", align: "" },
                  { key: "first_report_date" as const, label: "First Usage", align: "" },
                  { key: "data_amount_gb" as const, label: "Plan (GB)", align: "text-right" },
                  { key: "total_data_gb" as const, label: "Actual (GB)", align: "text-right" },
                  { key: "usage_pct" as const, label: "Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => handleSort(col.key)}>
                    {col.label} {sortConfig.key === col.key && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={7} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : data.length > 0 ? (
                data.map((record, idx) => (
                  <tr key={`${record.iccid}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">{record.order_code}</td>
                    <td className="px-6 py-4 text-slate-600 text-sm font-mono">{record.iccid}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-600 font-medium">{record.sku}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{record.sku_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-600 font-bold">{formatDate(record.first_report_date)}</span>
                        <span className="text-[10px] text-slate-400 italic">Acts: {formatDate(record.activation_date)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-600 text-sm">{record.data_amount_gb.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm">{record.total_data_gb.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", record.usage_pct > 90 ? "bg-rose-500" : record.usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, record.usage_pct)}%` }} />
                        </div>
                        <span className={cn("text-xs font-bold min-w-[40px] text-right", record.usage_pct > 90 ? "text-rose-600" : record.usage_pct > 70 ? "text-amber-600" : "text-emerald-600")}>
                          {record.usage_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Database className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No usage records found for 3HK products in this period</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500 font-medium">
            Showing <span className="text-slate-900">{Math.min((page - 1) * pageSize + 1, totals.count)}</span> to <span className="text-slate-900">{Math.min(page * pageSize, totals.count)}</span> of <span className="text-slate-900">{totals.count.toLocaleString()}</span> records
          </p>

          <div className="flex items-center gap-2">
            <button onClick={() => handlePageChange(Math.max(1, page - 1))} disabled={page === 1 || loading || loadingMore}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              <ChevronUp className="w-4 h-4 -rotate-90" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(totals.count / pageSize)) }).map((_, i) => {
                const totalPages = Math.ceil(totals.count / pageSize)
                let pageNum = 1
                if (totalPages <= 5) pageNum = i + 1
                else if (page <= 3) pageNum = i + 1
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = page - 2 + i

                if (pageNum > totalPages || pageNum < 1) return null

                return (
                  <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                    className={cn("w-9 h-9 rounded-xl text-sm font-bold transition-all",
                      page === pageNum ? "bg-brand-600 text-white shadow-lg shadow-brand-200" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm")}>
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button onClick={() => handlePageChange(page + 1)} disabled={page >= Math.ceil(totals.count / pageSize) || loading || loadingMore}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
