export type ParsedWMItem = {
  vendor_code?: string          // optional — standard format sets this, WM native defaults to 'WM'
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
  apn?: string | null           // optional — standard format sets this
  network_type?: string | null  // optional — standard format sets this
}

export type ChangedPriceItem = {
  item: ParsedWMItem
  oldCogs: number | null
}

export type ParsedDatapoolItem = {
  vendor_code: string
  zone_id: string
  zone_name: string | null
  countries: string | null
  sim_type: string
  price_per_gb: number | null
  currency: string
  network_type: string | null
  is_kyc: boolean
  notes: string | null
  status: string
}

export type ChangedDatapoolItem = {
  item: ParsedDatapoolItem
  oldPricePerGb: number | null
}
