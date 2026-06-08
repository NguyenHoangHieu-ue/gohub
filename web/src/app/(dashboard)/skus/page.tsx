"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Package, Search, ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZE = 20

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "products" | "skus" | "listings" | "items"

const TABS: { id: TabId; label: string; api: string }[] = [
  { id: "products", label: "Products",  api: "/api/products"  },
  { id: "skus",     label: "SKUs",      api: "/api/skus"      },
  { id: "listings", label: "Listings",  api: "/api/listings"  },
  { id: "items",    label: "Items",     api: "/api/items"     },
]

// ─── Column definitions ───────────────────────────────────────────────────────

const PRODUCT_COLS = [
  { key: "status",                    label: "Status"          },
  { key: "tenant",                    label: "Tenant"          },
  { key: "product_code",              label: "Product Code"    },
  { key: "product_type",              label: "Type"            },
  { key: "vendor_code",               label: "Vendor"          },
  { key: "country_group",             label: "Country Group"   },
  { key: "data_policy_code",          label: "Data Policy"     },
  { key: "kyc_needed",                label: "KYC"             },
  { key: "operator_code",             label: "Operator"        },
  { key: "network_type",              label: "Network"         },
  { key: "apn",                       label: "APN"             },
  { key: "apn_original",              label: "APN Original"    },
  { key: "local_phone_number",        label: "Local Phone"     },
  { key: "hotspot",                   label: "Hotspot"         },
  { key: "purchase_type",             label: "Purchase Type"   },
  { key: "activation_time",           label: "Activation Time" },
  { key: "special_activation_required", label: "Special Activ." },
  { key: "note",                      label: "Note"            },
  { key: "supported_countries",       label: "Countries"       },
]

const SKU_COLS_BASE = [
  { key: "status",              label: "Status"       },
  { key: "tenant",              label: "Tenant"       },
  { key: "sku_code",            label: "SKU Code"     },
  { key: "product_code",        label: "Product Code" },
  { key: "sim_esim",            label: "SIM/eSIM"     },
  { key: "data",                label: "Data"         },
  { key: "days",                label: "Days"         },
  { key: "throttle_speed",      label: "Throttle"     },
  { key: "call",                label: "Call"         },
  { key: "expirations",         label: "Expiration"   },
  { key: "vendor_sku",          label: "Vendor SKU"   },
  { key: "vendor_sku_sim",      label: "Vendor SIM"   },
  { key: "frame",               label: "Frame SKU"    },
  { key: "datapack",            label: "Datapack SKU" },
  { key: "kyc_needed",          label: "KYC"          },
  { key: "supported_countries", label: "Countries"    },
  { key: "country_names",       label: "Country Names"},
  { key: "note",                label: "Note"         },
]
const SKU_COGS_COLS = [
  { key: "latest_cogs",          label: "COGS"     },
  { key: "latest_cogs_currency", label: "Currency" },
]

const LISTING_COLS = [
  { key: "status",                 label: "Status"         },
  { key: "tenant",                 label: "Tenant"         },
  { key: "listing_code",           label: "Listing Code"   },
  { key: "reference_product_code", label: "Product Code"   },
  { key: "listing_type",           label: "Type"           },
  { key: "listing_name_vn",        label: "Tên VN"         },
  { key: "listing_name_en",        label: "Name EN"        },
  { key: "type_of_sim",            label: "SIM/eSIM"       },
  { key: "network_operator",       label: "Operator"       },
  { key: "category_code",          label: "Category"       },
  { key: "data_type_en",           label: "Data Type"      },
  { key: "supported_countries",    label: "Countries"      },
  { key: "expirations_en",         label: "Expiration"     },
  { key: "kyc_needed_en",          label: "KYC"            },
  { key: "hotspot_en",             label: "Hotspot"        },
  { key: "apn",                    label: "APN"            },
  { key: "call_en",                label: "Call"           },
  { key: "local_phone_number_en",  label: "Local Phone"    },
  { key: "top_up_options_en",      label: "Top-Up"         },
  { key: "unsupported_apps_en",    label: "No Apps"        },
  { key: "telco_perks_en",         label: "Perks"          },
  { key: "activation_en",          label: "Activation"     },
  { key: "activation_links_en",    label: "Activ. Links"   },
  { key: "note_vn",                label: "Note VN"        },
  { key: "note_en",                label: "Note EN"        },
]

const ITEM_COLS = [
  { key: "status",         label: "Status"      },
  { key: "tenant",         label: "Tenant"      },
  { key: "item_code",      label: "Item Code"   },
  { key: "alias",          label: "Alias"       },
  { key: "sku_code",       label: "SKU Code"    },
  { key: "listing_code",   label: "Listing Code"},
  { key: "item_type",      label: "Item Type"   },
  { key: "sales_channel",  label: "Channel"     },
  { key: "category_code",  label: "Category"    },
  { key: "item_name_vn",   label: "Tên VN"      },
  { key: "item_name_en",   label: "Name EN"     },
  { key: "data",           label: "Data"        },
  { key: "days",           label: "Days"        },
  { key: "throttle_speed_en", label: "Throttle" },
  { key: "call_en",        label: "Call"        },
  { key: "unitprice",      label: "Giá bán"     },
  { key: "currency",       label: "Currency"    },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-300">—</span>
  const active = value === "Active"
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
      {value}
    </span>
  )
}

function KycBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300">—</span>
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${value === "Yes" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>
      {value}
    </span>
  )
}

function TruncateCell({ value, mono = false }: { value: string | null; mono?: boolean }) {
  if (!value) return <span className="text-gray-300">—</span>
  return (
    <span className={`${mono ? "font-mono text-brand-700" : ""}`} title={value}>
      {value}
    </span>
  )
}

function Pagination({ page, totalPages, total, onPrev, onNext }: {
  page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void
}) {
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to   = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-400">
        {total === 0 ? "0 records" : `${from}–${to} / ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-gray-600 px-2">{page} / {totalPages}</span>
        <button onClick={onNext} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function FilterBar({
  search, onSearch, tenant, onTenant,
  status, onStatus, statusDefault,
  extra,
}: {
  search: string; onSearch: (v: string) => void
  tenant: string; onTenant: (v: string) => void
  status: string; onStatus: (v: string) => void
  statusDefault?: string
  extra?: React.ReactNode
}) {
  return (
    <div className="flex gap-3 flex-wrap items-end">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:bg-white bg-gray-50 transition"
        />
      </div>
      <select value={tenant} onChange={e => onTenant(e.target.value)}
        className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
        <option value="">All Tenants</option>
        <option value="US">US</option>
        <option value="VN">VN</option>
      </select>
      <select value={status} onChange={e => onStatus(e.target.value)}
        className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
        {statusDefault === "Active" ? (
          <>
            <option value="Active">Active</option>
            <option value="">All Status</option>
            <option value="Inactive">Inactive</option>
          </>
        ) : (
          <>
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </>
        )}
      </select>
      {extra}
    </div>
  )
}

// ─── Tab state hook ───────────────────────────────────────────────────────────

function useTabData(apiPath: string, opts?: { defaultStatus?: string }) {
  const [rows,       setRows]       = useState<any[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState("")
  const [query,      setQuery]      = useState("")
  const [tenant,     setTenant]     = useState("")
  const [status,     setStatus]     = useState(opts?.defaultStatus ?? "")
  const [extraQuery, setExtraQuery] = useState("")   // serialized extra params (for SKU filters)

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), search: query })
      if (tenant) p.set("tenant", tenant)
      if (status) p.set("status", status)
      if (extraQuery) {
        new URLSearchParams(extraQuery).forEach((v, k) => p.set(k, v))
      }
      const res  = await fetch(`${apiPath}?${p}`)
      const json = await res.json()
      setRows(json.data  ?? [])
      setTotal(json.total ?? 0)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [apiPath, page, query, tenant, status, extraQuery])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setQuery(search); setPage(1) }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return {
    rows, total, page, loading, search, tenant, status, totalPages,
    setSearch, setExtraQuery,
    setTenant: (v: string) => { setTenant(v); setPage(1) },
    setStatus: (v: string) => { setStatus(v); setPage(1) },
    prevPage:  () => setPage(p => Math.max(1, p - 1)),
    nextPage:  () => setPage(p => Math.min(totalPages, p + 1)),
  }
}

// ─── Sub-table components ─────────────────────────────────────────────────────

function ProductsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const d = useTabData("/api/products")
  return (
    <div className="space-y-3">
      <FilterBar search={d.search} onSearch={d.setSearch} tenant={d.tenant} onTenant={d.setTenant} status={d.status} onStatus={d.setStatus} />
      <TableShell cols={PRODUCT_COLS} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.product_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => <ProductCell key={col.key} col={col.key} row={row} />)}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />
    </div>
  )
}

function ProductCell({ col, row }: { col: string; row: any }) {
  const v = row[col]
  if (col === "status")       return <td className="px-3 py-2 whitespace-nowrap"><StatusBadge value={v} /></td>
  if (col === "tenant")       return <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{v || "—"}</td>
  if (col === "product_code") return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700">{v}</td>
  if (col === "kyc_needed")   return <td className="px-3 py-2 whitespace-nowrap"><KycBadge value={v} /></td>
  if (col === "note")         return <td className="px-3 py-2 text-xs text-gray-600 max-w-[240px] leading-relaxed">{v || <span className="text-gray-300">—</span>}</td>
  if (col === "supported_countries") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const codes = v.split(/[,\s]+/).filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs font-mono text-gray-500" title={v}>
        {codes.slice(0, 4).join(", ")}{codes.length > 4 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{codes.length - 4}</span>}
      </td>
    )
  }
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

function SkusTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [pPt, setPPt]           = useState("")
  const [pPtype, setPPtype]     = useState("")
  const [pCountry, setPCountry] = useState("")
  const [pVendor, setPVendor]   = useState("")
  const [pDtype, setPDtype]     = useState("")
  const [pData, setPData]       = useState("")
  const [pDays, setPDays]       = useState("")

  const d = useTabData("/api/skus")

  const applySkuFilters = () => {
    const p = new URLSearchParams()
    if (pPt)      p.set("pt",      pPt)
    if (pPtype)   p.set("ptype",   pPtype)
    if (pCountry) p.set("country", pCountry)
    if (pVendor)  p.set("vendor",  pVendor)
    if (pDtype)   p.set("dtype",   pDtype)
    if (pData)    p.set("data",    pData)
    if (pDays)    p.set("days",    pDays)
    d.setExtraQuery(p.toString())
  }
  const clearSkuFilters = () => {
    setPPt(""); setPPtype(""); setPCountry(""); setPVendor(""); setPDtype(""); setPData(""); setPDays("")
    d.setExtraQuery("")
  }
  const hasSkuFilter = !!(pPt || pPtype || pCountry || pVendor || pDtype || pData || pDays)

  const cols = canSeeCost
    ? [...SKU_COLS_BASE.slice(0, 13), ...SKU_COGS_COLS, ...SKU_COLS_BASE.slice(13)]
    : SKU_COLS_BASE

  return (
    <div className="space-y-3">
      <FilterBar search={d.search} onSearch={d.setSearch} tenant={d.tenant} onTenant={d.setTenant} status={d.status} onStatus={d.setStatus} />
      {/* SKU code filter */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          SKU Code Filter — <span className="font-normal normal-case">[PurchaseType · ProductType · Country · Vendor · DataType · DataAmount · DayAmount]</span>
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          {[
            { label: "Purchase Type", pos: "pos 1",    val: pPt,      set: setPPt,      ph: "1-6, A-E" },
            { label: "Product Type",  pos: "pos 2",    val: pPtype,   set: setPPtype,   ph: "C, E..."  },
            { label: "Country",       pos: "pos 3–5",  val: pCountry, set: setPCountry, ph: "TWN"      },
            { label: "Vendor",        pos: "pos 6–7",  val: pVendor,  set: setPVendor,  ph: "WM"       },
            { label: "Data Policy",   pos: "pos 8",    val: pDtype,   set: setPDtype,   ph: "F"        },
            { label: "Data Amount",   pos: "pos 9–11", val: pData,    set: setPData,    ph: "UNL"      },
            { label: "Day Amount",    pos: "pos 12–13",val: pDays,    set: setPDays,    ph: "07"       },
          ].map(f => (
            <div key={f.label} className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-[11px] font-semibold text-gray-500">
                {f.label} <span className="text-gray-300 font-normal">{f.pos}</span>
              </label>
              <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white" />
            </div>
          ))}
          <div className="flex gap-2 pb-0.5">
            <button onClick={applySkuFilters}
              className="px-4 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-500 transition-colors">
              Tìm
            </button>
            {hasSkuFilter && (
              <button onClick={clearSkuFilters}
                className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">
                Xóa
              </button>
            )}
          </div>
        </div>
      </div>
      <TableShell cols={cols} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.sku_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => <SkuCell key={col.key} col={col.key} row={row} canSeeCost={canSeeCost} />)}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />
    </div>
  )
}

function SkuCell({ col, row, canSeeCost }: { col: string; row: any; canSeeCost: boolean }) {
  const v = row[col]
  if (col === "status")       return <td className="px-3 py-2 whitespace-nowrap"><StatusBadge value={v} /></td>
  if (col === "tenant")       return <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{v || "—"}</td>
  if (col === "sku_code")     return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700">{v}</td>
  if (col === "product_code") return <td className="px-3 py-2 whitespace-nowrap text-xs">{v}</td>
  if (col === "data") {
    const amt = row.data_amount
    const unit = row.data_amount_unit ?? "GB"
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{amt != null ? `${amt}${unit}` : "—"}</td>
  }
  if (col === "days") {
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{row.day_amount != null ? `${row.day_amount} ${row.day_amount_unit ?? "d"}` : "—"}</td>
  }
  if (col === "kyc_needed")   return <td className="px-3 py-2 whitespace-nowrap"><KycBadge value={v} /></td>
  if (col === "latest_cogs")  return <td className="px-3 py-2 whitespace-nowrap text-xs text-right">{v != null ? Number(v).toLocaleString() : "—"}</td>
  if (col === "supported_countries") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const codes = v.split(/[,\s]+/).filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs font-mono text-gray-500" title={v}>
        {codes.slice(0, 4).join(", ")}{codes.length > 4 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{codes.length - 4}</span>}
      </td>
    )
  }
  if (col === "country_names") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const names = v.split(", ").filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs text-gray-600" title={v}>
        {names.slice(0, 2).join(", ")}{names.length > 2 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{names.length - 2}</span>}
      </td>
    )
  }
  if (col === "note") return <td className="px-3 py-2 text-xs text-gray-600 min-w-[160px] max-w-[280px] leading-relaxed">{v || <span className="text-gray-300">—</span>}</td>
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

function ListingsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const d = useTabData("/api/listings")
  return (
    <div className="space-y-3">
      <FilterBar search={d.search} onSearch={d.setSearch} tenant={d.tenant} onTenant={d.setTenant} status={d.status} onStatus={d.setStatus} />
      <TableShell cols={LISTING_COLS} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.listing_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => <ListingCell key={col.key} col={col.key} row={row} />)}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />
    </div>
  )
}

function ListingCell({ col, row }: { col: string; row: any }) {
  const v = row[col]
  if (col === "status")           return <td className="px-3 py-2 whitespace-nowrap"><StatusBadge value={v} /></td>
  if (col === "tenant")           return <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{v || "—"}</td>
  if (col === "listing_code")     return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700">{v}</td>
  if (col === "reference_product_code") return <td className="px-3 py-2 whitespace-nowrap text-xs font-mono">{v || "—"}</td>
  if (col === "kyc_needed_en")    return <td className="px-3 py-2 whitespace-nowrap"><KycBadge value={v} /></td>
  if (col === "listing_name_vn" || col === "listing_name_en")
    return <td className="px-3 py-2 text-xs text-gray-700 min-w-[160px] max-w-[240px]">{v || <span className="text-gray-300">—</span>}</td>
  if (col === "activation_en" || col === "activation_links_en" || col === "top_up_options_en" ||
      col === "unsupported_apps_en" || col === "telco_perks_en" || col === "note_vn" || col === "note_en")
    return <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] leading-relaxed">{v || <span className="text-gray-300">—</span>}</td>
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

function ItemsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const d = useTabData("/api/items", { defaultStatus: "Active" })
  return (
    <div className="space-y-3">
      <FilterBar search={d.search} onSearch={d.setSearch} tenant={d.tenant} onTenant={d.setTenant} status={d.status} onStatus={d.setStatus} statusDefault="Active" />
      <TableShell cols={ITEM_COLS} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.item_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => <ItemCell key={col.key} col={col.key} row={row} />)}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />
    </div>
  )
}

function ItemCell({ col, row }: { col: string; row: any }) {
  const v = row[col]
  if (col === "status")       return <td className="px-3 py-2 whitespace-nowrap"><StatusBadge value={v} /></td>
  if (col === "tenant")       return <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{v || "—"}</td>
  if (col === "item_code")    return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-600">{v}</td>
  if (col === "alias")        return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700 font-semibold">{v || <span className="text-gray-300 font-normal">—</span>}</td>
  if (col === "sku_code")     return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{v || "—"}</td>
  if (col === "listing_code") return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{v || "—"}</td>
  if (col === "data") {
    const amt = row.data_amount; const unit = row.data_amount_unit ?? "GB"
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{amt != null ? `${amt}${unit}` : "—"}</td>
  }
  if (col === "days") {
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{row.day_amount != null ? `${row.day_amount} ${row.day_amount_unit ?? "d"}` : "—"}</td>
  }
  if (col === "unitprice") return <td className="px-3 py-2 whitespace-nowrap text-xs text-right">{v != null ? Number(v).toLocaleString() : "—"}</td>
  if (col === "item_name_vn" || col === "item_name_en")
    return <td className="px-3 py-2 text-xs text-gray-700 min-w-[140px] max-w-[220px]">{v || <span className="text-gray-300">—</span>}</td>
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

// ─── Shared table shell ───────────────────────────────────────────────────────

function TableShell({ cols, rows, loading, renderRow }: {
  cols: { key: string; label: string }[]
  rows: any[]
  loading: boolean
  renderRow: (row: any, cols: { key: string; label: string }[]) => React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {cols.map(h => (
                <th key={h.key} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap select-none">
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {cols.map(c => (
                    <td key={c.key} className="px-3 py-2.5">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (i * 17 + c.key.length * 3) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-sm text-gray-400">Không có dữ liệu</td></tr>
            ) : rows.map(row => renderRow(row, cols))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkusPage() {
  const { data: session } = useSession()
  const role       = (session?.user as any)?.role || "standard"
  const canSeeCost = role === "admin" || role === "manager"

  const [activeTab, setActiveTab] = useState<TabId>("products")

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Package size={20} className="text-brand-600" />
        <h1 className="text-xl font-semibold text-gray-900">SP Hệ Thống</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === t.id
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "products" && <ProductsTable canSeeCost={canSeeCost} />}
      {activeTab === "skus"     && <SkusTable     canSeeCost={canSeeCost} />}
      {activeTab === "listings" && <ListingsTable canSeeCost={canSeeCost} />}
      {activeTab === "items"    && <ItemsTable    canSeeCost={canSeeCost} />}
    </div>
  )
}
