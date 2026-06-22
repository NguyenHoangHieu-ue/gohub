import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import * as XLSX from "xlsx"
import type { ParsedWMItem, ChangedPriceItem, ParsedDatapoolItem, ChangedDatapoolItem } from "@/types/ncc-import"

export const maxDuration = 60

// ── Format detection ─────────────────────────────────────────────────────────

type FileFormat = "standard" | "wm_native"

function detectFormat(wb: XLSX.WorkBook): FileFormat {
  const sheetNames = wb.SheetNames.map(s => s.toLowerCase())
  if (sheetNames.some(s => s.includes("goi") || s.includes("ready") || s.includes("datapool")))
    return "standard"
  const ws = wb.Sheets[wb.SheetNames[0]]
  const firstRow = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { header: 1 })[0] as string[] ?? []
  const keys = firstRow.map(k => String(k ?? "").toLowerCase().trim())
  if (keys.includes("vendor_code") || keys.includes("vendor_id")) return "standard"
  return "wm_native"
}

// ── WM native parser (unchanged logic from original import) ──────────────────

function parseProductName(name: string) {
  const result = { days: null as number|null, data_gb: null as number|null, is_daily: false, is_unlimited: false, throttle_kbps: null as number|null }
  const dayM = name.match(/(\d+)\s*[Dd]ays?/)
  if (dayM) result.days = parseInt(dayM[1])
  if (/[Tt]itanium\s+AYCE/.test(name)) { result.is_unlimited = true; return result }
  if (/[Pp]remium\s+[Uu]nlimited/.test(name)) return { ...result, is_unlimited: true, data_gb: 1.0, is_daily: true, throttle_kbps: 10000 }
  if (/[Uu]nlimited/.test(name)) return { ...result, is_unlimited: true, data_gb: 2.0, is_daily: true, throttle_kbps: 5000 }
  const gbM = name.match(/([\d.]+)\s*GB\s*(\/day)?/i)
  if (gbM) { result.data_gb = parseFloat(gbM[1]); result.is_daily = !!gbM[2] }
  if (result.data_gb === null) {
    const mbM = name.match(/([\d.]+)\s*MB\s*(\/day)?/i)
    if (mbM) { result.data_gb = Math.round(parseFloat(mbM[1])/1000*10000)/10000; result.is_daily = !!mbM[2] }
  }
  const kbpsM = name.match(/(\d+)\s*kbps/i)
  if (kbpsM) result.throttle_kbps = parseInt(kbpsM[1])
  else { const mbpsM = name.match(/([\d.]+)\s*[Mm]bps/i); if (mbpsM) result.throttle_kbps = Math.round(parseFloat(mbpsM[1])*1000) }
  if (result.throttle_kbps === null && !result.is_unlimited) result.throttle_kbps = 128
  return result
}

function parseWMNative(buffer: Buffer): ParsedWMItem[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" })
  const items: ParsedWMItem[] = []
  for (const r of rows) {
    const norm: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) norm[String(k).toLowerCase().trim()] = String(v ?? "").trim()
    const id = norm["wmproductid"] || norm["vendor_product_id"] || norm["product id"] || norm["id"] || ""
    if (!id) continue
    const name = norm["product name"] || norm["productname"] || norm["name"] || ""
    const cogsRaw = norm["cost price (nt)"] || norm["cost price(nt)"] || norm["cost price"] || norm["cogs"] || ""
    const cogs = cogsRaw ? parseFloat(cogsRaw) || null : null
    const isLesim = (norm["lesim"] || norm["is_lesim"] || "").toUpperCase() === "Y"
    const parsed = parseProductName(name)
    items.push({
      vendor_code: "WM",
      vendor_product_id: id,
      product_name: name || null,
      region: norm["region"] || null,
      sim_type: norm["type"] || norm["sim_type"] || null,
      cogs, cogs_currency: "TWD", is_lesim: isLesim, is_kyc: false, status: "active", ...parsed,
    })
  }
  return items
}

// ── Standard format parser ────────────────────────────────────────────────────

function isGuideRow(r: Record<string, any>): boolean {
  const v = String(r["vendor_code"] ?? "").trim()
  return !v || v.startsWith("[") || v.startsWith("VD:") || v.startsWith("WM / ")
}

function parseStandardReadyMade(wb: XLSX.WorkBook): ParsedWMItem[] {
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes("goi") || s.toLowerCase().includes("ready")) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" })
  return rows
    .filter(r => !isGuideRow(r))
    .map(r => {
      const throttleMbps = parseFloat(String(r["throttle_mbps"] ?? "")) || null
      const yN = (col: string) => String(r[col] ?? "").toUpperCase() === "Y"
      return {
        vendor_code: String(r["vendor_code"]).trim(),
        vendor_product_id: String(r["vendor_id"] ?? "").trim(),
        product_name: String(r["product_name"] ?? "").trim() || null,
        region: String(r["region"] ?? "").trim() || null,
        sim_type: String(r["sim_type"] ?? "").trim() || null,
        days: parseInt(String(r["days"] ?? "")) || null,
        data_gb: parseFloat(String(r["data_gb"] ?? "")) || null,
        is_daily: yN("is_daily"),
        is_unlimited: yN("is_unlimited"),
        throttle_kbps: throttleMbps !== null ? Math.round(throttleMbps * 1000) : null,
        cogs: parseFloat(String(r["cost_price"] ?? "")) || null,
        cogs_currency: String(r["currency"] ?? "TWD").trim(),
        apn: String(r["apn"] ?? "").trim() || null,
        network_type: String(r["network_type"] ?? "").trim() || null,
        is_kyc: yN("is_kyc"),
        is_lesim: yN("is_lesim"),
        status: "active",
      } satisfies ParsedWMItem
    })
    .filter(item => item.vendor_product_id)
}

function parseStandardDatapool(wb: XLSX.WorkBook): ParsedDatapoolItem[] {
  const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes("datapool"))
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" })
  return rows
    .filter(r => !isGuideRow(r))
    .map(r => {
      const yN = (col: string) => String(r[col] ?? "").toUpperCase() === "Y"
      return {
        vendor_code: String(r["vendor_code"]).trim(),
        zone_id: String(r["zone_id"] ?? "").trim(),
        zone_name: String(r["zone_name"] ?? "").trim() || null,
        countries: String(r["countries"] ?? "").trim() || null,
        sim_type: String(r["sim_type"] ?? "eSIM").trim(),
        price_per_gb: parseFloat(String(r["price_per_gb"] ?? "")) || null,
        currency: String(r["currency"] ?? "HKD").trim(),
        network_type: String(r["network_type"] ?? "").trim() || null,
        is_kyc: yN("is_kyc"),
        notes: String(r["notes"] ?? "").trim() || null,
        status: "active",
      } satisfies ParsedDatapoolItem
    })
    .filter(item => item.zone_id && item.vendor_code)
}

// ── Diff helpers ──────────────────────────────────────────────────────────────

async function fetchDbReadyMade() {
  const map: Record<string, { cogs: number|null; status: string }> = {}
  for (let off = 0; ; off += 1000) {
    const { data } = await (supabaseAdmin.from("ncc_worldmove") as any)
      .select("vendor_product_id,cogs,status").range(off, off + 999)
    if (!data?.length) break
    for (const r of data) map[r.vendor_product_id] = { cogs: r.cogs, status: r.status }
    if (data.length < 1000) break
  }
  return map
}

async function fetchDbDatapool() {
  const { data } = await (supabaseAdmin.from("ncc_datapool") as any)
    .select("vendor_code,zone_id,price_per_gb,status")
  const map: Record<string, { price_per_gb: number|null; status: string }> = {}
  for (const r of data ?? []) map[`${r.vendor_code}:${r.zone_id}`] = { price_per_gb: r.price_per_gb, status: r.status }
  return map
}

function diffReadyMade(items: ParsedWMItem[], dbMap: Record<string, { cogs: number|null; status: string }>) {
  const fileIds = new Set(items.map(i => i.vendor_product_id))
  const allNew: ParsedWMItem[] = []
  const allChanged: ChangedPriceItem[] = []
  for (const item of items) {
    const existing = dbMap[item.vendor_product_id]
    if (!existing) allNew.push(item)
    else if (existing.cogs !== item.cogs) allChanged.push({ item, oldCogs: existing.cogs })
  }
  const allDiscontinuedIds = Object.entries(dbMap)
    .filter(([id, s]) => s.status === "active" && !fileIds.has(id))
    .map(([id]) => id)
  return { allNew, allChanged, allDiscontinuedIds }
}

function diffDatapool(items: ParsedDatapoolItem[], dbMap: Record<string, { price_per_gb: number|null; status: string }>) {
  const fileKeys = new Set(items.map(i => `${i.vendor_code}:${i.zone_id}`))
  const allNew: ParsedDatapoolItem[] = []
  const allChanged: ChangedDatapoolItem[] = []
  for (const item of items) {
    const key = `${item.vendor_code}:${item.zone_id}`
    const existing = dbMap[key]
    if (!existing) allNew.push(item)
    else if (existing.price_per_gb !== item.price_per_gb) allChanged.push({ item, oldPricePerGb: existing.price_per_gb })
  }
  const allDiscontinuedKeys = Object.entries(dbMap)
    .filter(([key, s]) => s.status === "active" && !fileKeys.has(key))
    .map(([key]) => key)
  return { allNew, allChanged, allDiscontinuedKeys }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = (session.user as any).role as string
  if (role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try { wb = XLSX.read(buffer, { type: "buffer" }) }
  catch { return NextResponse.json({ error: "Cannot parse file" }, { status: 400 }) }

  const format = detectFormat(wb)

  // Parse items
  let readyMadeItems: ParsedWMItem[] = []
  let datapoolItems: ParsedDatapoolItem[] = []
  try {
    if (format === "standard") {
      readyMadeItems = parseStandardReadyMade(wb)
      datapoolItems = parseStandardDatapool(wb)
    } else {
      readyMadeItems = parseWMNative(buffer)
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Parse error: ${e.message}` }, { status: 400 })
  }

  if (!readyMadeItems.length && !datapoolItems.length)
    return NextResponse.json({ error: "Không tìm thấy dữ liệu trong file" }, { status: 400 })

  // Fetch DB state & compute diffs
  const [dbReady, dbDatapool] = await Promise.all([fetchDbReadyMade(), fetchDbDatapool()])

  const { allNew, allChanged, allDiscontinuedIds } = diffReadyMade(readyMadeItems, dbReady)
  const { allNew: dpNew, allChanged: dpChanged, allDiscontinuedKeys: dpDiscontinuedKeys } =
    diffDatapool(datapoolItems, dbDatapool)

  return NextResponse.json({
    format,
    counts: {
      readyMade: { new: allNew.length, changedPrice: allChanged.length, discontinued: allDiscontinuedIds.length, total: readyMadeItems.length },
      datapool:  { new: dpNew.length, changedPrice: dpChanged.length, discontinued: dpDiscontinuedKeys.length, total: datapoolItems.length },
    },
    sample: {
      new: allNew.slice(0, 5),
      changedPrice: allChanged.slice(0, 5),
      discontinuedIds: allDiscontinuedIds.slice(0, 5),
      dpNew: dpNew.slice(0, 5),
      dpChangedPrice: dpChanged.slice(0, 5),
      dpDiscontinuedKeys: dpDiscontinuedKeys.slice(0, 5),
    },
    allNew,
    allChanged: allChanged.map(c => c.item),
    allDiscontinuedIds,
    allDpNew: dpNew,
    allDpChanged: dpChanged.map(c => c.item),
    allDpDiscontinuedKeys: dpDiscontinuedKeys,
    fileName: file.name,
  })
}
