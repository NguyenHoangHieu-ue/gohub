"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Search, ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react"
import type { AppSetting } from "./admin-types"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

interface WMProduct {
  vendor_product_id:    string
  product_name:         string | null
  region:               string | null
  sim_type:             string | null
  days:                 number | null
  data_gb:              number | null
  is_daily:             boolean
  is_unlimited:         boolean
  throttle_kbps:        number | null
  cogs:                 number | null
  cogs_currency:        string | null
  // APN fields
  apn:                  string | null
  apn_network_type:     string | null
  apn_roaming_carrier:  string | null
  apn_telecom_providers:string | null
}

const DEFAULT_CONFIG = {
  supportCountryCode: "",
  isoCodes:           "",
  vendorCode:         "WM",
  countryNameVn:      "",
  countryNameEn:      "",
  purchaseType_US:    "D",
  purchaseType_VN:    "3",
  productType:        "C",
  dataPolicyCode:     "P",
  operatorCode:       "WORLDMOVE",
  purchaseMethod:     "API Purchase",
  skuType:            "Base + Datapack",
  importType:         "Official",
  typeOfSim:          "eSIM",
  networkType:        "",
  apn:                "",
  onsiteCarrier:      "",
  kycNeeded:          "No",
  kycCode:            1,
  hotspot:            "Yes",
  dailyResetTime:     "",
  activationTime:     "",
  expirationDays:     90,
  call:               "No",
  cogsDescription:    "",
  cogsFormula:        "",
}

// ─── Client-side compute helpers (mirror API logic) ────────────────────────

function _zeroPad(n: number, len: number) { return String(Math.round(n)).padStart(len, "0") }
function _roundUp(val: number, dec: number) { const f = 10 ** dec; return Math.ceil(val * f) / f }

function _dataAmountCode(data_gb: number | null, is_unlimited: boolean): string {
  if (is_unlimited || data_gb == null) return "UNL"
  if (data_gb >= 1) return _zeroPad(Math.round(data_gb), 3)
  return _zeroPad(Math.round(data_gb * 1000), 3)
}

function _skuSuffix(p: WMProduct): string {
  return _dataAmountCode(p.data_gb, p.is_unlimited) + _zeroPad(p.days ?? 0, 2)
}

function _buildPC(pt: string, cfg: typeof DEFAULT_CONFIG): string {
  return pt + cfg.productType + cfg.supportCountryCode + cfg.vendorCode + cfg.dataPolicyCode
}

function _fmtThrottle(kbps: number | null): string {
  if (kbps == null) return ""
  if (kbps >= 1000) return `${kbps / 1000} Mbps`
  return `${kbps} kbps`
}

function _fmtData(p: WMProduct): string {
  if (p.is_unlimited) return "Unlimited"
  if (p.data_gb == null) return ""
  if (p.data_gb < 1) return `${Math.round(p.data_gb * 1000)}MB`
  return `${p.data_gb}GB`
}

function _nameVn(p: WMProduct, cfg: typeof DEFAULT_CONFIG): string {
  const d = _zeroPad(p.days ?? 0, 2)
  return `${cfg.typeOfSim} ${cfg.countryNameVn} ${p.is_unlimited ? "Unlimited" : _fmtData(p)} ${d} Ngày`
}

function _nameEn(p: WMProduct, cfg: typeof DEFAULT_CONFIG): string {
  const d = _zeroPad(p.days ?? 0, 2)
  const dl = `${d} Day${(p.days ?? 1) !== 1 ? "s" : ""}`
  return `${cfg.typeOfSim} ${cfg.countryNameEn} ${p.is_unlimited ? "Unlimited" : _fmtData(p)} ${dl}`
}

function _deriveDataPolicy(p: WMProduct): string {
  if (p.is_unlimited) {
    if (!p.throttle_kbps) return "D"
    if (p.throttle_kbps >= 10000) return "A"
    if (p.throttle_kbps >= 5000)  return "B"
    return "P"
  }
  return p.is_daily ? "P" : "F"
}

interface PreviewRow {
  sku:        string
  name_vn:    string
  name_en:    string
  cogs:       string
  currency:   string
  throttle:   string
  days:       number | null
  data:       string
  vendor_sku: string
}

function fmtWMData(p: WMProduct): string {
  if (p.is_unlimited) return "UNL/Day"
  if (p.data_gb == null) return "—"
  if (p.data_gb < 1) return `${Math.round(p.data_gb * 1000)}MB${p.is_daily ? "/day" : ""}`
  return `${p.data_gb}GB${p.is_daily ? "/day" : ""}`
}

// ─── 3HK types & helpers ──────────────────────────────────────────────────────

interface ThreeHKZone {
  zone:             string
  country:          string
  network?:         string
  price_per_gb_hkd: number
  is_kyc?:          boolean
}

interface ZoneGroup {
  zone:        string
  countries:   string[]
  price_per_gb: number
}

interface ThreeHKCombo {
  combo_type:       "daily" | "fixed" | "unlimited"
  data_gb:          number | null
  days:             number
  throttle_mbps:    number | null
  data_policy_code: string
  vendor_sku:       string
  cogs_usd:         number
  cogs_vnd:         number
}

const DAILY_DATA_OPTIONS = [1, 2, 3]
const FIXED_DATA_OPTIONS = [5, 10, 20]
const DAY_OPTIONS        = [3, 5, 7, 10, 15, 30]

function get3HKDataPolicyCode(
  combo_type: "daily" | "fixed" | "unlimited",
  throttle_mbps: number | null
): string {
  if (combo_type === "fixed")     return "F"
  if (combo_type === "daily")     return "P"
  if (combo_type === "unlimited") return throttle_mbps === 10 ? "B" : "A"
  return "P"
}

function compute3HKCogs(
  combo_type:       "daily" | "fixed" | "unlimited",
  data_gb:          number | null,
  days:             number,
  throttle_mbps:    number | null,
  price_per_gb_hkd: number,
  fx_hkd_usd:       number,
  fx_usd_vnd:       number
): { cogs_usd: number; cogs_vnd: number } {
  let cogs_hkd: number
  if (combo_type === "fixed") {
    cogs_hkd = (data_gb ?? 0) * price_per_gb_hkd * 0.55
  } else if (combo_type === "daily") {
    cogs_hkd = (data_gb ?? 0) * days * price_per_gb_hkd * 0.40
  } else {
    const daily_util = throttle_mbps === 10 ? 1.8 : 1.6
    cogs_hkd = daily_util * days * price_per_gb_hkd * 0.40
  }
  const cogs_usd = Math.ceil(cogs_hkd * fx_hkd_usd * 100) / 100
  const cogs_vnd = Math.ceil(cogs_usd * fx_usd_vnd)
  return { cogs_usd, cogs_vnd }
}

// ─────────────────────────────────────────────────────────────────────────────

const WM_PAGE_SIZE = 50

export default function TemplateTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [subTab, setSubTab]         = useState<"create" | "customize">("create")
  const [selectedNCC, setSelectedNCC] = useState("WM")
  const [config, setConfig]         = useState(DEFAULT_CONFIG)
  const [products, setProducts]     = useState<WMProduct[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loadingP, setLoadingP]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [selObjs, setSelObjs]       = useState<Map<string, WMProduct>>(new Map())
  const [searchQ, setSearchQ]       = useState("")
  const [filterSim, setFilterSim]   = useState("")
  const [filterUnlim, setFilterUnlim] = useState("")
  const [fxSettings, setFxSettings] = useState({ fx_usd_vnd: 26394, fx_twd_usd: 0.03165, fx_hkd_usd: 0.1282 })
  const [previewRows, setPreviewRows] = useState<{ us: PreviewRow[]; vn: PreviewRow[]; pcUS: string; pcVN: string } | null>(null)
  const [previewTab, setPreviewTab]   = useState<"us" | "vn" | "prod">("us")
  const previewRef = useRef<HTMLDivElement>(null)

  // 3HK state
  const [zoneGroups,       setZoneGroups]       = useState<ZoneGroup[]>([])
  const [loadingZones,     setLoadingZones]      = useState(false)
  const [selectedZone,     setSelectedZone]      = useState<ZoneGroup | null>(null)
  const [dailyGB,          setDailyGB]           = useState<Set<number>>(new Set([1, 2, 3]))
  const [fixedGB,          setFixedGB]           = useState<Set<number>>(new Set([5, 10, 20]))
  const [unlimitedEnabled, setUnlimitedEnabled]  = useState(true)
  const [selectedDays,     setSelectedDays]      = useState<Set<number>>(new Set([3, 5, 7, 10, 15, 30]))
  const [unlimThrottle,    setUnlimThrottle]     = useState<10 | 5>(5)
  const [includeSIM,       setIncludeSIM]        = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        const rows: AppSetting[] = d.settings ?? []
        const usd_vnd = rows.find(s => s.key === "fx.usd_vnd")
        const twd_usd = rows.find(s => s.key === "fx.twd_usd")
        const hkd_usd = rows.find(s => s.key === "fx.hkd_usd")
        setFxSettings({
          fx_usd_vnd: usd_vnd ? parseFloat(usd_vnd.value) : 26394,
          fx_twd_usd: twd_usd ? parseFloat(twd_usd.value) : 0.03165,
          fx_hkd_usd: hkd_usd ? parseFloat(hkd_usd.value) : 0.1282,
        })
      })
  }, [])

  const fetchProducts = useCallback(async (pg: number) => {
    setLoadingP(true)
    // Tạo mới: mặc định chỉ show sản phẩm chưa có trong hệ thống
    const params = new URLSearchParams({ page: String(pg), gap: "not_in_system" })
    if (searchQ)      params.set("search",       searchQ)
    if (filterSim)    params.set("sim_type",      filterSim)
    if (filterUnlim)  params.set("data_type", filterUnlim)
    const res = await fetch(`/api/ncc/worldmove?${params}`)
    const d   = await res.json()
    setProducts(d.data ?? [])
    setTotal(d.total ?? 0)
    setLoadingP(false)
  }, [searchQ, filterSim, filterUnlim])

  useEffect(() => { fetchProducts(page) }, [page]) // eslint-disable-line

  // Fetch 3HK zones khi switch sang 3H
  useEffect(() => {
    if (selectedNCC !== "3H" || zoneGroups.length > 0) return
    setLoadingZones(true)
    fetch("/api/ncc/3hk-zones")
      .then(r => r.json())
      .then(d => {
        const raw: ThreeHKZone[] = d.data ?? []
        const map = new Map<string, ZoneGroup>()
        for (const z of raw) {
          if (!map.has(z.zone))
            map.set(z.zone, { zone: z.zone, countries: [], price_per_gb: z.price_per_gb_hkd })
          map.get(z.zone)!.countries.push(z.country)
        }
        setZoneGroups(Array.from(map.values()))
      })
      .catch(() => {})
      .finally(() => setLoadingZones(false))
  }, [selectedNCC]) // eslint-disable-line

  const doSearch = () => { setPage(1); fetchProducts(1) }

  const toggleSelect = (p: WMProduct) => {
    const id = p.vendor_product_id
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    setSelObjs(prev => { const m = new Map(prev); m.has(id) ? m.delete(id) : m.set(id, p); return m })
  }
  const selectAll = () => {
    setSelected(prev => { const s = new Set(prev); products.forEach(p => s.add(p.vendor_product_id)); return s })
    setSelObjs(prev => { const m = new Map(prev); products.forEach(p => m.set(p.vendor_product_id, p)); return m })
  }
  const clearAll  = () => { setSelected(new Set()); setSelObjs(new Map()) }

  const setC = (k: keyof typeof DEFAULT_CONFIG, v: string | number) =>
    setConfig(prev => ({ ...prev, [k]: v }))

  function autoFill() {
    const prods = [...selObjs.values()]
    if (!prods.length) { onNotify("error", "Chưa chọn sản phẩm"); return }
    const f = prods[0]
    setConfig(prev => ({
      ...prev,
      typeOfSim:      f.sim_type      ?? prev.typeOfSim,
      operatorCode:   "WORLDMOVE",
      networkType:    f.apn_network_type     ?? prev.networkType,
      apn:            f.apn                  ?? prev.apn,
      onsiteCarrier:  f.apn_telecom_providers?.split("\n")[0].trim() ?? f.apn_roaming_carrier ?? prev.onsiteCarrier,
      dataPolicyCode: _deriveDataPolicy(f),
    }))
    onNotify("success", "Đã auto-fill từ sản phẩm đã chọn")
  }

  function buildPreview() {
    if (selObjs.size === 0) { onNotify("error", "Chưa chọn sản phẩm"); return }
    if (!config.supportCountryCode) { onNotify("error", "Nhập Support Country Code (3 ký tự)"); return }
    if (!config.purchaseType_US)    { onNotify("error", "Nhập Purchase Type US"); return }
    if (!config.purchaseType_VN)    { onNotify("error", "Nhập Purchase Type VN"); return }

    const sorted = [...selObjs.values()].sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    const pcUS   = _buildPC(config.purchaseType_US, config)
    const pcVN   = _buildPC(config.purchaseType_VN, config)
    const { fx_twd_usd, fx_usd_vnd } = fxSettings

    const us: PreviewRow[] = sorted.map(p => {
      const cogsUSD = p.cogs != null ? _roundUp(p.cogs * fx_twd_usd, 2) : null
      return {
        sku:        pcUS + _skuSuffix(p),
        name_vn:    _nameVn(p, config),
        name_en:    _nameEn(p, config),
        cogs:       cogsUSD != null ? cogsUSD.toLocaleString() : "—",
        currency:   "USD",
        throttle:   _fmtThrottle(p.throttle_kbps),
        days:       p.days,
        data:       _fmtData(p),
        vendor_sku: p.vendor_product_id,
      }
    })

    const vn: PreviewRow[] = sorted.map(p => {
      const cogsUSD = p.cogs != null ? _roundUp(p.cogs * fx_twd_usd, 2) : null
      const cogsVND = cogsUSD != null ? _roundUp(cogsUSD * fx_usd_vnd, 0) : null
      return {
        sku:        pcVN + _skuSuffix(p),
        name_vn:    _nameVn(p, config),
        name_en:    _nameEn(p, config),
        cogs:       cogsVND != null ? cogsVND.toLocaleString() : "—",
        currency:   "VND",
        throttle:   _fmtThrottle(p.throttle_kbps),
        days:       p.days,
        data:       _fmtData(p),
        vendor_sku: pcUS + _skuSuffix(p),
      }
    })

    setPreviewRows({ us, vn, pcUS, pcVN })
    setPreviewTab("us")
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  // ─── 3HK helpers ──────────────────────────────────────────────────────────

  function build3HKCombos(): ThreeHKCombo[] {
    if (!selectedZone) return []
    const { fx_hkd_usd, fx_usd_vnd } = fxSettings
    const sortedDays = Array.from(selectedDays).sort((a, b) => a - b)
    const combos: ThreeHKCombo[] = []

    for (const gb of Array.from(dailyGB).sort((a, b) => a - b)) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("daily", null)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("daily", gb, d, null, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "daily", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-D${gb}GB-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    for (const gb of Array.from(fixedGB).sort((a, b) => a - b)) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("fixed", null)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("fixed", gb, d, null, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "fixed", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-F${gb}GB-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    if (unlimitedEnabled) {
      for (const d of sortedDays) {
        const dp = get3HKDataPolicyCode("unlimited", unlimThrottle)
        const { cogs_usd, cogs_vnd } = compute3HKCogs("unlimited", null, d, unlimThrottle, selectedZone.price_per_gb, fx_hkd_usd, fx_usd_vnd)
        combos.push({ combo_type: "unlimited", data_gb: null, days: d, throttle_mbps: unlimThrottle, data_policy_code: dp, vendor_sku: `3HK-${selectedZone.zone}-UNL${unlimThrottle}M-${d}D`, cogs_usd, cogs_vnd })
      }
    }
    return combos
  }

  function build3HKPreview() {
    if (!selectedZone)              { onNotify("error", "Chưa chọn zone"); return }
    if (!config.supportCountryCode) { onNotify("error", "Nhập Country Code (3 ký tự)"); return }
    if (dailyGB.size === 0 && fixedGB.size === 0 && !unlimitedEnabled) { onNotify("error", "Chưa chọn loại data"); return }
    if (selectedDays.size === 0)    { onNotify("error", "Chưa chọn số ngày"); return }

    const combos = build3HKCombos()
    const typeOfSim = config.typeOfSim || "eSIM"
    const vnName = config.countryNameVn
    const enName = config.countryNameEn

    const toRow = (c: ThreeHKCombo, tenant: "US" | "VN"): PreviewRow => {
      const pc = (tenant === "US" ? config.purchaseType_US : config.purchaseType_VN)
        + config.productType + config.supportCountryCode + "3D" + c.data_policy_code
      const suffix = _dataAmountCode(c.data_gb, c.combo_type === "unlimited") + _zeroPad(c.days, 2)
      const dStr   = _zeroPad(c.days, 2)
      const nameVn = c.combo_type === "unlimited" ? `${typeOfSim} ${vnName} Unlimited ${dStr} Ngày`
                   : c.combo_type === "daily"     ? `${typeOfSim} ${vnName} ${c.data_gb}GB/Ngày ${dStr} Ngày`
                   :                                `${typeOfSim} ${vnName} ${c.data_gb}GB ${dStr} Ngày`
      const nameEn = c.combo_type === "unlimited" ? `${typeOfSim} ${enName} Unlimited ${dStr} Days`
                   : c.combo_type === "daily"     ? `${typeOfSim} ${enName} ${c.data_gb}GB/Day ${dStr} Days`
                   :                                `${typeOfSim} ${enName} ${c.data_gb}GB ${dStr} Days`
      const pcUS = config.purchaseType_US + config.productType + config.supportCountryCode + "3D" + c.data_policy_code
      return {
        sku:        pc + suffix,
        name_vn:    nameVn,
        name_en:    nameEn,
        cogs:       tenant === "US" ? c.cogs_usd.toLocaleString() : c.cogs_vnd.toLocaleString(),
        currency:   tenant === "US" ? "USD" : "VND",
        throttle:   c.throttle_mbps ? `${c.throttle_mbps} Mbps` : "",
        days:       c.days,
        data:       c.combo_type === "unlimited" ? "UNL" : c.combo_type === "daily" ? `${c.data_gb}GB/ngày` : `${c.data_gb}GB`,
        vendor_sku: tenant === "VN" ? pcUS + suffix : c.vendor_sku,
      }
    }

    setPreviewRows({
      us:  combos.map(c => toRow(c, "US")),
      vn:  combos.map(c => toRow(c, "VN")),
      pcUS: `${config.purchaseType_US}${config.productType}${config.supportCountryCode}3D[F/P/A/B]`,
      pcVN: `${config.purchaseType_VN}${config.productType}${config.supportCountryCode}3D[F/P/A/B]`,
    })
    setPreviewTab("us")
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  // ──────────────────────────────────────────────────────────────────────────

  async function downloadExcel() {
    setGenerating(true)
    try {
      let body: object
      let successMsg: string

      if (selectedNCC === "3H") {
        const combos = build3HKCombos()
        if (!combos.length) { onNotify("error", "Chưa có combo để tải"); setGenerating(false); return }
        body = {
          vendor:          "3HK",
          threeHKProducts: combos,
          config:          { ...config, vendorCode: "3D", operatorCode: "3HK" },
          settings:        fxSettings,
          includeSIM,
        }
        successMsg = `Đã tải template 3HK ${combos.length} combo`
      } else {
        if (selObjs.size === 0) { onNotify("error", "Chưa có sản phẩm để tải"); setGenerating(false); return }
        body = {
          vendor:   "WM",
          products: [...selObjs.values()],
          config:   { ...config },
          settings: fxSettings,
        }
        successMsg = `Đã tải template ${selObjs.size} sản phẩm`
      }

      const res = await fetch("/api/admin/template", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        onNotify("error", err.error ?? "Hiếu đang fix, vui lòng đợi")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `template_${selectedNCC}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onNotify("success", successMsg)
    } catch {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    } finally {
      setGenerating(false)
    }
  }

  const totalPages = Math.ceil(total / WM_PAGE_SIZE)

  return (
    <div className="space-y-5">

      {/* ─── Sub-tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([["create", "Tạo mới"], ["customize", "Tùy chỉnh template"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              subTab === key ? "bg-white text-gray-900 dark:text-slate-100 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:text-slate-200"
            }`}>{label}</button>
        ))}
      </div>

      {/* ─── Tùy chỉnh template (placeholder) ─────────────────────── */}
      {subTab === "customize" && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center space-y-2">
          <p className="text-gray-500 font-medium">Tùy chỉnh cấu trúc template</p>
          <p className="text-sm text-gray-400">Tính năng đang phát triển — cho phép chỉnh sửa format cột, tên sheet, công thức giá trong file Excel xuất ra.</p>
        </div>
      )}

      {subTab === "create" && <>

      {/* ─── NCC Selector ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Nhà cung cấp (NCC):</span>
          {[
            { code: "WM",  name: "WORLDMOVE",      available: true  },
            { code: "3H",  name: "3HK",             available: true  },
            { code: "BC",  name: "BILLIONCONNECT",  available: false },
            { code: "SS",  name: "SIMSTORE",        available: false },
          ].map(ncc => (
            <button key={ncc.code}
              onClick={() => ncc.available && setSelectedNCC(ncc.code)}
              disabled={!ncc.available}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                selectedNCC === ncc.code
                  ? "bg-brand-600 text-white border-brand-600"
                  : ncc.available
                  ? "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-brand-400"
                  : "border-gray-100 dark:border-slate-700 text-gray-300 cursor-not-allowed"
              }`}>
              {ncc.name}
              {!ncc.available && <span className="ml-1.5 text-[10px]">soon</span>}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-2">Hiển thị sản phẩm chưa có trong hệ thống</span>
        </div>
      </div>

      {/* ─── Step 1: 3HK — Chọn zone ──────────────────────────── */}
      {selectedNCC === "3H" && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">1. Chọn Zone 3HK</h3>
          {loadingZones ? (
            <p className="text-sm text-gray-400">Đang tải zones...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">Zone</th>
                    <th className="px-3 py-2">Nước cover</th>
                    <th className="px-3 py-2 text-right">Giá/GB (HKD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {zoneGroups.map(z => (
                    <tr key={z.zone}
                      className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${selectedZone?.zone === z.zone ? "bg-brand-50" : ""}`}
                      onClick={() => setSelectedZone(z)}
                    >
                      <td className="px-3 py-2">
                        <input type="radio" readOnly checked={selectedZone?.zone === z.zone} />
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-brand-700">{z.zone}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-slate-300">{z.countries.slice(0, 8).join(", ")}{z.countries.length > 8 ? ` +${z.countries.length - 8}` : ""}</td>
                      <td className="px-3 py-2 text-right font-mono">{z.price_per_gb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedZone && (
            <p className="text-xs text-brand-600 font-medium">
              Zone <strong>{selectedZone.zone}</strong> đã chọn · {selectedZone.countries.length} nước · {selectedZone.price_per_gb} HKD/GB
            </p>
          )}
        </div>
      )}

      {/* ─── Step 1: WM — Chọn sản phẩm ────────────────────────── */}
      {selectedNCC === "WM" && (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">
            1. Chọn sản phẩm {selectedNCC}
          </h3>
          {selected.size > 0 && (
            <span className="text-sm font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
              {selected.size} đã chọn
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Tìm product name, ID, region..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select value={filterSim} onChange={e => { setFilterSim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả SIM</option>
            <option value="eSIM">eSIM</option>
            <option value="SIM">SIM</option>
          </select>
          <select value={filterUnlim} onChange={e => { setFilterUnlim(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả gói</option>
            <option value="unlimited">Unlimited</option>
            <option value="fixed">Fixed</option>
          </select>
          <button onClick={doSearch}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors">
            Tìm
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                <th className="px-3 py-2 w-8">
                  <input type="checkbox"
                    checked={products.length > 0 && products.every(p => selected.has(p.vendor_product_id))}
                    onChange={e => e.target.checked ? selectAll() : clearAll()}
                  />
                </th>
                <th className="px-3 py-2">Vendor ID</th>
                <th className="px-3 py-2">Tên sản phẩm</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Loại</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Data</th>
                <th className="px-3 py-2 text-right">COGS (TWD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {loadingP ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Đang tải...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Không có dữ liệu</td></tr>
              ) : products.map(p => (
                <tr key={p.vendor_product_id}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${selected.has(p.vendor_product_id) ? "bg-brand-50" : ""}`}
                  onClick={() => toggleSelect(p)}
                >
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={selected.has(p.vendor_product_id)}
                      onChange={() => toggleSelect(p)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.vendor_product_id}</td>
                  <td className="px-3 py-2 text-gray-800 dark:text-slate-100">{p.product_name}</td>
                  <td className="px-3 py-2 text-gray-500">{p.region}</td>
                  <td className="px-3 py-2 text-gray-500">{p.sim_type}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-slate-200">{p.days}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-slate-200">{fmtWMData(p)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-slate-200">{p.cogs ? p.cogs.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{selected.size} sản phẩm đã chọn</span>
            <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">Chọn trang này</button>
            {selected.size > 0 && (
              <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Bỏ hết</button>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Trang {page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"><ChevronLeft size={15} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          )}
        </div>
      </div>
      )} {/* end WM Step 1 */}

      {/* ─── Step 2: 3HK — Combo builder ──────────────────────── */}
      {selectedNCC === "3H" && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">2. Cấu hình Combo 3HK</h3>

          {/* Country config */}
          <div>
            <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-2">Thông tin nước / pháp nhân</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-brand-50/40 border border-brand-100 rounded-lg">
              <TemplField label="Purchase Type US *" value={config.purchaseType_US} onChange={v => setC("purchaseType_US", v)} placeholder="D" />
              <TemplField label="Purchase Type VN *" value={config.purchaseType_VN} onChange={v => setC("purchaseType_VN", v)} placeholder="3" />
              <TemplField label="Country Code (3 ký tự) *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="JPN" />
              <TemplField label="Tên nước (VN)" value={config.countryNameVn} onChange={v => setC("countryNameVn", v)} placeholder="Nhật Bản" />
              <TemplField label="Tên nước (EN)" value={config.countryNameEn} onChange={v => setC("countryNameEn", v)} placeholder="Japan" />
              <TemplField label="ISO Codes" value={config.isoCodes} onChange={v => setC("isoCodes", v)} placeholder="JP" />
            </div>
          </div>

          {/* Data types */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Loại data</p>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-200 w-20">Daily</span>
                {DAILY_DATA_OPTIONS.map(gb => (
                  <label key={gb} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={dailyGB.has(gb)}
                      onChange={() => setDailyGB(prev => { const s = new Set(prev); s.has(gb) ? s.delete(gb) : s.add(gb); return s })} />
                    <span className="text-sm text-gray-700 dark:text-slate-200">{gb}GB/ngày</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-200 w-20">Fixed</span>
                {FIXED_DATA_OPTIONS.map(gb => (
                  <label key={gb} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={fixedGB.has(gb)}
                      onChange={() => setFixedGB(prev => { const s = new Set(prev); s.has(gb) ? s.delete(gb) : s.add(gb); return s })} />
                    <span className="text-sm text-gray-700 dark:text-slate-200">{gb}GB</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={unlimitedEnabled} onChange={e => setUnlimitedEnabled(e.target.checked)} />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-200 w-20">Unlimited</span>
                </label>
                {unlimitedEnabled && (
                  <div className="flex items-center gap-3 ml-2">
                    <span className="text-xs text-gray-500">Throttle:</span>
                    {([10, 5] as const).map(m => (
                      <label key={m} className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="radio" checked={unlimThrottle === m} onChange={() => setUnlimThrottle(m)} />
                        <span className="text-sm text-gray-700 dark:text-slate-200">{m} Mbps</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Days */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Số ngày</p>
            <div className="flex flex-wrap gap-4">
              {DAY_OPTIONS.map(d => (
                <label key={d} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={selectedDays.has(d)}
                    onChange={() => setSelectedDays(prev => { const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s })} />
                  <span className="text-sm text-gray-700 dark:text-slate-200">{d} ngày</span>
                </label>
              ))}
            </div>
          </div>

          {/* SIM type option — Bug #32 */}
          <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Loại SIM xuất ra</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked disabled />
                <span className="text-sm text-gray-700 dark:text-slate-200 font-medium">eSIM (luôn có)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={includeSIM}
                  onChange={e => setIncludeSIM(e.target.checked)} />
                <span className="text-sm text-gray-700 dark:text-slate-200">
                  Top-up SIM (SIM vật lý)
                  <span className="text-xs text-gray-400 ml-1">— mỗi combo sẽ tạo thêm 1 hàng SIM</span>
                </span>
              </label>
            </div>
          </div>

          {selectedZone && (
            <p className="text-xs text-gray-400 pt-1">
              Zone {selectedZone.zone} · {selectedZone.price_per_gb} HKD/GB · 1 HKD = {fxSettings.fx_hkd_usd} USD · 1 USD = {fxSettings.fx_usd_vnd} VND
            </p>
          )}
        </div>
      )}

      {/* ─── Step 2: WM — Cấu hình ─────────────────────────────── */}
      {selectedNCC === "WM" && (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wide">2. Cấu hình Template</h3>
          <button
            onClick={autoFill}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-40"
          >
            ⚡ Auto-fill từ SP đã chọn
          </button>
        </div>

        {/* Required fields */}
        <div>
          <p className="text-[11px] font-semibold text-brand-600 uppercase tracking-wide mb-1">Bắt buộc nhập thủ công</p>
          <p className="text-[10px] text-gray-400 mb-2">Admin phải nhập — không thể tự động điền từ sản phẩm NCC</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-brand-50/40 border border-brand-100 rounded-lg">
            <TemplField label="Purchase Type US *" value={config.purchaseType_US} onChange={v => setC("purchaseType_US", v)} placeholder="D" />
            <TemplField label="Purchase Type VN *" value={config.purchaseType_VN} onChange={v => setC("purchaseType_VN", v)} placeholder="3" />
            <TemplField label="Country Code (3 ký tự) *" value={config.supportCountryCode} onChange={v => setC("supportCountryCode", v)} placeholder="TWN" />
            <TemplField label="Tên nước (VN)" value={config.countryNameVn} onChange={v => setC("countryNameVn", v)} placeholder="Đài Loan" />
            <TemplField label="Tên nước (EN)" value={config.countryNameEn} onChange={v => setC("countryNameEn", v)} placeholder="Taiwan" />
          </div>
        </div>

        {/* Auto-fillable fields */}
        <div>
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Auto-fill từ SP đã chọn (có thể chỉnh)</p>
          <p className="text-[10px] text-gray-400 mb-2">Nhấn ⚡ Auto-fill để điền tự động từ sản phẩm đầu tiên đã chọn ở trên</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <TemplField label="Type of SIM" value={config.typeOfSim} onChange={v => setC("typeOfSim", v)} placeholder="eSIM" />
            <TemplField label="Data Policy Code" value={config.dataPolicyCode} onChange={v => setC("dataPolicyCode", v)} placeholder="P" />
            <TemplField label="Operator Code" value={config.operatorCode} onChange={v => setC("operatorCode", v)} placeholder="WORLDMOVE" />
            <TemplField label="Network Type" value={config.networkType} onChange={v => setC("networkType", v)} placeholder="4G" />
            <TemplField label="APN" value={config.apn} onChange={v => setC("apn", v)} placeholder="mobile.three.com.hk" />
            <TemplField label="Onsite Carrier" value={config.onsiteCarrier} onChange={v => setC("onsiteCarrier", v)} placeholder="Chunghwa Telecom" />
            <TemplField label="ISO Codes" value={config.isoCodes} onChange={v => setC("isoCodes", v)} placeholder="TW" />
          </div>
        </div>

        {/* Advanced defaults */}
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:text-slate-300 select-none">
            ▸ Tuỳ chỉnh nâng cao (ít thay đổi)
          </summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <TemplField label="Product Type" value={config.productType} onChange={v => setC("productType", v)} placeholder="C" />
            <TemplField label="Vendor Code" value={config.vendorCode} onChange={v => setC("vendorCode", v)} placeholder="WM" />
            <TemplField label="Purchase Method" value={config.purchaseMethod} onChange={v => setC("purchaseMethod", v)} placeholder="API Purchase" />
            <TemplField label="SKU Type" value={config.skuType} onChange={v => setC("skuType", v)} placeholder="Base + Datapack" />
            <TemplField label="Import Type" value={config.importType} onChange={v => setC("importType", v)} placeholder="Official" />
            <TemplField label="Daily Reset Time" value={config.dailyResetTime} onChange={v => setC("dailyResetTime", v)} placeholder="UTC+8" />
            <TemplField label="Activation Time" value={config.activationTime} onChange={v => setC("activationTime", v)} placeholder="24h" />
            <TemplField label="Call" value={config.call} onChange={v => setC("call", v)} placeholder="No" />
            <TemplField label="Hotspot" value={config.hotspot} onChange={v => setC("hotspot", v)} placeholder="Yes" />
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">KYC Needed</label>
              <select value={config.kycNeeded} onChange={e => setC("kycNeeded", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Expiration (days)</label>
              <input type="number" value={config.expirationDays}
                onChange={e => setC("expirationDays", parseInt(e.target.value) || 90)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </details>

        <div className="text-xs text-gray-400 pt-1">
          Tỷ giá: 1 TWD = {fxSettings.fx_twd_usd} USD · 1 USD = {fxSettings.fx_usd_vnd} VND
          &nbsp;(từ tab Cài đặt)
        </div>
      </div>
      )} {/* end WM Step 2 */}

      {/* ─── Step 3: Xem trước ─────────────────────────────────── */}
      <button
        onClick={selectedNCC === "3H" ? build3HKPreview : buildPreview}
        disabled={
          selectedNCC === "3H"
            ? !selectedZone || selectedDays.size === 0
            : selected.size === 0
        }
        className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        <FileSpreadsheet size={16} />
        {selectedNCC === "3H"
          ? (!selectedZone ? "Xem trước (chưa chọn zone)" : `3. Xem trước combos`)
          : (selected.size === 0 ? "Xem trước (chưa chọn SP)" : `3. Xem trước ${selected.size} sản phẩm`)}
      </button>

      {/* ─── Step 4: Preview panel ─────────────────────────────── */}
      {previewRows && (
        <div ref={previewRef} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 flex-wrap gap-3">
            <div className="flex gap-1">
              {([
                { id: "us",   label: `SKU US (${previewRows.us.length})` },
                { id: "vn",   label: `SKU VN (${previewRows.vn.length})` },
                { id: "prod", label: "Product row" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setPreviewTab(t.id)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    previewTab === t.id ? "bg-white text-gray-900 dark:text-slate-100 shadow-sm border border-gray-200 dark:border-slate-700" : "text-gray-500 hover:text-gray-700 dark:text-slate-200"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={downloadExcel}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet size={15} />
              {generating ? "Đang tạo..." : "Tải Excel"}
            </button>
          </div>

          <div className="overflow-x-auto p-1">
            {previewTab !== "prod" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-700">
                    {["SKU Code","Name VN","Name EN","COGS","Curr.","Days","Data","Throttle","Vendor SKU"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                  {(previewTab === "us" ? previewRows.us : previewRows.vn).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-2 font-mono text-brand-700 whitespace-nowrap">{r.sku}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.name_vn}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{r.name_en}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.cogs}</td>
                      <td className="px-3 py-2 text-gray-400">{r.currency}</td>
                      <td className="px-3 py-2 text-center">{r.days}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.data}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{r.throttle || "—"}</td>
                      <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">{r.vendor_sku}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {previewTab === "prod" && (
              <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {[
                    ["productCode US", previewRows.pcUS],
                    ["productCode VN", previewRows.pcVN],
                    ["supportCountryCode", config.supportCountryCode],
                    ["supportedCountries (ISO)", config.isoCodes],
                    ["vendorCode", config.vendorCode],
                    ["dataPolicyCode", config.dataPolicyCode],
                    ["typeOfSim", config.typeOfSim],
                    ["operatorCode", config.operatorCode],
                    ["purchaseMethod", config.purchaseMethod],
                    ["skuType", config.skuType],
                    ["importType", config.importType],
                    ["networkType", config.networkType],
                    ["APN", config.apn],
                    ["onsiteCarrier", config.onsiteCarrier],
                    ["dailyResetTime", config.dailyResetTime],
                    ["activationTime", config.activationTime],
                    ["kycNeeded", config.kycNeeded],
                    ["hotspot", config.hotspot],
                    ["call", config.call],
                    ["expirationDays", String(config.expirationDays)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-gray-400 min-w-[160px]">{k}</span>
                      <span className="font-medium text-gray-800 dark:text-slate-100">{v || <span className="text-red-400">chưa nhập</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </> /* end subTab === "create" */}
    </div>
  )
}

function TemplField({ label, value, onChange, placeholder }: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
