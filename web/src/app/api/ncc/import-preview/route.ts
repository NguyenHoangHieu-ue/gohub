import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import * as XLSX from "xlsx"
import type { ParsedWMItem, ChangedPriceItem } from "@/types/ncc-import"

export const maxDuration = 60

function parseProductName(name: string) {
  const result = {
    days: null as number | null,
    data_gb: null as number | null,
    is_daily: false,
    is_unlimited: false,
    throttle_kbps: null as number | null,
  }

  const dayM = name.match(/(\d+)\s*[Dd]ays?/)
  if (dayM) result.days = parseInt(dayM[1])

  if (/[Tt]itanium\s+AYCE/.test(name)) {
    result.is_unlimited = true
    return result
  }
  if (/[Pp]remium\s+[Uu]nlimited/.test(name)) {
    return { ...result, is_unlimited: true, data_gb: 1.0, is_daily: true, throttle_kbps: 10000 }
  }
  if (/[Uu]nlimited/.test(name)) {
    return { ...result, is_unlimited: true, data_gb: 2.0, is_daily: true, throttle_kbps: 5000 }
  }

  const gbM = name.match(/([\d.]+)\s*GB\s*(\/day)?/i)
  if (gbM) {
    result.data_gb = parseFloat(gbM[1])
    result.is_daily = !!gbM[2]
  }

  if (result.data_gb === null) {
    const mbM = name.match(/([\d.]+)\s*MB\s*(\/day)?/i)
    if (mbM) {
      result.data_gb = Math.round((parseFloat(mbM[1]) / 1000) * 10000) / 10000
      result.is_daily = !!mbM[2]
    }
  }

  const kbpsM = name.match(/(\d+)\s*kbps/i)
  if (kbpsM) result.throttle_kbps = parseInt(kbpsM[1])
  else {
    const mbpsM = name.match(/([\d.]+)\s*[Mm]bps/i)
    if (mbpsM) result.throttle_kbps = Math.round(parseFloat(mbpsM[1]) * 1000)
  }

  if (result.throttle_kbps === null && !result.is_unlimited) result.throttle_kbps = 128

  return result
}

function parseWMFile(buffer: Buffer): ParsedWMItem[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" })

  const items: ParsedWMItem[] = []
  for (const r of rows) {
    const norm: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) {
      norm[String(k).toLowerCase().trim()] = String(v ?? "").trim()
    }

    const id =
      norm["wmproductid"] ||
      norm["vendor_product_id"] ||
      norm["product id"] ||
      norm["id"] ||
      ""
    if (!id) continue

    const name = norm["product name"] || norm["productname"] || norm["name"] || ""
    const region = norm["region"] || null
    const simType = norm["type"] || norm["sim_type"] || null
    const cogsRaw =
      norm["cost price (nt)"] ||
      norm["cost price(nt)"] ||
      norm["cost price"] ||
      norm["cogs"] ||
      ""
    const cogs = cogsRaw ? parseFloat(cogsRaw) || null : null
    const isLesim =
      (norm["lesim"] || norm["is_lesim"] || "").toUpperCase() === "Y"

    const parsed = parseProductName(name)

    items.push({
      vendor_product_id: id,
      product_name: name || null,
      region: region || null,
      sim_type: simType || null,
      cogs,
      cogs_currency: "TWD",
      is_lesim: isLesim,
      is_kyc: false,
      status: "active",
      ...parsed,
    })
  }
  return items
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = (session.user as any).role as string
  if (role !== "admin" && role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let items: ParsedWMItem[]
  try {
    items = parseWMFile(buffer)
  } catch {
    return NextResponse.json(
      { error: "Cannot parse file. Accepted formats: CSV, XLSX" },
      { status: 400 }
    )
  }

  if (!items.length)
    return NextResponse.json({ error: "No products found in file" }, { status: 400 })

  // Fetch current DB state (all products, any status)
  const dbMap: Record<string, { cogs: number | null; status: string }> = {}
  for (let off = 0; ; off += 1000) {
    const { data: batch } = await (supabaseAdmin.from("ncc_worldmove") as any)
      .select("vendor_product_id,cogs,status")
      .range(off, off + 999)
    if (!batch?.length) break
    for (const r of batch)
      dbMap[r.vendor_product_id] = { cogs: r.cogs, status: r.status }
    if (batch.length < 1000) break
  }

  const fileIds = new Set(items.map((i) => i.vendor_product_id))

  const allNew: ParsedWMItem[] = []
  const allChanged: ChangedPriceItem[] = []

  for (const item of items) {
    const existing = dbMap[item.vendor_product_id]
    if (!existing) {
      allNew.push(item)
    } else if (existing.cogs !== item.cogs) {
      allChanged.push({ item, oldCogs: existing.cogs })
    }
  }

  const allDiscontinuedIds: string[] = []
  for (const [id, state] of Object.entries(dbMap)) {
    if (state.status === "active" && !fileIds.has(id)) {
      allDiscontinuedIds.push(id)
    }
  }

  return NextResponse.json({
    counts: {
      new: allNew.length,
      changedPrice: allChanged.length,
      discontinued: allDiscontinuedIds.length,
      total: items.length,
    },
    sample: {
      new: allNew.slice(0, 5),
      changedPrice: allChanged.slice(0, 5),
      discontinuedIds: allDiscontinuedIds.slice(0, 5),
    },
    allNew,
    allChanged: allChanged.map((c) => c.item),
    allDiscontinuedIds,
    fileName: file.name,
  })
}
