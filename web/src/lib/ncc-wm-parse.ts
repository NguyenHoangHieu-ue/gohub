import * as XLSX from "xlsx"
import type { ParsedWMItem } from "@/types/ncc-import"

// ── WM native parser (unchanged logic from original import) ──────────────────

export function parseProductName(name: string) {
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

export function parseWMNative(buffer: Buffer): ParsedWMItem[] {
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

