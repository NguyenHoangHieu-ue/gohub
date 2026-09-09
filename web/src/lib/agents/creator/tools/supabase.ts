import { supabaseAdmin }                    from "@/lib/supabase"
import { SUPABASE_TABLES, SENSITIVE_TABLES } from "@/lib/agents/data-explorer"

const ALLOWED_OPS  = new Set(["eq","neq","gt","gte","lt","lte","like","ilike","in","is"])
const HEAVY_COL_RE = /embedding|vector/i
export const ALL_TABLES = { ...SUPABASE_TABLES, ...SENSITIVE_TABLES }

export async function runQuerySupabase(args: any): Promise<any> {
  const table: string = String(args?.table || "").trim()
  if (!ALL_TABLES[table]) return { error: `Table "${table}" not found. Call listSupabaseTables for valid names.` }

  const columns   = (args?.columns && String(args.columns).trim()) || "*"
  const limit     = Math.min(Math.max(parseInt(args?.limit) || 50, 1), 200)
  const countOnly = args?.countOnly === true
  try {
    let q: any = supabaseAdmin.from(table).select(countOnly ? "*" : columns, { count: "exact", head: countOnly })
    if (Array.isArray(args?.filters)) {
      for (const f of args.filters) {
        const op = String(f?.op || "").toLowerCase()
        if (!ALLOWED_OPS.has(op) || !f?.column) continue
        if (op === "in") q = q.in(f.column, String(f.value).split(",").map((s: string) => s.trim()))
        else if (op === "is") q = q.is(f.column, f.value === "null" ? null : f.value)
        else q = q.filter(f.column, op, f.value)
      }
    }
    if (!countOnly) {
      if (args?.order) q = q.order(String(args.order), { ascending: args?.ascending === true })
      q = q.limit(limit)
    }
    const { data, count, error } = await q
    if (error) return { error: error.message }
    if (countOnly) return { count }
    const rows = ((data as any[]) || []).map(r => {
      const clone: any = {}
      for (const k of Object.keys(r)) { if (!HEAVY_COL_RE.test(k)) clone[k] = r[k] }
      return clone
    })
    return { rows, rowCount: rows.length, total: count }
  } catch (e: any) { return { error: e.message } }
}

export async function runQueryProduct(args: any): Promise<any> {
  try {
    const code: string = (args.sku_code || args.product_code || "").trim().toUpperCase()
    let prodResult: any = null
    if (code.length === 13) {
      const { data } = await supabaseAdmin.from("skus").select("sku_code,sku_ref,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,day_amount_unit,parents,frame,datapack,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,vendor_sku_sim,latest_cogs,latest_cogs_currency,original_cost,reference_cost_vnd,final_cogs_included_vat_vnd,final_cogs_usd,expirations,wr_group,note").eq("sku_code", code).maybeSingle()
      prodResult = data
    } else if (code.length === 8) {
      const { data } = await supabaseAdmin.from("products").select("product_code,product_ref,status,tenant,sim_esim,product_type,vendor,vendor_code,data_policy_code,gc_purchase_type,sku_type,data_type,import_type,supported_countries,country_group,daily_reset_time,activation_time,network_type,onsite_carrier,local_phone_number,local_number_country,hotspot,kyc_code,kyc_needed,top_up_options,base_sim_esim_sku_code,apn,apn_original,telco_perks,note").eq("product_code", code).maybeSingle()
      prodResult = data
    }
    return prodResult ?? { error: "Product not found" }
  } catch (e: any) { return { error: e.message } }
}
