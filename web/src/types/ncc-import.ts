export type ParsedWMItem = {
  vendor_product_id: string
  product_name: string | null
  region: string | null
  sim_type: string | null
  cogs: number | null
  cogs_currency: string
  is_lesim: boolean
  is_kyc: boolean
  status: string
  days: number | null
  data_gb: number | null
  is_daily: boolean
  is_unlimited: boolean
  throttle_kbps: number | null
}

export type ChangedPriceItem = {
  item: ParsedWMItem
  oldCogs: number | null
}
