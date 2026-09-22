"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import {
  Activity, Search, Filter, Download, RefreshCw, Calendar, Package,
  ChevronUp, ChevronDown, Database, BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { exportRawRows, exportAOA } from "@/lib/export-excel"

// Port "y hệt" gohub-intel ThreeHKDataUsage. Data qua /api/analytics/query (SELECT-only).
// Bỏ motion/react (không dùng), inline getDefaultDateRange/formatDate.

// Biểu đồ nạp động (ssr:false) → recharts code-split khỏi bundle đầu (s196+21, roadmap performance s196+20).
const chartLoading = () => <div className="w-full h-full animate-pulse bg-slate-100 rounded" />
const SpeedComparisonChart = dynamic(() => import("./3hk-usage-charts").then(m => m.SpeedComparisonChart), { ssr: false, loading: chartLoading })
const UsageDistChart       = dynamic(() => import("./3hk-usage-charts").then(m => m.UsageDistChart),       { ssr: false, loading: chartLoading })
const SkuCountChart        = dynamic(() => import("./3hk-usage-charts").then(m => m.SkuCountChart),        { ssr: false, loading: chartLoading })

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
  if (mOld) return parseInt(mOld[1])
  // Mã CHUẨN 13 ký tự không có literal "UNL" (vd C/D/E/G/H/L/X ở vị trí 8 — s200+3) — SKU CODE kết thúc
  // bằng 2 ký tự DayAmount (vd "EAANZ3DX00303" → "03" = 3 ngày), verify khớp cả mã Fixed/Daily 13 ký tự
  // khác (vd "...F01215" → "15" ngày) nên áp dụng chung, không chỉ riêng Unlimited.
  if (sku.length === 13) {
    const d = parseInt(sku.slice(11, 13), 10)
    if (!isNaN(d) && d > 0) return d
  }
  return null
}


// Ký tự phân loại "Data type" của mã SKU 3HK (s200+3/+4, bảng mapping Hiếu cung cấp) — VỊ TRÍ 8 cho
// mã CHUẨN 13 ký tự, VỊ TRÍ 10 cho mã CŨ 14 ký tự (verify qua SQL thật, xem wiki analytics-3hk-usage.md
// §3.1). Độ dài khác (15/17/18 ký tự, số lượng nhỏ) — chưa xác định vị trí, trả null (gộp "Khác" ở FE).
const typeLetterOfSku = (sku: string): string | null => {
  if (sku.length === 13) return sku[7]?.toUpperCase() ?? null
  if (sku.length === 14) return sku[9]?.toUpperCase() ?? null
  return null
}

// Vintage của mã (13 ký tự CHUẨN vs 14 ký tự CŨ) — 2 vintage dùng CHUNG ký tự nhưng KHÁC HẲN quy ước,
// tuyệt đối không được gộp chung khi hiển thị. Verify trực tiếp SQL trên staging (fact_data_usage,
// vendor 3HKDATAPOOL): ký tự 'P' ở mã CŨ 14kt (vị trí 10) — 350/350 SKU distinct đều chứa literal "UNL"
// trong chuỗi (100%, vd nằm trong token "UNLIP1"/"UNLIP2") → BẢN CHẤT LÀ UNLIMITED, không liên quan gì
// "Daily". Ký tự 'P' ở mã MỚI 13kt (vị trí 8) — 0/792 SKU distinct có "UNL" → đúng là Daily throttle
// <2mbps (CODE_LABELS). Cùng 1 chữ cái 'P' nhưng 2 Ý NGHĨA HOÀN TOÀN TRÁI NGƯỢC nhau tuỳ vintage — mọi nơi
// gom nhóm theo `typeLetterOfSku()` PHẢI tách riêng vintage để không lẫn 2 quy ước này vào 1 bucket.
const skuVintage = (sku: string): "13" | "14" | null => {
  if (sku.length === 13) return "13"
  if (sku.length === 14) return "14"
  return null
}
// Nhãn ngắn cho vintage — dùng trực tiếp trong UI (badge/tooltip) để Hiếu luôn biết đang xem mã nào.
const vintageLabel = (v: "13" | "14") => (v === "13" ? "mã mới · 13kt" : "mã cũ · 14kt")

// Mô tả người-đọc-được cho từng ký tự phân loại (bảng Hiếu cung cấp) — dùng cho tooltip/label, KHÔNG
// dùng để tính toán (tính toán bucket Daily/Fixed/Unlimited nằm ở SQL `SKU_TYPE_CASE` bên dưới).
const CODE_LABELS: Record<string, string> = {
  A: "Daily - Unlimited 5mbps", B: "Daily - Unlimited 10mbps", C: "Unlimited 20mbps",
  D: "Unlimited 100mbps", E: "Fixed - Unlimited 5mbps", G: "Fixed - Unlimited 10mbps",
  H: "Unlimited 5mbps", L: "Unlimited 50mbps", X: "Daily Unlimited 10mbps - Midnight",
  F: "Fixed throttle <2mbps", Y: "Fixed no-throttle", P: "Daily throttle <2mbps",
  Z: "Daily no-throttle", T: "Daily throttle <2mbps - Midnight",
}

// s202: cùng 1 ký tự phân loại Unlimited (VD 'B') có thể gộp CHUNG NHIỀU gói thật khác nhau — vd 500MB
// tốc độ cao rồi giảm còn 10Mbps VÀ 1GB tốc độ cao rồi giảm còn 10Mbps đều là 'B' (cùng "Daily - Unlimited
// 10mbps" theo bảng CODE_LABELS), chỉ SKU letter không phân biệt được. Sau khi sync thêm cột `data`
// (ngưỡng tốc độ cao, đơn vị MB) + `speed` (Mbps sau khi hết ngưỡng) vào Supabase `skus`, dùng combo
// (letter, vintage, data, speed) làm khoá gộp thật thay vì chỉ (letter, vintage) — xem `skuMeta` fetch ở
// trên (cross-DB: fact_data_usage nằm gohub_dw, data/speed nằm Supabase, không JOIN được bằng SQL, phải
// merge ở client).
const formatDataAmount = (mb: number): string => {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024}GB`
  if (mb >= 1024) return `${fmtDec(mb / 1024, 1)}GB`
  return `${mb}MB`
}
// Nhãn hiển thị cho 1 sub-variant. Ưu tiên `throttle_speed` (text người-đọc-được lấy thẳng từ GoHub API,
// VD "1GB high speed then drop to 10 mbps") — đúng và tự nhiên hơn tự ghép chữ. Không có thì tự ghép từ
// data/speed. Không có cả hai (SKU không tra được trên Supabase — VD đã ngừng bán, mất khỏi catalog hiện
// tại) thì lùi về nhãn cũ theo CODE_LABELS[letter] (mất độ chi tiết nhưng không hiện rỗng).
const variantLabelOf = (
  letter: string, meta: { data: number | null; speed: number | null; throttle_speed: string | null } | undefined,
): string => {
  if (meta?.throttle_speed) return meta.throttle_speed
  if (meta?.data != null && meta?.speed != null) return `${formatDataAmount(meta.data)} tốc độ cao, giảm còn ${meta.speed}Mbps`
  return CODE_LABELS[letter] ?? letter
}
// Khoá gộp nhóm sub-variant — thêm data/speed vào key cũ `${letter}_${vintage}` (chưa tra được meta thì
// giữ nguyên hành vi cũ, gộp theo letter, tránh vỡ nhóm khi Supabase lookup chưa kịp trả về/lỗi).
const variantKeyOf = (
  letter: string, vintage: string, meta: { data: number | null; speed: number | null } | undefined,
): string => `${letter}_${vintage}_${meta?.data ?? "x"}_${meta?.speed ?? "x"}`

// `data_usage_log.country` viết khác `ncc_3hk.country` cho vài nước — verify trực tiếp SQL (đối chiếu 46
// nước distinct trong data_usage_log với 47 nước trong ncc_3hk): "USA"≠"US", "United Kingdom"≠"UK",
// "Slovak Republic"≠"Slovakia" (tổng ~6,7 TB, ~0,5% toàn kỳ — nhỏ nhưng vẫn map đúng thay vì rơi "Chưa rõ
// Zone"). "Latvia" xuất hiện trong data_usage_log nhưng KHÔNG có trong ncc_3hk (thiếu hẳn, không phải lỗi
// đặt tên) — rơi đúng vào "Chưa rõ Zone" (0,01 TB, không đáng kể).
const COUNTRY_ALIAS: Record<string, string> = {
  "USA": "US",
  "United Kingdom": "UK",
  "Slovak Republic": "Slovakia",
}

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
  key: string           // s202: `${speed_group}_${vintage}_${data}_${speed}` — xem `variantKeyOf()`
  speed_group: string  // s200+4: ký tự phân loại (A/B/C/.../X), KHÔNG còn là nhãn tốc độ/throttle
  vintage: "13" | "14"  // mã CHUẨN 13kt hay mã CŨ 14kt — xem comment `skuVintage()` (2 quy ước khác nhau)
  data: number | null    // s202: ngưỡng data tốc độ cao (MB, từ Supabase skus.data) — null nếu chưa tra được
  speed: number | null   // s202: tốc độ Mbps sau khi hết ngưỡng (Supabase skus.speed)
  label: string          // s202: nhãn người-đọc-được — xem `variantLabelOf()`
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

// s202: chuẩn hoá số thập phân hiển thị theo vi-VN (dấu phẩy = thập phân, dấu chấm = hàng nghìn) — trước
// nhiều chỗ dùng `.toFixed()` trần (kiểu Mỹ, dấu chấm thập phân: "1.92") trong khi cột "Active SIMs"/
// "Total Plan"/"Total Actual" cùng bảng lại dùng `formatNumber()` (vi-VN: "24.253,2") — không đồng nhất
// trong CÙNG 1 bảng. `fmtDec()` thay `.toFixed()` ở MỌI chỗ HIỂN THỊ (JSX) — KHÔNG áp cho export Excel/CSV
// (những chỗ đó cần Number thuần, để nguyên `.toFixed()` — Excel tự định dạng theo locale máy người mở file).
const fmtDec = (n: number, decimals: number) =>
  (n || 0).toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export default function ThreeHKDataUsagePage() {
  const [data, setData] = useState<DataUsageRecord[]>([])
  const [skuMetrics, setSkuMetrics] = useState<SKUMetrics[]>([])
  // Tab mà `skuMetrics` HIỆN TẠI thực sự thuộc về — `speedGroups` không tự biết `skuMetrics` có "đúng
  // hạn" hay không nếu chỉ nhìn `activeTab` — phải gắn kèm cờ này rồi so cả 2 mới coi là dữ liệu đáng tin.
  const [skuMetricsTab, setSkuMetricsTab] = useState<"all" | "Daily" | "Fixed" | "Unlimited">("all")
  // Chặn out-of-order response: bấm đổi tab liên tiếp bắn nhiều request `fetchSKUMetrics()` cùng lúc,
  // request CŨ hơn có thể trả lời VỀ SAU request MỚI (network timing, không đảm bảo thứ tự) — nếu chỉ
  // dựa "await xong thì set state" thì response cũ tới sau sẽ ĐÈ mất kết quả đúng của request mới. Mỗi
  // lần gọi tăng `skuMetricsReqIdRef`, chỉ áp dụng kết quả nếu vẫn là request MỚI NHẤT lúc trả lời về.
  // Cùng bug/cùng fix áp cho 3 fetch tab-phụ-thuộc còn lại (`skuTypeMetricsReqIdRef`/`totalsReqIdRef`/
  // `recordsReqIdRef`) — verify sống trên staging thấy card "Average Usage by SKU Type" hiện SAI tab
  // (VD "Fixed Data") trong khi bảng breakdown bên dưới đã đúng "Unlimited" cùng lúc, xác nhận đúng bug
  // này xảy ra độc lập ở từng fetch, không chỉ riêng fetchSKUMetrics.
  const skuMetricsReqIdRef     = useRef(0)
  const skuTypeMetricsReqIdRef = useRef(0)
  const totalsReqIdRef         = useRef(0)
  const recordsReqIdRef        = useRef(0)
  const [skuTypeMetrics, setSkuTypeMetrics] = useState<SKUTypeMetrics[]>([])
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
  // Ngày data mới nhất THẬT SỰ (không đổi theo bộ lọc người dùng đang chỉnh, khác endDate) — hiện badge
  // freshness (s200+2) để không ai tưởng "thiếu tháng X" là bug web mỗi lần 3HK sync trễ.
  const [maxAvailableDate, setMaxAvailableDate] = useState<string | null>(null)
  // Ngày chỉ áp khi bấm "Lọc" (không tự lọc mỗi lần đổi ngày). appliedTick bump → chạy lại query.
  const [appliedTick, setAppliedTick] = useState(0)
  const [sortConfig, setSortConfig] = useState<{ key: keyof DataUsageRecord; direction: "asc" | "desc" }>({ key: "first_report_date", direction: "desc" })

  const [skuSort, setSkuSort] = useState<{ key: keyof SKUMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })
  const [skuTypeSort, setSkuTypeSort] = useState<{ key: keyof SKUTypeMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })

  const [totals, setTotals] = useState({ totalUsage: 0, totalCapacity: 0, avgUsage: 0, count: 0 })

  // s202: meta (data/speed/throttle_speed) từ Supabase `skus` cho từng sku_code — cần để tách sub-variant
  // Unlimited CÙNG ký tự phân loại nhưng KHÁC gói thật (VD mã B: 500MB·10mbps vs 1GB·10mbps — chỉ dựa
  // SKU letter không phân biệt được, xem comment `variantKeyOf()`/`variantLabelOf()` bên dưới).
  const [skuMeta, setSkuMeta] = useState<Record<string, { data: number | null; speed: number | null; throttle_speed: string | null }>>({})
  useEffect(() => {
    if (activeTab !== "Unlimited" || skuMetrics.length === 0) return
    const codes = [...new Set(skuMetrics.map(sm => sm.sku))]
    ;(async () => {
      try {
        const res = await fetch("/api/analytics/3hk-sku-meta", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes }),
        })
        const j = await res.json()
        const map: Record<string, { data: number | null; speed: number | null; throttle_speed: string | null }> = {}
        for (const r of (j.data ?? [])) {
          map[r.sku_code] = { data: r.data ?? null, speed: r.speed ?? null, throttle_speed: r.throttle_speed ?? null }
        }
        setSkuMeta(map)
      } catch (e) {
        console.error("Error fetching sku meta (data/speed):", e)
      }
    })()
  }, [activeTab, skuMetrics])

  // Sub-report: Data Usage by Country × Month (TB). Nguồn data_usage_log (log thô có cột country),
  // đơn vị TB = data_gb / 1024. Độc lập với kỳ/tab của bảng chính — luôn hiển thị trend theo tháng
  // (tối đa 12 tháng gần nhất). RUN-RATE 12M = tổng tháng mới nhất × 12 (ước năm hoá).
  const [countryMonths, setCountryMonths] = useState<string[]>([])
  const [countryRows, setCountryRows] = useState<CountryUsageRow[]>([])
  const [loadingCountry, setLoadingCountry] = useState(false)
  const [countryError, setCountryError] = useState<string | null>(null)

  // Zone × Month (Hiếu yêu cầu): nhóm 47 nước trong Supabase `ncc_3hk` thành 4 Zone (A=A1+A2, B, C, D).
  // Dùng lại `/api/ncc/3hk-zones` (route có sẵn cho NCC Catalog, mở cho mọi role đã login) — không thêm
  // route/query gohub_dw mới, zoneRows tính CLIENT-SIDE từ countryRows đã fetch ở trên (§ zoneRows dưới).
  const [zoneByCountry, setZoneByCountry] = useState<Record<string, string>>({})
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ncc/3hk-zones")
        const j = await res.json()
        const map: Record<string, string> = {}
        for (const r of (j.data ?? [])) {
          const raw = String(r.zone || "").toUpperCase()
          // Gộp A1+A2 thành 1 "Zone A" (Hiếu yêu cầu) — B/C/D giữ nguyên (đã là 1 mã/zone).
          map[String(r.country || "").trim()] = raw === "A1" || raw === "A2" ? "A" : raw
        }
        setZoneByCountry(map)
      } catch (e) {
        console.error("Error fetching ncc_3hk zones:", e)
      }
    })()
  }, [])

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
          setStartDate(startStr); setEndDate(endStr); setMaxAvailableDate(endStr); setAppliedTick(t => t + 1); return
        }
      } catch (e) { console.error("Error fetching 3hk max date:", e) }
      const d = getDefaultDateRange(); setStartDate(d.startDate); setEndDate(d.endDate); setAppliedTick(t => t + 1)
    })()
  }, [])

  // Sub-report Country × Month: ĐỘC LẬP với bộ lọc ngày của bảng chính (đúng như comment thiết kế gốc ở
  // trên — trước đây code lại vô tình dùng CHUNG startDate/endDate của page, nên mặc định chỉ hiện ĐÚNG 1
  // THÁNG (khớp verify trực tiếp: chỉ có cột "AUG" khi mở trang) thay vì trend 12 tháng như comment mô tả.
  // Fix: tự tính cửa sổ rộng nhất (data thật chỉ từ 2026-01 nên 24 tháng đủ phủ toàn bộ lịch sử hiện có,
  // dư sức cho các tháng phát sinh sau này) neo theo MAX(report_date) của CHÍNH bảng data_usage_log — không
  // phụ thuộc filter ngày người dùng đang chỉnh ở bảng SKU. Tải 1 lần khi mount, "Lọc" KHÔNG ảnh hưởng bảng
  // này nữa (đúng tinh thần "độc lập" đã ghi trong comment).
  useEffect(() => {
    (async () => {
      setLoadingCountry(true); setCountryError(null)
      try {
        const sql = `
          SELECT COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
                 to_char(report_date::date, 'YYYY-MM')          AS ym,
                 ROUND((SUM(data_gb) / 1024.0)::numeric, 4)    AS tb
          FROM data_usage_log
          WHERE report_date IS NOT NULL
            AND report_date::date >= (SELECT MAX(report_date)::date FROM data_usage_log) - INTERVAL '23 months'
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

        // Dựng dòng theo country, sắp theo tổng giảm dần — dùng làm nguồn cho bảng Zone (zoneRows/
        // zoneMembers) bên dưới, KHÔNG còn render trực tiếp bảng theo nước (đã bỏ, thay bằng drill-down
        // trong bảng Zone theo yêu cầu Hiếu).
        const all: CountryUsageRow[] = Object.entries(byCountry).map(([country, monthly]) => {
          const total = months.reduce((s, m) => s + (monthly[m] ?? 0), 0)
          return { country, monthly, total, runRate: (monthly[latest] ?? 0) * 12 }
        }).sort((a, b) => b.total - a.total)

        setCountryMonths(months)
        setCountryRows(all)
      } catch (e: any) {
        console.error("Error fetching country usage:", e)
        setCountryError("Không tải được bảng Usage by Country.")
      } finally {
        setLoadingCountry(false)
      }
    })()
    // Chạy đúng 1 lần khi mount — cố ý KHÔNG phụ thuộc appliedTick/startDate/endDate (xem comment trên).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Chart "mã nào chiếm bao nhiêu SIM" (s200+4, Hiếu chỉnh lại từ bản per-SKU sang per-KÝ TỰ phân loại —
  // gọn hơn hẳn 1366 mã SKU riêng lẻ, đi thẳng vào câu hỏi "mã A/B/X... chiếm bao nhiêu"). Gom theo
  // `typeLetterOfSku()` (vị trí 8 mã 13 ký tự / vị trí 10 mã 14 ký tự); SKU không xác định được vị trí
  // (15/17/18 ký tự, số lượng nhỏ) gộp vào "Khác (mã dài khác)".
  // ⚠️ Fix trùng mã (Hiếu báo) — khoá gộp PHẢI kèm `skuVintage()`: ký tự 'P' mã MỚI 13kt (Daily throttle
  // thật, verify 0/792 SKU có "UNL") và 'P' mã CŨ 14kt (Unlimited thật, verify 350/350 SKU có "UNL") là 2
  // THỨ HOÀN TOÀN KHÁC NHAU — gộp chung theo mỗi 1 chữ cái sẽ cộng nhầm 2 quy ước vào cùng 1 cột khi xem
  // tab "Tất cả" (nơi cả Daily lẫn Unlimited cùng xuất hiện). Xem comment đầy đủ ở `skuVintage()`.
  const typeLetterChart = useMemo(() => {
    const acc: Record<string, number> = {}
    let unknownTotal = 0
    for (const sm of skuMetrics) {
      const letter  = typeLetterOfSku(sm.sku)
      const vintage = skuVintage(sm.sku)
      if (letter && vintage) {
        const key = `${letter}_${vintage}`
        acc[key] = (acc[key] ?? 0) + sm.active_sims
      } else {
        unknownTotal += sm.active_sims
      }
    }
    const rows = Object.entries(acc)
      .map(([key, active_sims]) => {
        const [letter, vintage] = key.split("_") as [string, "13" | "14"]
        const label = vintage === "13"
          ? (CODE_LABELS[letter] ? `${letter} (${vintageLabel(vintage)}) — ${CODE_LABELS[letter]}` : `${letter} (${vintageLabel(vintage)})`)
          : `${letter} (${vintageLabel(vintage)})`
        return { sku: label, active_sims }
      })
      .sort((a, b) => b.active_sims - a.active_sims)
    if (unknownTotal > 0) rows.push({ sku: "Khác (mã dài khác)", active_sims: unknownTotal })
    return rows
  }, [skuMetrics])

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

  // Breakdown Unlimited theo MÃ KÝ TỰ phân loại (s200+4, Hiếu chỉnh lại từ nhóm tốc độ/throttle sang
  // trực tiếp ký tự A/B/C/.../X) — gom skuMetrics (đã lọc Unlimited) theo `typeLetterOfSku()`.
  // ⚠️ Khoá `key` PHẢI kèm vintage (13/14) — dù trong tab Unlimited 1 chữ cái mới (13kt) không trùng chữ
  // Daily/Fixed cũ (khác sku_type nên đã bị lọc khỏi tab này), vẫn tách rõ để hiển thị đúng: mã CŨ 14kt
  // không có bảng CODE_LABELS xác nhận (chỉ verify được P=Unlimited, F/O chưa rõ nghĩa thật) — không tự
  // gán nhãn "kiểu mới" cho nó.
  const speedGroups = useMemo<SpeedGroupMetrics[]>(() => {
    // skuMetricsTab !== activeTab → skuMetrics còn là dữ liệu tab CŨ (fetch tab mới chưa xong) — trả
    // rỗng thay vì tính nhầm trên data sai tab (VD lẫn cả Fixed/Daily khi vừa bấm sang Unlimited).
    if (activeTab !== "Unlimited" || skuMetricsTab !== "Unlimited") return []
    const acc: Record<string, SpeedGroupMetrics> = {}
    for (const sm of skuMetrics) {
      const group   = typeLetterOfSku(sm.sku)
      const vintage = skuVintage(sm.sku)
      if (!group || !vintage) continue   // bỏ SKU không xác định được vị trí ký tự (15/17/18 ký tự)
      const meta = skuMeta[sm.sku]
      const key = variantKeyOf(group, vintage, meta)
      const g = acc[key] ?? (acc[key] = {
        key, speed_group: group, vintage, data: meta?.data ?? null, speed: meta?.speed ?? null,
        label: variantLabelOf(group, meta),
        active_sims: 0, total_plan_gb: 0, total_usage_gb: 0, avg_usage_pct: 0, sim_days: 0, actual_per_day: 0, plan_per_day: 0,
      })
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
    return list.sort((a, b) => a.speed_group === b.speed_group
      ? (a.vintage === b.vintage ? (a.data ?? 0) - (b.data ?? 0) : a.vintage.localeCompare(b.vintage))
      : a.speed_group.localeCompare(b.speed_group))
  }, [activeTab, skuMetrics, skuMeta, skuMetricsTab])

  // Danh sách SKU thuộc từng sub-variant (keyed qua `variantKeyOf()`) — cho nút "Chi tiết" bung ra.
  const speedGroupMembers = useMemo<Record<string, SKUMetrics[]>>(() => {
    if (activeTab !== "Unlimited" || skuMetricsTab !== "Unlimited") return {}
    const acc: Record<string, SKUMetrics[]> = {}
    for (const sm of skuMetrics) {
      const group   = typeLetterOfSku(sm.sku)
      const vintage = skuVintage(sm.sku)
      if (!group || !vintage) continue
      const key = variantKeyOf(group, vintage, skuMeta[sm.sku])
      ;(acc[key] ??= []).push(sm)
    }
    for (const g of Object.keys(acc)) acc[g].sort((a, b) => b.total_usage_gb - a.total_usage_gb)
    return acc
  }, [activeTab, skuMetrics, skuMeta, skuMetricsTab])

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // s202: SKU có độ dài KHÁC 13/14 ký tự (15/17/18kt — `typeLetterOfSku()`/`skuVintage()` trả null, bị
  // `continue` bỏ qua ở speedGroups/speedGroupMembers) trước đây IM LẶNG biến mất khỏi bảng breakdown,
  // làm tổng "Active SIMs" thấp hơn KPI card "Average Usage by SKU Type" (lệch nhỏ, đã phát hiện lúc QA
  // s202 — ~6/2839 SIM kỳ 08/2026). Gom riêng thành 1 dòng "Khác" ở cuối bảng để tổng luôn khớp KPI card,
  // đúng tinh thần "Khác (mã dài khác)" đã áp dụng cho chart `typeLetterChart` phía trên.
  const otherLengthGroup = useMemo(() => {
    if (activeTab !== "Unlimited" || skuMetricsTab !== "Unlimited") return null
    let active_sims = 0, total_plan_gb = 0, total_usage_gb = 0, members: SKUMetrics[] = []
    for (const sm of skuMetrics) {
      if (typeLetterOfSku(sm.sku) && skuVintage(sm.sku)) continue
      active_sims    += sm.active_sims
      total_plan_gb  += sm.total_plan_gb
      total_usage_gb += sm.total_usage_gb
      members.push(sm)
    }
    if (active_sims === 0) return null
    return {
      active_sims, total_plan_gb, total_usage_gb,
      avg_usage_pct: total_plan_gb > 0 ? (total_usage_gb / total_plan_gb) * 100 : 0,
      members: members.sort((a, b) => b.total_usage_gb - a.total_usage_gb),
    }
  }, [activeTab, skuMetrics, skuMetricsTab])
  const [otherLengthExpanded, setOtherLengthExpanded] = useState(false)

  // Tên hiển thị cho chart — NGẮN GỌN (trục X không đủ chỗ cho câu mô tả đầy đủ như bảng breakdown), nhưng
  // vẫn phân biệt được sub-variant (s202: kèm ngưỡng data khi biết) + vintage cũ.
  const sgChartName = (sg: SpeedGroupMetrics) => {
    const base = sg.data != null ? `${sg.speed_group}·${formatDataAmount(sg.data)}` : sg.speed_group
    return sg.vintage === "14" ? `${base} (cũ)` : base
  }

  // Dữ liệu biểu đồ so sánh 3 loại gói: Thực tế (GB/ngày/SIM, trung bình có trọng số) vs Giả định.
  const speedChart = useMemo(() => {
    if (activeTab !== "Unlimited") return []
    return speedGroups.map(sg => {
      const members = speedGroupMembers[sg.key] ?? []
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
      return { name: sgChartName(sg), actual: +actual.toFixed(3), assume: +assume.toFixed(3), usagePct: +sg.avg_usage_pct.toFixed(1) }
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
    const groups = speedGroups.map(sg => sgChartName(sg))
    const rows: Record<string, number | string>[] = USAGE_BUCKETS.map(b => {
      const o: Record<string, number | string> = { range: b.label }
      for (const g of groups) o[g] = 0
      return o
    })
    for (const sg of speedGroups) {
      const gname = sgChartName(sg)
      for (const m of speedGroupMembers[sg.key] ?? []) {
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
    if (activeTab !== "Unlimited" || skuMetricsTab !== "Unlimited") return null
    let usage = 0, simDays = 0
    for (const sm of skuMetrics) {
      const d = daysOfSku(sm.sku)
      if (!d || d <= 0 || sm.active_sims <= 0) continue
      usage += sm.total_usage_gb
      simDays += sm.active_sims * d
    }
    return simDays > 0 ? usage / simDays : null
  }, [activeTab, skuMetrics, skuMetricsTab])

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
  // Loại mã "khung SIM/eSIM profile" (s200+4, Hiếu xác nhận đây không phải gói data thật, bỏ hẳn khỏi
  // báo cáo) — ký tự vị trí 8 = 'K' trên mã 13 ký tự (vd 1D0003DK00000, ~5.235 "SIM" gánh usage bất
  // thường 28k GB dù plan=0 — nghi dữ liệu nguồn 3HK gộp nhầm, xem wiki Gotchas).
  const EXCLUDE_FRAME = "NOT (LENGTH(sku) = 13 AND SUBSTRING(sku, 8, 1) = 'K')"
  // Phân loại Daily/Fixed/Unlimited (s200+3, Hiếu báo mã X bị xếp nhầm Daily dù là Unlimited):
  // mã CHUẨN 13 ký tự có 1 ký tự "Data type" ở VỊ TRÍ 8 (SKU CODE=[VN/US(1)][Type(1)][Country(3)]
  // [Vendor(2)][DataType(1)]...) — verify trực tiếp SQL: A/B/C/D/E/G/H/L/X đều có chữ "Unlimited" trong
  // tên gọi (bảng mapping Hiếu cung cấp) dù nhãn có thể kèm "Daily"/"Fixed" (chỉ nói về chu kỳ reset
  // throttle, KHÔNG phải bản chất Daily/Fixed thật) — cột `sku_type` nguồn 3HK gán SAI cho các mã không
  // có literal "UNL" trong chuỗi (chỉ A/B tình cờ đúng vì amount field cũng ghi "UNL"; C/D/E/G/H/L/X thì
  // không, ví dụ "EAANZ3DX00303"). Mã CŨ 14/15 ký tự giữ nguyên logic literal 'UNL' (đã đúng, tự mô tả
  // rõ ràng bằng chữ "GB"/"UNL" trong chuỗi).
  const SKU_TYPE_CASE = `
    CASE
      WHEN LENGTH(MAX(sku)) = 13 THEN
        CASE SUBSTRING(MAX(sku), 8, 1)
          WHEN 'A' THEN 'Unlimited Data' WHEN 'B' THEN 'Unlimited Data' WHEN 'C' THEN 'Unlimited Data'
          WHEN 'D' THEN 'Unlimited Data' WHEN 'E' THEN 'Unlimited Data' WHEN 'G' THEN 'Unlimited Data'
          WHEN 'H' THEN 'Unlimited Data' WHEN 'L' THEN 'Unlimited Data' WHEN 'X' THEN 'Unlimited Data'
          WHEN 'F' THEN 'Fixed Data' WHEN 'Y' THEN 'Fixed Data'
          WHEN 'P' THEN 'Daily Data' WHEN 'Z' THEN 'Daily Data' WHEN 'T' THEN 'Daily Data'
          ELSE MAX(sku_type)
        END
      WHEN UPPER(MAX(sku)) LIKE '%UNL%' THEN 'Unlimited Data'
      ELSE MAX(sku_type)
    END`
  const bundlesCTE = () => `
    WITH period_records AS (
      SELECT iccid, order_code, sku, sku_type, total_data_gb, data_amount_gb, first_report_date, activation_date
      FROM fact_data_usage
      WHERE ${V3HK}
        AND ${EXCLUDE_FRAME}
        AND first_report_date >= '${startDate}' AND first_report_date <= '${endDate}'
    ),
    bundles AS (
      SELECT iccid, order_code, MAX(sku) AS sku,
             ${SKU_TYPE_CASE} AS sku_type,
             MIN(first_report_date) AS first_report_date, MAX(activation_date) AS activation_date,
             SUM(total_data_gb) AS total_data_gb, MAX(data_amount_gb) AS data_amount_gb, COUNT(*) AS record_count
      FROM period_records GROUP BY iccid, order_code
    )`

  const fetchSKUTypeMetrics = async () => {
    setLoadingType(true)
    const reqId = ++skuTypeMetricsReqIdRef.current
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
      if (reqId !== skuTypeMetricsReqIdRef.current) return
      setSkuTypeMetrics(result.map((r: any) => ({
        sku_type: r.sku_type,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
    } catch (e) {
      if (reqId !== skuTypeMetricsReqIdRef.current) return
      console.error("Error fetching SKU Type metrics:", e); throw e
    } finally {
      if (reqId === skuTypeMetricsReqIdRef.current) setLoadingType(false)
    }
  }

  const fetchSKUMetrics = async () => {
    setLoadingSKU(true)
    const tabAtFetch = activeTab   // chụp lại tab tại lúc gọi — set vào skuMetricsTab sau khi có kết quả
    const reqId = ++skuMetricsReqIdRef.current
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT sku, COUNT(*) as active_sims, SUM(data_amount_gb) as total_plan_gb, SUM(total_data_gb) as total_usage_gb,
          CASE WHEN SUM(data_amount_gb) > 0 THEN (SUM(total_data_gb) / SUM(data_amount_gb)) * 100 ELSE 0 END as avg_usage_pct
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        GROUP BY 1 ORDER BY total_usage_gb DESC
      `
      const result = await runQuery(sql)
      if (reqId !== skuMetricsReqIdRef.current) return   // có request mới hơn đã bắn ra sau — bỏ response cũ này
      setSkuMetrics(result.map((r: any) => ({
        sku: r.sku,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
      setSkuMetricsTab(tabAtFetch)
    } catch (e) {
      if (reqId !== skuMetricsReqIdRef.current) return   // request cũ lỗi sau khi đã có request mới — bỏ qua
      console.error("Error fetching SKU metrics:", e); throw e
    } finally {
      if (reqId === skuMetricsReqIdRef.current) setLoadingSKU(false)
    }
  }

  const fetchTotals = async () => {
    const reqId = ++totalsReqIdRef.current
    try {
      const sql = `
        ${bundlesCTE()}
        SELECT SUM(total_data_gb) as total_usage, SUM(data_amount_gb) as total_capacity,
          CASE WHEN SUM(data_amount_gb) > 0 THEN (SUM(total_data_gb) / SUM(data_amount_gb)) * 100 ELSE 0 END as avg_usage,
          COUNT(*) as total_count
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
      `
      const result = await runQuery(sql)
      if (reqId !== totalsReqIdRef.current) return
      if (result && result[0]) {
        setTotals({
          totalUsage: parseFloat(result[0].total_usage || 0),
          totalCapacity: parseFloat(result[0].total_capacity || 0),
          avgUsage: parseFloat(result[0].avg_usage || 0),
          count: parseInt(result[0].total_count || 0),
        })
      }
    } catch (e) {
      if (reqId !== totalsReqIdRef.current) return
      console.error("Error fetching totals:", e); throw e
    }
  }

  const fetchRecords = async (pageNum: number, isNewSearch: boolean = false) => {
    if (isNewSearch) setLoading(true)
    else setLoadingMore(true)
    const reqId = ++recordsReqIdRef.current

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
      if (reqId !== recordsReqIdRef.current) return
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
      if (reqId !== recordsReqIdRef.current) return
      console.error("Error fetching 3HK data usage:", err)
      setError("Could not load data usage statistics.")
    } finally {
      if (reqId === recordsReqIdRef.current) { setLoading(false); setLoadingMore(false) }
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
        "Tháng": r.first_report_date ? String(r.first_report_date).slice(0, 7) : "",
        "Activation": r.activation_date || "",
        "Records": r.record_count || 0,
        "Kỳ từ": startDate,
        "Kỳ đến": endDate,
      }))
      exportRawRows(rows, `3hk-records-${activeTab}-${startDate}_to_${endDate}`, "Records")
    } catch (err) {
      console.error("Error exporting 3HK records:", err)
    } finally {
      setExportingRecords(false)
    }
  }

  const [exportingMonthly, setExportingMonthly] = useState(false)
  // Export bảng "Average Usage by SKU" theo TỪNG THÁNG trong kỳ đang lọc (Hiếu cần cột tháng để phân biệt +
  // thống kê khi xuất nhiều tháng). Cột y hệt bảng trên UI: SKU · Active SIMs · Total Plan · Total Actual ·
  // GB/ngày/SIM, thêm cột Tháng. Tôn trọng tab Daily/Fixed/Unlimited + ô Search.
  // ⚠️ (iccid, order_code) tính riêng TỪNG tháng có usage → tổng Active SIMs các tháng của 1 SKU có thể lớn
  // hơn số ở bảng UI (bảng đó 1 SIM = 1 lần cho cả kỳ) — đúng thiết kế. Không xuất dòng "Cả kỳ" để pivot
  // theo tháng không bị cộng đôi.
  const exportMonthly = async () => {
    if (exportingMonthly) return
    setExportingMonthly(true)
    try {
      const sql = `
        WITH period_records AS (
          SELECT iccid, order_code, sku, sku_type, total_data_gb, data_amount_gb,
                 to_char(first_report_date::date, 'YYYY-MM') AS ym
          FROM fact_data_usage
          WHERE ${V3HK}
            AND ${EXCLUDE_FRAME}
            AND first_report_date >= '${startDate}' AND first_report_date <= '${endDate}'
        ),
        bundles AS (
          SELECT ym, iccid, order_code, MAX(sku) AS sku,
                 ${SKU_TYPE_CASE} AS sku_type,
                 SUM(total_data_gb) AS total_data_gb, MAX(data_amount_gb) AS data_amount_gb
          FROM period_records GROUP BY ym, iccid, order_code
        )
        SELECT ym, sku, COUNT(*) AS active_sims,
          SUM(data_amount_gb) AS total_plan_gb, SUM(total_data_gb) AS total_usage_gb
        FROM bundles WHERE 1=1 ${tabClause()} ${searchClause()}
        GROUP BY ym, sku
        ORDER BY ym, total_usage_gb DESC
      `
      const result = await runQuery(sql)
      const rows = (Array.isArray(result) ? result : []).map((r: any) => {
        const sims = parseInt(r.active_sims || 0)
        const plan = parseFloat(r.total_plan_gb || 0)
        const usage = parseFloat(r.total_usage_gb || 0)
        const d = daysOfSku(r.sku || "")
        const okDay = d != null && d > 0 && sims > 0
        return {
          "Tháng": r.ym || "",
          "SKU": r.sku || "",
          "Active SIMs": sims,
          "Total Plan (GB)": Number(plan.toFixed(2)),
          "Kế hoạch (GB/ngày/SIM)": okDay ? Number((plan / sims / d!).toFixed(3)) : "",
          "Total Actual (GB)": Number(usage.toFixed(2)),
          "Avg. Usage %": plan > 0 ? Number(((usage / plan) * 100).toFixed(1)) : 0,
          "GB/ngày/SIM": okDay ? Number((usage / sims / d!).toFixed(3)) : "",
        }
      })
      exportRawRows(rows, `3hk-usage-by-sku-month-${activeTab}-${startDate}_to_${endDate}`, "By SKU x Month")
    } catch (err) {
      console.error("Error exporting 3HK monthly:", err)
    } finally {
      setExportingMonthly(false)
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

  // Zone × Month (Hiếu yêu cầu) — nhóm LẠI từ countryRows đã fetch (không query gohub_dw thêm lần nào).
  // Zone A = A1+A2 gộp (ncc_3hk); B/C/D giữ nguyên. Nước không tra được zone (thiếu hẳn trong ncc_3hk, vd
  // "Latvia" — verify SQL không có trong 47 dòng ncc_3hk) rơi vào "Chưa rõ Zone" — hiện riêng, KHÔNG âm
  // thầm bỏ qua, để lộ rõ nếu sau này ncc_3hk thiếu nước mới phát sinh usage.
  const ZONE_ORDER = ["A", "B", "C", "D"]
  // Nhãn hiển thị cho 1 zone key ("A"/"B"/.../"Chưa rõ Zone") — dùng cả cho bảng lẫn export.
  const zoneLabel = (zone: string) => (zone === "Chưa rõ Zone" ? zone : `Zone ${zone}`)

  // Danh sách nước THUỘC từng zone (Hiếu yêu cầu — bấm vào 1 zone phải biết ngay zone đó gồm nước nào),
  // sắp theo TB giảm dần. `country` field của zoneRows dưới GIỮ NGUYÊN zone key thô (không phải "Zone A")
  // để làm key React/lookup — label hiển thị qua `zoneLabel()` tại chỗ render.
  const zoneMembers = useMemo(() => {
    const acc: Record<string, CountryUsageRow[]> = {}
    for (const row of countryRows) {
      const lookup = COUNTRY_ALIAS[row.country] ?? row.country
      const zone = zoneByCountry[lookup] ?? "Chưa rõ Zone"
      ;(acc[zone] ??= []).push(row)
    }
    for (const z of Object.keys(acc)) acc[z].sort((a, b) => b.total - a.total)
    return acc
  }, [countryRows, zoneByCountry])

  const zoneRows = useMemo(() => {
    if (countryRows.length === 0 || Object.keys(zoneByCountry).length === 0) return [] as CountryUsageRow[]
    const latest = countryMonths[countryMonths.length - 1]
    const ordered = [...ZONE_ORDER, ...Object.keys(zoneMembers).filter(z => !ZONE_ORDER.includes(z))]
    return ordered.filter(z => zoneMembers[z]?.length).map(zone => {
      const monthly: Record<string, number> = {}
      for (const m of countryMonths) monthly[m] = zoneMembers[zone].reduce((s, r) => s + (r.monthly[m] ?? 0), 0)
      const total = countryMonths.reduce((s, m) => s + (monthly[m] ?? 0), 0)
      return { country: zone, monthly, total, runRate: (monthly[latest] ?? 0) * 12 }
    })
  }, [countryRows, countryMonths, zoneByCountry, zoneMembers])

  const zoneGrand = useMemo(() => {
    const latest = countryMonths[countryMonths.length - 1]
    const monthly: Record<string, number> = {}
    for (const m of countryMonths) monthly[m] = zoneRows.reduce((s, r) => s + (r.monthly[m] ?? 0), 0)
    const total = zoneRows.reduce((s, r) => s + r.total, 0)
    return { monthly, total, runRate: (monthly[latest] ?? 0) * 12 }
  }, [zoneRows, countryMonths])

  const [expandedZone, setExpandedZone] = useState<string | null>(null)

  // Export: giữ mỗi zone 1 dòng (mức tổng hợp) + LIỆT KÊ luôn từng nước bên dưới (thụt lề bằng prefix
  // "  · ") — đúng yêu cầu "biết zone nào có nước nào" ngay cả khi mở file ngoài web, không chỉ trên UI.
  const exportZoneCsv = () => {
    if (zoneRows.length === 0) return
    const header = ["Zone / Country", ...countryMonths.map(m => monthLabel(m, countryMultiYear)), "Total", "Run-rate 12M"]
    const num = (n: number) => Number((n || 0).toFixed(2))
    const rows: (string | number)[][] = []
    for (const r of zoneRows) {
      rows.push([zoneLabel(r.country), ...countryMonths.map(m => num(r.monthly[m] ?? 0)), num(r.total), num(r.runRate)])
      for (const c of zoneMembers[r.country] ?? []) {
        rows.push([`  · ${c.country}`, ...countryMonths.map(m => num(c.monthly[m] ?? 0)), num(c.total), num(c.runRate)])
      }
    }
    rows.push(["TỔNG 4 ZONE", ...countryMonths.map(m => num(zoneGrand.monthly[m] ?? 0)), num(zoneGrand.total), num(zoneGrand.runRate)])
    exportAOA(header, rows, `3hk-usage-by-zone-${new Date().toISOString().slice(0, 10)}`, "By Zone")
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
          {maxAvailableDate && (() => {
            const [y, m, d] = maxAvailableDate.split("-")
            const daysStale = Math.floor((Date.now() - Date.UTC(+y, +m - 1, +d)) / 86400000)
            return (
              <p className={cn("text-xs mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium",
                daysStale > 45 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>
                Dữ liệu 3HK mới nhất: <b>{d}/{m}/{y}</b> — nguồn 3HK cập nhật theo đợt (không phải hàng
                ngày), có thể trễ vài tuần đến vài tháng so với hôm nay. Thiếu tháng gần đây KHÔNG phải bug web.
              </p>
            )
          })()}
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
                {unlimitedGbPerDaySim != null ? `${fmtDec(unlimitedGbPerDaySim, 2)} GB` : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">Data high-speed dùng/ngày/SIM (gói unlimited)</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-900">{fmtDec(totals.avgUsage, 1)}%</p>
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
          <p className="text-2xl font-bold text-slate-900">{formatNumber(totals.count)}</p>
          <p className="text-xs text-slate-500 mt-1">Sim tracks in this period</p>
        </div>
      </div>

      {/* Data Usage by Zone × Month (TB) — Zone A(=A1+A2)/B/C/D theo Supabase ncc_3hk, tổng lại từ
          countryRows (không query gohub_dw thêm lần nào). Bấm 1 zone → xổ danh sách nước thuộc zone đó
          (Hiếu yêu cầu — thay hẳn bảng riêng theo nước, đã bỏ, xem git log nếu cần khôi phục). */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-600" />
              Data Usage by Zone × Month (TB)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Nhóm theo <code className="text-slate-600">ncc_3hk.zone</code> (Zone A = A1+A2 gộp)
              {countryMonths.length > 0 && (
                <> · Tháng {monthLabel(countryMonths[0], countryMultiYear)} – {monthLabel(countryMonths[countryMonths.length - 1], countryMultiYear)}</>
              )} · Bấm 1 zone để xem breakdown theo nước.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {countryMonths.length > 0 && (
              <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5 whitespace-nowrap">
                RUN-RATE 12M = {monthLabel(countryMonths[countryMonths.length - 1], countryMultiYear)} × 12 = {fmtTB(zoneGrand.runRate)} TB
              </span>
            )}
            <button onClick={exportZoneCsv} disabled={zoneRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        {loadingCountry ? (
          <div className="p-8 text-center text-sm text-slate-400">Đang tải dữ liệu theo zone…</div>
        ) : countryError ? (
          <div className="p-8 text-center text-sm text-rose-500">{countryError}</div>
        ) : zoneRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Không có dữ liệu usage theo zone.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="sticky left-0 z-10 bg-slate-700 px-3 py-2.5 text-left font-bold text-xs uppercase tracking-wider">Zone</th>
                  {countryMonths.map((m) => (
                    <th key={m} className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider whitespace-nowrap">{monthLabel(m, countryMultiYear)}</th>
                  ))}
                  <th className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider bg-slate-800 whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider bg-brand-700 whitespace-nowrap">Run-rate 12M</th>
                </tr>
              </thead>
              <tbody>
                {zoneRows.map((row) => {
                  const expanded = expandedZone === row.country
                  const members = zoneMembers[row.country] ?? []
                  return (
                  <React.Fragment key={row.country}>
                    <tr onClick={() => setExpandedZone(expanded ? null : row.country)}
                      className={cn("border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer", row.country === "Chưa rõ Zone" && "text-slate-500 italic")}>
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                          {zoneLabel(row.country)}
                          <span className="text-[10px] font-normal text-slate-400">({members.length} nước)</span>
                        </span>
                      </td>
                      {countryMonths.map((m) => (
                        <td key={m} className="px-3 py-2 tabular-nums text-slate-600">{fmtTB(row.monthly[m] ?? 0)}</td>
                      ))}
                      <td className="px-3 py-2 tabular-nums font-bold text-slate-900 bg-slate-50">{fmtTB(row.total)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-brand-700 bg-brand-50/60">{fmtTB(row.runRate)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={countryMonths.length + 3} className="p-0">
                          <table className="w-full text-right border-collapse text-xs">
                            <tbody>
                              {members.map((c) => (
                                <tr key={c.country} className="border-b border-slate-100/70 hover:bg-white/70">
                                  <td className="sticky left-0 z-10 bg-slate-50/60 px-3 py-1.5 pl-9 text-left font-medium text-slate-600 whitespace-nowrap">{c.country}</td>
                                  {countryMonths.map((m) => (
                                    <td key={m} className="px-3 py-1.5 tabular-nums text-slate-500">{fmtTB(c.monthly[m] ?? 0)}</td>
                                  ))}
                                  <td className="px-3 py-1.5 tabular-nums font-semibold text-slate-700 bg-slate-100/60">{fmtTB(c.total)}</td>
                                  <td className="px-3 py-1.5 tabular-nums font-medium text-brand-600 bg-brand-50/40">{fmtTB(c.runRate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  )
                })}
                <tr className="bg-amber-50 border-t-2 border-amber-200 font-bold text-slate-900">
                  <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2.5 text-left uppercase text-xs tracking-wider">Tổng 4 Zone</td>
                  {countryMonths.map((m) => (
                    <td key={m} className="px-3 py-2.5 tabular-nums">{fmtTB(zoneGrand.monthly[m] ?? 0)}</td>
                  ))}
                  <td className="px-3 py-2.5 tabular-nums bg-amber-100">{fmtTB(zoneGrand.total)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-brand-800 bg-brand-100/70">{fmtTB(zoneGrand.runRate)}</td>
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
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{formatNumber(sm.active_sims)}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                        {fmtDec(sm.avg_usage_pct, 1)}%
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

      {/* Unlimited Breakdown theo MÃ ký tự phân loại (s200+4) — chỉ tab Unlimited */}
      {activeTab === "Unlimited" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Unlimited — Breakdown theo mã
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Gom theo gói THẬT (ký tự phân loại SKU + ngưỡng data/tốc độ tra từ Supabase `skus.data`/`skus.speed`) — cùng 1 mã (VD B) có thể tách thành nhiều dòng nếu là gói khác nhau (VD 500MB vs 1GB trước khi giảm tốc).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mã</th>
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
                    const expanded = expandedGroup === sg.key
                    const members = speedGroupMembers[sg.key] ?? []
                    const isNew = sg.vintage === "13"
                    return (
                    <React.Fragment key={idx}>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 text-xs font-mono" title="Ký tự phân loại trên SKU">
                            {sg.speed_group}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", isNew ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                            {vintageLabel(sg.vintage)}
                          </span>
                          {sg.data == null && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500" title="Không tra được data/speed từ Supabase (SKU có thể đã ngừng bán) — đang hiện nhãn ước lượng theo mã">
                              chưa rõ gói cụ thể
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-normal text-[13px] text-slate-700">{sg.label}</div>
                      </td>
                      <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{formatNumber(sg.active_sims)}</td>
                      <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sg.total_plan_gb)}</td>
                      <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sg.total_usage_gb)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("text-sm font-bold", sg.actual_per_day > sg.plan_per_day ? "text-rose-600" : "text-emerald-600")} title={`Kế hoạch ${fmtDec(sg.plan_per_day, 2)} GB/ngày/SIM`}>
                          {fmtDec(sg.actual_per_day, 2)} GB
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("text-sm font-bold", sg.avg_usage_pct > 100 ? "text-rose-600" : sg.avg_usage_pct > 80 ? "text-amber-600" : "text-emerald-600")}>
                          {fmtDec(sg.avg_usage_pct, 1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={cn("h-1.5 rounded-full", sg.avg_usage_pct > 80 ? "bg-rose-500" : sg.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${Math.min(100, sg.avg_usage_pct)}%` }} />
                          </div>
                          <button onClick={() => setExpandedGroup(expanded ? null : sg.key)}
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
                                    <td className="px-4 py-2 text-center text-slate-600 text-xs font-medium">{formatNumber(m.active_sims)}</td>
                                    <td className="px-4 py-2 text-right text-slate-600 text-xs">{formatNumber(m.total_plan_gb)}</td>
                                    <td className="px-4 py-2 text-right text-slate-500 text-xs">
                                      {planPerDay == null ? "—" : `${fmtDec(planPerDay, 2)} GB`}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-900 text-xs">{formatNumber(m.total_usage_gb)}</td>
                                    <td className="px-4 py-2 text-right text-xs font-bold text-slate-700">{fmtDec(m.avg_usage_pct, 1)}%</td>
                                    <td className={cn("px-4 py-2 text-right text-xs font-bold", gbPerDaySim == null ? "text-slate-300" : over ? "text-rose-600" : "text-emerald-600")}>
                                      {gbPerDaySim == null ? "—" : `${fmtDec(gbPerDaySim, 2)} GB`}
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
                {!loadingSKU && otherLengthGroup && (
                  <React.Fragment>
                  <tr className="hover:bg-slate-50/50 transition-colors bg-slate-50/30">
                    <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md border border-slate-200 text-xs font-mono">?</span>
                      <div className="mt-0.5 font-normal text-[13px] text-slate-500" title="SKU có độ dài khác 13/14 ký tự (15/17/18kt) — chưa xác định được vị trí ký tự phân loại, gộp riêng để tổng khớp KPI card phía trên">
                        Mã dài khác (chưa xác định được vị trí ký tự)
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{formatNumber(otherLengthGroup.active_sims)}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(otherLengthGroup.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(otherLengthGroup.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right text-slate-400 text-sm">—</td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-sm font-bold text-slate-500">{fmtDec(otherLengthGroup.avg_usage_pct, 1)}%</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setOtherLengthExpanded(v => !v)}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                          Chi tiết ({otherLengthGroup.members.length})
                          {otherLengthExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {otherLengthExpanded && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/60">
                                <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">SKU</th>
                                <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Active SIMs</th>
                                <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Plan (GB)</th>
                                <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Actual (GB)</th>
                                <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Avg. Usage %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {otherLengthGroup.members.map((m, j) => (
                                <tr key={j} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{m.sku}</td>
                                  <td className="px-4 py-2 text-center text-slate-600 text-xs font-medium">{formatNumber(m.active_sims)}</td>
                                  <td className="px-4 py-2 text-right text-slate-600 text-xs">{formatNumber(m.total_plan_gb)}</td>
                                  <td className="px-4 py-2 text-right font-bold text-slate-900 text-xs">{formatNumber(m.total_usage_gb)}</td>
                                  <td className="px-4 py-2 text-right text-xs font-bold text-slate-700">{fmtDec(m.avg_usage_pct, 1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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
              So sánh mức sử dụng theo mã — Thực tế (GB/ngày/SIM) vs Kế hoạch
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Cột Thực tế <span className="text-rose-600 font-semibold">đỏ</span> = vượt mức 3HK cấp/ngày của mã (chi phí datapool cao hơn dự kiến), <span className="text-emerald-600 font-semibold">xanh</span> = trong kế hoạch. Cột xám = mức kế hoạch/ngày (data_amount_gb ÷ ngày).</p>
          </div>
          <div className="p-4" style={{ height: 320 }}>
            <SpeedComparisonChart data={speedChart} />
          </div>
        </div>
      )}

      {/* Biểu đồ phân bố mức data dùng/ngày/SIM của các gói Unlimited (chỉ tab Unlimited) */}
      {activeTab === "Unlimited" && usageDist.groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Phân bố mức data sử dụng/ngày — theo mã gói Unlimited
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Trục X = dải GB dùng/ngày/SIM, trục Y = số SIM (Active). Cột chồng theo mã (A/B/C/.../X).</p>
          </div>
          <div className="p-4" style={{ height: 340 }}>
            <UsageDistChart rows={usageDist.rows} groups={usageDist.groups} />
          </div>
        </div>
      )}

      {/* Chart mã loại gói (ký tự phân loại vị trí 8/10) chiếm bao nhiêu SIM (s200+4, Hiếu yêu cầu) */}
      {typeLetterChart.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-600" />
              Mã loại gói chiếm bao nhiêu SIM
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Số lượng SIM (Active) theo ký tự phân loại — vị trí 8 (mã 13 ký tự) hoặc vị trí 10 (mã 14 ký tự) trong kỳ đang xem.</p>
          </div>
          <div className="p-4" style={{ height: Math.max(260, typeLetterChart.length * 30) }}>
            <SkuCountChart data={typeLetterChart} />
          </div>
        </div>
      )}

      {/* SKU Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-brand-600" />
            Average Usage by SKU
          </h2>
          <button onClick={exportMonthly} disabled={exportingMonthly || !startDate || !endDate}
            title="Xuất bảng SKU theo từng tháng trong kỳ đang lọc: Tháng · SKU · Active SIMs · Total Plan · Kế hoạch/ngày/SIM · Total Actual · Avg. Usage % · GB/ngày/SIM"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all">
            <Download className="w-3.5 h-3.5" /> {exportingMonthly ? "Exporting..." : "Export theo tháng"}
          </button>
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
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{formatNumber(sm.active_sims)}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      {activeTab === "Unlimited" ? (() => {
                        const g = gbPerDaySimOfSku(sm)
                        return <span className="text-sm font-bold text-slate-700">{g != null ? `${fmtDec(g, 2)} GB` : "—"}</span>
                      })() : (
                        <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                          {fmtDec(sm.avg_usage_pct, 1)}%
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
                    <td className="px-6 py-4 text-right font-medium text-slate-600 text-sm">{fmtDec(record.data_amount_gb, 2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm">{fmtDec(record.total_data_gb, 2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", record.usage_pct > 90 ? "bg-rose-500" : record.usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, record.usage_pct)}%` }} />
                        </div>
                        <span className={cn("text-xs font-bold min-w-[40px] text-right", record.usage_pct > 90 ? "text-rose-600" : record.usage_pct > 70 ? "text-amber-600" : "text-emerald-600")}>
                          {fmtDec(record.usage_pct, 1)}%
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
            Showing <span className="text-slate-900">{Math.min((page - 1) * pageSize + 1, totals.count)}</span> to <span className="text-slate-900">{Math.min(page * pageSize, totals.count)}</span> of <span className="text-slate-900">{formatNumber(totals.count)}</span> records
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
