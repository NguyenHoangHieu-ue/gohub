// Utility: probe actual column names from dim_* tables in gohub_dw.
// Dim tables can be rebuilt with renamed columns — querying information_schema
// at runtime lets all API routes adapt without hardcoding names.

import { queryAnalytics } from "@/lib/analytics-db"

interface DimCustomerCols {
  codeCol: string   // column that matches f.customer_code in fact tables
  nameCol: string   // customer display name column
  extraCols: string[]  // all other columns
  allCols: string[]
}

// In-process cache (warm for lifetime of the serverless instance)
let _cachedDimCustomer: DimCustomerCols | null = null
let _cachedAt = 0
const TTL_MS = 60 * 60 * 1000  // 1 h

export async function getDimCustomerCols(): Promise<DimCustomerCols> {
  if (_cachedDimCustomer && Date.now() - _cachedAt < TTL_MS) {
    return _cachedDimCustomer
  }

  const rows = await queryAnalytics<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dim_customer'
     ORDER BY ordinal_position`
  )

  const allCols = rows.map(r => r.column_name)

  // Find the "code" column — the PK that matches f.customer_code in fact tables.
  // Priority: 'code' → 'customer_code' → 'customer_id' → anything ending in _code/_id → first col.
  const codeCol =
    allCols.find(c => c === "code") ??
    allCols.find(c => c === "customer_code") ??
    allCols.find(c => c === "customer_id") ??
    allCols.find(c => c.endsWith("_code") || c.endsWith("_id")) ??
    allCols[0] ??
    "code"

  // Find the "name" column — customer display name.
  // Priority: 'name' → 'customer_name' → 'full_name' → anything containing 'name' → second col.
  const nameCol =
    allCols.find(c => c === "name") ??
    allCols.find(c => c === "customer_name") ??
    allCols.find(c => c === "full_name") ??
    allCols.find(c => c.includes("name")) ??
    allCols[1] ??
    "name"

  const extraCols = allCols.filter(c => c !== codeCol && c !== nameCol)

  const result: DimCustomerCols = { codeCol, nameCol, extraCols, allCols }
  _cachedDimCustomer = result
  _cachedAt = Date.now()
  return result
}

/** Invalidate the dim_customer schema cache (call after admin triggers a sync). */
export function invalidateDimCustomerCache() {
  _cachedDimCustomer = null
  _cachedAt = 0
}
