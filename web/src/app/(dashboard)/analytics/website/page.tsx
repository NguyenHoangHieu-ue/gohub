"use client"

import React, { useState, useEffect } from "react"
import {
  Globe, Users, MousePointer2, TrendingUp, TrendingDown, ShoppingBag,
  DollarSign, Calendar, Filter, RefreshCw, Tag, Activity, ChevronDown, ChevronUp,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar,
} from "recharts"
import { cn } from "@/lib/utils"
import { DatePresets } from "@/components/date-presets"

// Port "y hệt" gohub-intel WebsiteAnalytics. Data qua /api/analytics/ga4 (generic dimensions/metrics) +
// /api/analytics/gsc + /api/config/ga4. Bỏ date-fns (không dùng), inline getDefaultDateRange,
// đổi nav '#settings' → /admin.

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  // Mac dinh: dau thang -> hom qua (T-1, tranh sync tre). Ngay 1 -> tu lui nguyen thang truoc.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}

interface GAData {
  rows: any[]
  rowCount: number
}

export default function WebsiteAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [loadingSites, setLoadingSites] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gscError, setGscError] = useState<string | null>(null)
  const [sites, setSites] = useState<{ id: string, name: string, currency?: string }[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")
  const [generalData, setGeneralData] = useState<GAData | null>(null)
  const [ecommerceData, setEcommerceData] = useState<GAData | null>(null)
  const [topProducts, setTopProducts] = useState<GAData | null>(null)
  const [topCountries, setTopCountries] = useState<GAData | null>(null)
  const [trafficSources, setTrafficSources] = useState<GAData | null>(null)
  const [esimPages, setEsimPages] = useState<GAData | null>(null)
  const [searchConsoleData, setSearchConsoleData] = useState<any>(null)
  const [compareGeneralData, setCompareGeneralData] = useState<GAData | null>(null)
  const [compareEcommerceData, setCompareEcommerceData] = useState<GAData | null>(null)
  const [compareSearchConsoleData, setCompareSearchConsoleData] = useState<any>(null)
  const [compareTopProducts, setCompareTopProducts] = useState<GAData | null>(null)
  const [compareTopCountries, setCompareTopCountries] = useState<GAData | null>(null)
  const [compareTrafficSources, setCompareTrafficSources] = useState<GAData | null>(null)
  const [compareEsimPages, setCompareEsimPages] = useState<GAData | null>(null)
  const [compareTopSearchQueries, setCompareTopSearchQueries] = useState<any>(null)
  const [topSearchQueries, setTopSearchQueries] = useState<any>(null)
  const [dateRange, setDateRange] = useState(() => getDefaultDateRange())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareRange, setCompareRange] = useState(() => {
    const defaultDate = getDefaultDateRange()
    const end = new Date(defaultDate.startDate)
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - 30)
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    }
  })
  const [expandedDestinations, setExpandedDestinations] = useState<Set<string>>(new Set())

  const toggleDestination = (dest: string) => {
    const newSet = new Set(expandedDestinations)
    if (newSet.has(dest)) newSet.delete(dest)
    else newSet.add(dest)
    setExpandedDestinations(newSet)
  }

  useEffect(() => {
    fetchSites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedSiteId) {
      fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, compareRange, compareEnabled, selectedSiteId])

  const fetchSites = async () => {
    setLoadingSites(true)
    try {
      const res = await fetch("/api/config/ga4")
      if (res.ok) {
        const data = await res.json()
        setSites(data)
        if (data.length > 0) {
          setSelectedSiteId(data[0].id)
        } else {
          setLoading(false)
        }
      }
    } catch (err) {
      console.error("Error fetching GA sites:", err)
    } finally {
      setLoadingSites(false)
    }
  }

  const fetchAnalytics = async () => {
    if (!selectedSiteId) return
    setLoading(true)
    setError(null)
    try {
      const query = `siteId=${selectedSiteId}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`

      // 1. General Traffic
      const genRes = await fetch(`/api/analytics/ga4?${query}&dimensions=date&metrics=activeUsers,sessions,screenPageViews,conversions,bounceRate`)
      if (!genRes.ok) {
        const err = await genRes.json()
        throw new Error(err.error || "Failed to fetch general analytics")
      }
      const genData = await genRes.json()
      setGeneralData(genData)

      // 2. Ecommerce Overview
      const ecoRes = await fetch(`/api/analytics/ga4?${query}&dimensions=date&metrics=purchaseRevenue,ecommercePurchases`)
      if (ecoRes.ok) setEcommerceData(await ecoRes.json())
      else setEcommerceData(null)

      // 3. Top Products
      const prodRes = await fetch(`/api/analytics/ga4?${query}&dimensions=itemName&metrics=itemRevenue,itemsPurchased`)
      if (prodRes.ok) setTopProducts(await prodRes.json())
      else setTopProducts(null)

      // Top Countries
      const countryRes = await fetch(`/api/analytics/ga4?${query}&dimensions=country&metrics=activeUsers,sessions,conversions`)
      if (countryRes.ok) setTopCountries(await countryRes.json())
      else setTopCountries(null)

      // Traffic Sources
      const sourceRes = await fetch(`/api/analytics/ga4?${query}&dimensions=sessionSourceMedium&metrics=activeUsers,sessions,conversions`)
      if (sourceRes.ok) setTrafficSources(await sourceRes.json())
      else setTrafficSources(null)

      // eSIM Item Performance
      const esimRes = await fetch(`/api/analytics/ga4?${query}&dimensions=itemCategory,itemName&metrics=itemsViewed,itemsPurchased`)
      if (esimRes.ok) setEsimPages(await esimRes.json())
      else setEsimPages(null)

      // 4. Search Console
      setGscError(null)
      const gscRes = await fetch(`/api/analytics/gsc?${query}&dimensions=date`)
      if (gscRes.ok) {
        setSearchConsoleData(await gscRes.json())
      } else {
        const gscErr = await gscRes.json()
        setGscError(gscErr.error || "Failed to fetch search console data")
        setSearchConsoleData(null)
      }

      const gscQueriesRes = await fetch(`/api/analytics/gsc?${query}&dimensions=query`)
      if (gscQueriesRes.ok) setTopSearchQueries(await gscQueriesRes.json())
      else setTopSearchQueries(null)

      if (compareEnabled) {
        const compQuery = `siteId=${selectedSiteId}&startDate=${compareRange.startDate}&endDate=${compareRange.endDate}`
        const [
          compGenRes, compEcoRes, compGscRes, compProdRes,
          compCountryRes, compSrcRes, compEsimRes, compGscQueriesRes,
        ] = await Promise.all([
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=date&metrics=activeUsers,sessions,screenPageViews,conversions,bounceRate`),
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=date&metrics=purchaseRevenue,ecommercePurchases`),
          fetch(`/api/analytics/gsc?${compQuery}&dimensions=date`),
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=itemName&metrics=itemRevenue,itemsPurchased`),
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=country&metrics=sessions,conversions`),
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=sessionSourceMedium&metrics=sessions,conversions`),
          fetch(`/api/analytics/ga4?${compQuery}&dimensions=itemCategory,itemName&metrics=itemsViewed,itemsPurchased`),
          fetch(`/api/analytics/gsc?${compQuery}&dimensions=query`),
        ])

        if (compGenRes.ok) setCompareGeneralData(await compGenRes.json()); else setCompareGeneralData(null)
        if (compEcoRes.ok) setCompareEcommerceData(await compEcoRes.json()); else setCompareEcommerceData(null)
        if (compGscRes.ok) setCompareSearchConsoleData(await compGscRes.json()); else setCompareSearchConsoleData(null)
        if (compProdRes.ok) setCompareTopProducts(await compProdRes.json()); else setCompareTopProducts(null)
        if (compCountryRes.ok) setCompareTopCountries(await compCountryRes.json()); else setCompareTopCountries(null)
        if (compSrcRes.ok) setCompareTrafficSources(await compSrcRes.json()); else setCompareTrafficSources(null)
        if (compEsimRes.ok) setCompareEsimPages(await compEsimRes.json()); else setCompareEsimPages(null)
        if (compGscQueriesRes.ok) setCompareTopSearchQueries(await compGscQueriesRes.json()); else setCompareTopSearchQueries(null)
      } else {
        setCompareGeneralData(null)
        setCompareEcommerceData(null)
        setCompareSearchConsoleData(null)
        setCompareTopProducts(null)
        setCompareTopCountries(null)
        setCompareTrafficSources(null)
        setCompareEsimPages(null)
        setCompareTopSearchQueries(null)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const chartData = (generalData?.rows?.map(row => ({
    date: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value),
    sessions: parseInt(row.metricValues[1].value),
    views: parseInt(row.metricValues[2].value),
    conversions: parseInt(row.metricValues[3].value),
  })).sort((a, b) => a.date.localeCompare(b.date)) || []).map((data, index) => {
    let compareUsers = 0
    if (compareGeneralData?.rows) {
      const sorted = [...compareGeneralData.rows].sort((a, b) => a.dimensionValues[0].value.localeCompare(b.dimensionValues[0].value))
      compareUsers = parseInt(sorted[index]?.metricValues[0].value || "0")
    }
    return { ...data, compareUsers }
  })

  const ecoTimeSeries = (ecommerceData?.rows?.map(row => ({
    date: row.dimensionValues[0].value,
    revenue: parseFloat(row.metricValues[0].value),
    purchases: parseInt(row.metricValues[1].value),
  })).sort((a, b) => a.date.localeCompare(b.date)) || []).map((data, index) => {
    let compareRevenue = 0
    if (compareEcommerceData?.rows) {
      const sorted = [...compareEcommerceData.rows].sort((a, b) => a.dimensionValues[0].value.localeCompare(b.dimensionValues[0].value))
      compareRevenue = parseFloat(sorted[index]?.metricValues[0].value || "0")
    }
    return { ...data, compareRevenue }
  })

  const gscTimeSeries = (searchConsoleData?.rows?.map((row: any) => ({
    date: row.keys[0].replace(/-/g, ""),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr * 100,
    position: row.position,
  })).sort((a: any, b: any) => a.date.localeCompare(b.date)) || []).map((data: any, index: number) => {
    let compareClicks = 0
    if (compareSearchConsoleData?.rows) {
      const sorted = [...compareSearchConsoleData.rows].sort((a: any, b: any) => a.keys[0].localeCompare(b.keys[0]))
      compareClicks = sorted[index]?.clicks || 0
    }
    return { ...data, compareClicks }
  })

  // Compare Map Helpers
  const compareProductsMap = new Map((compareTopProducts?.rows || []).map((row: any) => [
    row.dimensionValues[0].value,
    { revenue: parseFloat(row.metricValues[0].value), quantity: parseInt(row.metricValues[1].value) },
  ]))

  const compareCountriesMap = new Map((compareTopCountries?.rows || []).map((row: any) => [
    row.dimensionValues[0].value,
    { users: parseInt(row.metricValues[0].value) },
  ]))

  const compareSourcesMap = new Map((compareTrafficSources?.rows || []).map((row: any) => [
    row.dimensionValues[0].value,
    { users: parseInt(row.metricValues[0].value) },
  ]))

  const compareQueriesMap = new Map<string, { clicks: number }>((compareTopSearchQueries?.rows || []).map((row: any) => [
    row.keys[0],
    { clicks: row.clicks },
  ]))

  const productPerformance = topProducts?.rows?.map(row => {
    const name = row.dimensionValues[0].value
    const revenue = parseFloat(row.metricValues[0].value)
    const quantity = parseInt(row.metricValues[1].value)
    const prevRevenue = (compareProductsMap.get(name) as any)?.revenue || 0
    return { name, revenue, quantity, change: calculateChange(revenue, prevRevenue) }
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5) || []

  const countriesPerformace = topCountries?.rows?.map(row => {
    const name = row.dimensionValues[0].value
    const users = parseInt(row.metricValues[0].value)
    const sessions = parseInt(row.metricValues[1].value)
    const prevUsers = (compareCountriesMap.get(name) as any)?.users || 0
    return { name, users, sessions, change: calculateChange(users, prevUsers) }
  }).sort((a, b) => b.users - a.users).slice(0, 5) || []

  const sourcesPerformance = trafficSources?.rows?.map(row => {
    const name = row.dimensionValues[0].value
    const users = parseInt(row.metricValues[0].value)
    const sessions = parseInt(row.metricValues[1].value)
    const prevUsers = (compareSourcesMap.get(name) as any)?.users || 0
    return { name, users, sessions, change: calculateChange(users, prevUsers) }
  }).sort((a, b) => b.users - a.users).slice(0, 5) || []

  const topQueriesPerformance = topSearchQueries?.rows?.map((row: any) => {
    const query = row.keys[0]
    const prevClicks = compareQueriesMap.get(query)?.clicks || 0
    return {
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr * 100,
      position: row.position,
      change: calculateChange(row.clicks, prevClicks),
    }
  }).sort((a: any, b: any) => b.clicks - a.clicks).slice(0, 10) || []

  const destinationNames: Record<string, string> = {
    "Thailand": "Thailand", "China": "China", "Japan": "Japan", "Global": "Global / Regional",
    "Europe": "GB,DK,AT,FR,DE,IT,NL,PL,ES,CH", "South Korea": "South Korea", "Taiwan": "Taiwan",
    "Singapore": "Singapore", "Malaysia": "Malaysia", "Asia": "Asia", "Vietnam": "Vietnam",
    "Indonesia": "Indonesia", "Philippines": "Philippines", "Hong Kong": "Hong Kong", "Australia": "Australia",
    "United Kingdom": "United Kingdom", "Turkey": "Turkey", "Cambodia": "Cambodia", "India": "India",
    "United States": "United States",
  }

  const getDestinationFromNorm = (norm: string): string | null => {
    for (const [key, dest] of Object.entries(destinationNames)) {
      if (norm.toLowerCase().includes(key.toLowerCase())) return dest
    }
    return null
  }

  const normalizeItemName = (name: string): string => {
    if (!name) return ""
    let norm = name
    norm = norm.replace(/Thái Lan/gi, "Thailand")
    norm = norm.replace(/Trung Quốc/gi, "China")
    norm = norm.replace(/Nhật Bản/gi, "Japan")
    norm = norm.replace(/Toàn Cầu/gi, "Global")
    norm = norm.replace(/Châu Âu/gi, "Europe")
    norm = norm.replace(/Hàn Quốc/gi, "South Korea")
    norm = norm.replace(/Đài Loan/gi, "Taiwan")
    norm = norm.replace(/Châu Á/gi, "Asia")
    norm = norm.replace(/Việt Nam/gi, "Vietnam")
    norm = norm.replace(/Ngày/gi, "Day(s)")
    norm = norm.replace(/Tháng/gi, "Month(s)")
    return norm.trim()
  }

  const esimDestinationsMap = new Map<string, { sessions: number, conversions: number, itemsMap: Map<string, { sessions: number, conversions: number }> }>()
  const esimItemsMap = new Map<string, { sessions: number, conversions: number, dest: string | null, displayNames: { name: string, views: number }[] }>()

  if (esimPages?.rows) {
    for (const row of esimPages.rows) {
      const category = row.dimensionValues[0].value
      const itemName = row.dimensionValues[1].value
      const sessions = parseInt(row.metricValues[0].value) || 0
      const conversions = parseInt(row.metricValues[1].value) || 0

      if (!itemName || itemName.toLowerCase() === "(not set)") continue

      const norm = normalizeItemName(itemName)

      let destName = getDestinationFromNorm(norm)
      if (!destName && category && category.length >= 2) {
        if (category.includes("AD") || category.includes("CY")) destName = "Global / Regional"
        else destName = category
      }
      if (!destName) destName = "Other"

      const existingItem = esimItemsMap.get(norm) || { sessions: 0, conversions: 0, dest: destName, displayNames: [] }
      existingItem.sessions += sessions
      existingItem.conversions += conversions
      existingItem.displayNames.push({ name: itemName, views: sessions })
      esimItemsMap.set(norm, existingItem)
    }

    for (const [norm, item] of esimItemsMap.entries()) {
      item.displayNames.sort((a, b) => b.views - a.views)
      const displayName = item.displayNames[0]?.name || norm
      const destName = item.dest || "Other"

      const existingCat = esimDestinationsMap.get(destName) || { sessions: 0, conversions: 0, itemsMap: new Map<string, { sessions: number, conversions: number }>() }
      existingCat.sessions += item.sessions
      existingCat.conversions += item.conversions

      const catItem = existingCat.itemsMap.get(displayName) || { sessions: 0, conversions: 0 }
      catItem.sessions += item.sessions
      catItem.conversions += item.conversions
      existingCat.itemsMap.set(displayName, catItem)

      esimDestinationsMap.set(destName, existingCat)
    }
  }

  const compareEsimDestinationsMap = new Map<string, { sessions: number, conversions: number, itemsMap: Map<string, { sessions: number, conversions: number }> }>()
  const compareEsimItemsMap = new Map<string, { sessions: number, conversions: number, dest: string | null }>()

  if (compareEsimPages?.rows) {
    for (const row of compareEsimPages.rows) {
      const category = row.dimensionValues[0].value
      const itemName = row.dimensionValues[1].value
      const sessions = parseInt(row.metricValues[0].value) || 0
      const conversions = parseInt(row.metricValues[1].value) || 0

      if (!itemName || itemName.toLowerCase() === "(not set)") continue

      const norm = normalizeItemName(itemName)
      let destName = getDestinationFromNorm(norm)
      if (!destName && category && category.length >= 2) {
        if (category.includes("AD") || category.includes("CY")) destName = "Global / Regional"
        else destName = category
      }
      if (!destName) destName = "Other"

      const existingItem = compareEsimItemsMap.get(norm) || { sessions: 0, conversions: 0, dest: destName }
      existingItem.sessions += sessions
      existingItem.conversions += conversions
      compareEsimItemsMap.set(norm, existingItem)
    }
    for (const [, item] of compareEsimItemsMap.entries()) {
      const destName = item.dest || "Other"
      const existingCat = compareEsimDestinationsMap.get(destName) || { sessions: 0, conversions: 0, itemsMap: new Map<string, { sessions: number, conversions: number }>() }
      existingCat.sessions += item.sessions
      existingCat.conversions += item.conversions
      compareEsimDestinationsMap.set(destName, existingCat)
    }
  }

  const esimPagesPerformance = Array.from(esimItemsMap.entries()).map(([norm, metrics]) => {
    const prevSessions = compareEsimItemsMap.get(norm)?.sessions || 0
    return {
      path: metrics.displayNames[0]?.name || norm,
      sessions: metrics.sessions,
      conversions: metrics.conversions,
      change: calculateChange(metrics.sessions, prevSessions),
    }
  }).sort((a, b) => b.sessions - a.sessions).slice(0, 10)

  const esimDestinations = Array.from(esimDestinationsMap.entries()).map(([dest, metrics]) => {
    const prevSessions = compareEsimDestinationsMap.get(dest)?.sessions || 0
    return {
      destination: dest,
      sessions: metrics.sessions,
      conversions: metrics.conversions,
      cr: metrics.sessions > 0 ? (metrics.conversions / metrics.sessions) * 100 : 0,
      change: calculateChange(metrics.sessions, prevSessions),
      items: Array.from(metrics.itemsMap.entries()).map(([name, itemMetrics]) => ({
        name,
        sessions: itemMetrics.sessions,
        conversions: itemMetrics.conversions,
        cr: itemMetrics.sessions > 0 ? (itemMetrics.conversions / itemMetrics.sessions) * 100 : 0,
      })).sort((a, b) => b.conversions - a.conversions),
    }
  }).sort((a, b) => b.sessions - a.sessions).slice(0, 10)

  const selectedSite = sites.find(s => s.id === selectedSiteId)
  const formatRevenue = (val: number) => {
    if (selectedSite?.currency === "VND") return `${val.toLocaleString("vi-VN")}₫`
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const currentClicks = gscTimeSeries.reduce((acc: number, curr: any) => acc + curr.clicks, 0)
  const currentCtr = gscTimeSeries.length > 0 ? gscTimeSeries.reduce((acc: number, curr: any) => acc + curr.ctr, 0) / gscTimeSeries.length : 0
  const currentRevenue = ecoTimeSeries.reduce((acc, curr) => acc + curr.revenue, 0)

  const currentSessions = generalData?.rows ? generalData.rows.reduce((acc: any, curr: any) => acc + parseInt(curr.metricValues[1].value), 0) : 0

  // Compare Data
  const compareGscTimeSeries = compareSearchConsoleData?.rows?.map((row: any) => ({
    clicks: row.clicks, impressions: row.impressions, ctr: row.ctr * 100,
  })) || []

  const compareEcoTimeSeries = compareEcommerceData?.rows?.map((row: any) => ({
    revenue: parseFloat(row.metricValues[0].value), purchases: parseInt(row.metricValues[1]?.value || "0"),
  })) || []

  const compareClicks = compareGscTimeSeries.reduce((acc: number, curr: any) => acc + curr.clicks, 0)
  const compareCtr = compareGscTimeSeries.length > 0 ? compareGscTimeSeries.reduce((acc: number, curr: any) => acc + curr.ctr, 0) / compareGscTimeSeries.length : 0
  const compareRevenue = compareEcoTimeSeries.reduce((acc: number, curr: any) => acc + curr.revenue, 0)

  const compareSessions = compareGeneralData?.rows ? compareGeneralData.rows.reduce((acc: any, curr: any) => acc + parseInt(curr.metricValues[1].value), 0) : 0

  function calculateChange(current: number, previous: number) {
    if (previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const currentPurchases = ecoTimeSeries.reduce((acc, curr) => acc + curr.purchases, 0)
  const comparePurchases = compareEcoTimeSeries.reduce((acc: number, curr: any) => acc + curr.purchases, 0)

  const kpis = [
    { label: "Sessions", value: currentSessions.toLocaleString(), change: calculateChange(currentSessions, compareSessions), icon: Users, color: "blue" },
    { label: "Purchases", value: currentPurchases.toLocaleString(), change: calculateChange(currentPurchases, comparePurchases), icon: ShoppingBag, color: "emerald" },
    { label: "Search Clicks", value: currentClicks.toLocaleString(), change: calculateChange(currentClicks, compareClicks), icon: MousePointer2, color: "indigo" },
    { label: "Avg. CTR", value: `${currentCtr.toFixed(2)}%`, change: calculateChange(currentCtr, compareCtr), icon: Activity, color: "emerald" },
    { label: "Revenue", value: formatRevenue(currentRevenue), change: calculateChange(currentRevenue, compareRevenue), icon: DollarSign, color: "orange" },
  ]

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl text-center">
          <Globe className="w-12 h-12 text-rose-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-rose-900 mb-2">GA4 Connection Error</h3>
          <p className="text-rose-600 mb-6">{error}</p>
          <button onClick={() => { window.location.href = "/admin" }} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all">
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  if (sites.length === 0 && !loadingSites) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4 animate-bounce">
          <Globe className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Chưa có Website nào</h3>
        <p className="text-slate-500 max-w-sm mb-6">
          Vui lòng vào phần Cài đặt để thêm thông tin Property ID và Credentials cho website của bạn.
        </p>
        <button onClick={() => { window.location.href = "/admin" }} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm">
          Đi tới Cài đặt
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Website Analytics</h1>
          <p className="text-slate-500">Real-time insights from Google Analytics 4 (GA4).</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {sites.length > 0 && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500">
              <Globe className="w-4 h-4 text-blue-500" />
              <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}
                className="text-xs font-bold text-slate-700 outline-none bg-transparent cursor-pointer min-w-[120px]">
                {sites.map(site => (<option key={site.id} value={site.id}>{site.name}</option>))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={compareEnabled} onChange={() => setCompareEnabled(!compareEnabled)} />
                  <div className={cn("block w-8 h-5 rounded-full transition-colors", compareEnabled ? "bg-blue-500" : "bg-slate-200")}></div>
                  <div className={cn("dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform", compareEnabled && "transform translate-x-3")}></div>
                </div>
                <span className="text-xs font-semibold text-slate-600">Compare</span>
              </label>

              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input type="date" value={dateRange.startDate} onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })} className="text-xs font-medium text-slate-600 outline-none" />
                <span className="text-slate-300">→</span>
                <input type="date" value={dateRange.endDate} onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })} className="text-xs font-medium text-slate-600 outline-none" />
              </div>

              <DatePresets onSelect={(s, e) => setDateRange(prev => ({ ...prev, startDate: s, endDate: e }))} />

              <button onClick={fetchAnalytics} disabled={loading} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                <RefreshCw className={cn("w-5 h-5 text-slate-600", loading && "animate-spin")} />
              </button>
            </div>

            {compareEnabled && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-sm text-slate-500">
                <span className="text-xs font-medium">Compare with:</span>
                <input type="date" value={compareRange.startDate} onChange={(e) => setCompareRange({ ...compareRange, startDate: e.target.value })} className="bg-transparent text-xs font-medium outline-none" />
                <span className="text-slate-400">→</span>
                <input type="date" value={compareRange.endDate} onChange={(e) => setCompareRange({ ...compareRange, endDate: e.target.value })} className="bg-transparent text-xs font-medium outline-none" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                kpi.color === "blue" ? "bg-blue-50 text-blue-600" :
                kpi.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                kpi.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
              )}>
                <kpi.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</h3>
              </div>
            </div>
            {compareEnabled && kpi.change !== null && (
              <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                kpi.change > 0 ? "text-emerald-600 bg-emerald-50" : kpi.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
              )}>
                {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : kpi.change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                {Math.abs(kpi.change).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Traffic Overview + Search Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Traffic Overview</h2>
              <p className="text-sm text-slate-500">Người dùng và Phiên truy cập (GA4).</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span className="text-xs font-medium text-slate-600">Users</span></div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCompareUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} /><stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8) + "/" + val.substring(4, 6)} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                {compareEnabled && (<Area type="monotone" dataKey="compareUsers" name="Previous Users" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} fillOpacity={1} fill="url(#colorCompareUsers)" />)}
                <Area type="monotone" dataKey="users" name="Users" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Search Trends</h2>
              <p className="text-sm text-slate-500">Clicks và Impressions (Search Console).</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-600"></div><span className="text-xs font-medium text-slate-600">Clicks</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-300"></div><span className="text-xs font-medium text-slate-600">Impressions</span></div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            {gscError ? (
              <div className="flex items-center justify-center h-full flex-col text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <Globe className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-sm font-medium text-slate-600 mb-1">Search Console Error</p>
                <p className="text-xs max-w-xs">{gscError}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gscTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8) + "/" + val.substring(4, 6)} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  {compareEnabled && (<Line yAxisId="left" type="monotone" name="Previous Clicks" dataKey="compareClicks" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} dot={false} />)}
                  <Line yAxisId="left" type="monotone" name="Clicks" dataKey="clicks" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" name="Impressions" dataKey="impressions" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Revenue Breakdown</h2>
              <p className="text-sm text-slate-500">Ecommerce revenue tracking.</p>
            </div>
            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5" /></div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ecoTimeSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8)} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [formatRevenue(val), "Revenue"]} />
                <Bar dataKey="revenue" name="Revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
                {compareEnabled && (<Bar dataKey="compareRevenue" name="Previous Revenue" fill="#cbd5e1" radius={[4, 4, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Top Selling Items</h2>
              <p className="text-sm text-slate-500">Items contributing most to revenue.</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><ShoppingBag className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            {productPerformance.map((product, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all border border-slate-50">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">{idx + 1}</div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-800 truncate">{product.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">{product.quantity} units sold</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  {compareEnabled && product.change !== null && (
                    <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                      product.change > 0 ? "text-emerald-600 bg-emerald-50" : product.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                    )}>
                      {product.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : product.change < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : null}
                      {Math.abs(product.change).toFixed(1)}%
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{formatRevenue(product.revenue)}</p>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(product.revenue / productPerformance[0].revenue) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {productPerformance.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Tag className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-[10px]">No ecommerce data found for this period</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Countries */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Top Countries</h2>
              <p className="text-sm text-slate-500">Users distribution by country.</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Globe className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            {countriesPerformace.map((country, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all border border-slate-50">
                <div className="flex items-center gap-3 overflow-hidden w-full">
                  <div className="overflow-hidden flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{country.name}</p>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(country.users / countriesPerformace[0].users) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right shrink-0 ml-4">
                  {compareEnabled && country.change !== null && (
                    <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                      country.change > 0 ? "text-emerald-600 bg-emerald-50" : country.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                    )}>
                      {country.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : country.change < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : null}
                      {Math.abs(country.change).toFixed(1)}%
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{country.users.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Users</p>
                  </div>
                </div>
              </div>
            ))}
            {countriesPerformace.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Globe className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-[10px]">No geographic data found</p>
              </div>
            )}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Traffic Sources</h2>
              <p className="text-sm text-slate-500">Top user acquisition channels.</p>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><Filter className="w-5 h-5" /></div>
          </div>
          <div className="space-y-4">
            {sourcesPerformance.map((source, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all border border-slate-50">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-600 shrink-0">{idx + 1}</div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-800 truncate">{source.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">{source.sessions.toLocaleString()} sessions</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right shrink-0 ml-4">
                  {compareEnabled && source.change !== null && (
                    <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                      source.change > 0 ? "text-emerald-600 bg-emerald-50" : source.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                    )}>
                      {source.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : source.change < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : null}
                      {Math.abs(source.change).toFixed(1)}%
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{source.users.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Users</p>
                  </div>
                </div>
              </div>
            ))}
            {sourcesPerformance.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Activity className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-[10px]">No traffic data found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Top Search Queries */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Top Search Queries</h2>
              <p className="text-sm text-slate-500">Queries driving traffic from Google Search.</p>
            </div>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><MousePointer2 className="w-5 h-5" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
                  <th className="p-3 font-semibold rounded-tl-xl w-1/3">Query</th>
                  <th className="p-3 font-semibold text-right">Clicks</th>
                  <th className="p-3 font-semibold text-right">Impressions</th>
                  <th className="p-3 font-semibold text-right">CTR</th>
                  <th className="p-3 font-semibold text-right rounded-tr-xl">Avg. Position</th>
                </tr>
              </thead>
              <tbody>
                {topQueriesPerformance.map((q: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-sm font-medium text-slate-800">{q.query}</td>
                    <td className="p-3 text-sm font-bold text-blue-600 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {compareEnabled && q.change !== null && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                            q.change > 0 ? "text-emerald-600 bg-emerald-50" : q.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                          )}>
                            {q.change > 0 ? "+" : ""}{q.change.toFixed(1)}%
                          </span>
                        )}
                        <span>{q.clicks.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-slate-600 text-right">{q.impressions.toLocaleString()}</td>
                    <td className="p-3 text-sm text-emerald-600 text-right font-medium">{q.ctr.toFixed(1)}%</td>
                    <td className="p-3 text-sm text-slate-500 text-right">{q.position.toFixed(1)}</td>
                  </tr>
                ))}
                {topQueriesPerformance.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">No search queries found for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* eSIM Destinations (CR) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">eSIM Destinations (CR)</h2>
              <p className="text-sm text-slate-500">Aggregated performance by country category.</p>
            </div>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Globe className="w-5 h-5" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
                  <th className="p-3 font-semibold rounded-tl-xl">Destination</th>
                  <th className="p-3 font-semibold text-right">Views</th>
                  <th className="p-3 font-semibold text-right">Purchases</th>
                  <th className="p-3 font-semibold text-right rounded-tr-xl">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {esimDestinations.map((p, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => toggleDestination(p.destination)}>
                      <td className="p-3 text-sm font-bold text-slate-800 capitalize flex items-center gap-2">
                        <div className="w-5 flex justify-center">
                          {expandedDestinations.has(p.destination)
                            ? <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                            : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />}
                        </div>
                        {p.destination}
                      </td>
                      <td className="p-3 text-sm text-slate-600 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {compareEnabled && p.change !== null && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                              p.change > 0 ? "text-emerald-600 bg-emerald-50" : p.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                            )}>
                              {p.change > 0 ? "+" : ""}{p.change.toFixed(1)}%
                            </span>
                          )}
                          <span>{p.sessions.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm font-medium text-emerald-600 text-right">{p.conversions.toLocaleString()}</td>
                      <td className="p-3 text-sm font-bold text-slate-900 text-right">{p.cr.toFixed(2)}%</td>
                    </tr>
                    {expandedDestinations.has(p.destination) && p.items.length > 0 && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={4} className="p-0">
                          <div className="pl-12 pr-4 py-3 border-b border-slate-100">
                            <table className="w-full text-left">
                              <thead className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                                <tr>
                                  <th className="py-2">Product Purchased</th>
                                  <th className="py-2 text-right">Views</th>
                                  <th className="py-2 text-right">Purchases</th>
                                  <th className="py-2 text-right">Conv. Rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.items.map((item, idxi) => (
                                  <tr key={idxi} className="border-t border-slate-100/50 text-xs text-slate-600 hover:bg-white transition-colors">
                                    <td className="py-2.5 font-medium max-w-[200px] truncate text-slate-700" title={item.name}>{item.name}</td>
                                    <td className="py-2.5 text-right font-medium">{item.sessions}</td>
                                    <td className="py-2.5 text-right font-medium text-emerald-600">{item.conversions}</td>
                                    <td className="py-2.5 text-right font-medium">{item.cr.toFixed(2)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {esimDestinations.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-400">No destination grouping data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top eSIM Products */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Top eSIM Products</h2>
              <p className="text-sm text-slate-500">Purchase performance by product items.</p>
            </div>
            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center"><Globe className="w-5 h-5" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
                  <th className="p-3 font-semibold rounded-tl-xl w-5/12">Product Name</th>
                  <th className="p-3 font-semibold text-right">Views</th>
                  <th className="p-3 font-semibold text-right">Purchases</th>
                  <th className="p-3 font-semibold text-right rounded-tr-xl">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {esimPagesPerformance.map((p, idx) => {
                  const cr = p.sessions > 0 ? ((p.conversions || 0) / p.sessions) * 100 : 0
                  return (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-xs font-medium text-slate-700 break-all">{p.path}</td>
                      <td className="p-3 text-sm text-slate-600 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {compareEnabled && p.change !== null && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold",
                              p.change > 0 ? "text-emerald-600 bg-emerald-50" : p.change < 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-50"
                            )}>
                              {p.change > 0 ? "+" : ""}{p.change.toFixed(1)}%
                            </span>
                          )}
                          <span>{p.sessions.toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm font-medium text-emerald-600 text-right">{(p.conversions || 0).toLocaleString()}</td>
                      <td className="p-3 text-sm font-bold text-slate-900 text-right">{cr.toFixed(2)}%</td>
                    </tr>
                  )
                })}
                {esimPagesPerformance.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-400">No eSIM page data found for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
