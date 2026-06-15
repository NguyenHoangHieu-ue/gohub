"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Package, Search, ChevronLeft, ChevronRight, X, ChevronDown, Download, Loader2 } from "lucide-react"
import * as XLSX from "xlsx"

const PAGE_SIZE = 20

// ─── Tab defs ─────────────────────────────────────────────────────────────────

type TabId = "products" | "skus" | "listings" | "items"

const TABS: { id: TabId; label: string }[] = [
  { id: "products", label: "Sản Phẩm" },
  { id: "skus",     label: "SKU"      },
  { id: "listings", label: "Listing"  },
  { id: "items",    label: "Item"     },
]

// ─── Column defs ─────────────────────────────────────────────────────────────

const PRODUCT_TABLE_COLS = [
  { key: "status",              label: "Status"       },
  { key: "tenant",              label: "Tenant"       },
  { key: "product_code",        label: "Product Code" },
  { key: "product_type",        label: "Type"         },
  { key: "type_of_sim",         label: "SIM/eSIM"     },
  { key: "vendor_code",         label: "Vendor"       },
  { key: "operator_code",       label: "Operator"     },
  { key: "kyc_needed",          label: "KYC"          },
  { key: "supported_countries", label: "Countries"    },
  { key: "note",                label: "Note"         },
  { key: "_detail",             label: ""             },
]

const PRODUCT_MODAL_FIELDS = [
  { key: "product_code",        label: "Product Code"    },
  { key: "tenant",              label: "Tenant"          },
  { key: "status",              label: "Status"          },
  { key: "product_type",        label: "Type"            },
  { key: "type_of_sim",         label: "SIM/eSIM"        },
  { key: "vendor_code",         label: "Vendor"          },
  { key: "operator_code",       label: "Operator"        },
  { key: "purchase_type",       label: "Purchase Type"   },
  { key: "network_type",        label: "Network"         },
  { key: "kyc_needed",          label: "KYC"             },
  { key: "apn",                 label: "APN"             },
  { key: "apn_original",        label: "APN Original"    },
  { key: "local_phone_number",  label: "Local Phone"     },
  { key: "hotspot",             label: "Hotspot"         },
  { key: "activation_time",     label: "Activation Time" },
  { key: "data_plan_type",      label: "Data Plan"       },
  { key: "supported_countries", label: "Countries"       },
  { key: "note",                label: "Note"            },
]

const SKU_COLS_BASE = [
  { key: "status",              label: "Status"        },
  { key: "tenant",              label: "Tenant"        },
  { key: "sku_code",            label: "SKU Code"      },
  { key: "product_code",        label: "Product Code"  },
  { key: "sim_esim",            label: "SIM/eSIM"      },
  { key: "data",                label: "Data"          },
  { key: "days",                label: "Days"          },
  { key: "throttle_speed",      label: "Throttle"      },
  { key: "call",                label: "Call"          },
  { key: "expirations",         label: "Expiration"    },
  { key: "vendor_sku",          label: "Vendor SKU"    },
  { key: "vendor_sku_sim",      label: "Vendor SIM"    },
  { key: "frame",               label: "Frame SKU"     },
  { key: "datapack",            label: "Datapack SKU"  },
  { key: "kyc_needed",          label: "KYC"           },
  { key: "supported_countries", label: "Countries"     },
  { key: "country_names",       label: "Country Names" },
  { key: "note",                label: "Note"          },
]
const SKU_COGS_COLS = [
  { key: "latest_cogs",          label: "COGS"     },
  { key: "latest_cogs_currency", label: "Currency" },
]

const SKU_MODAL_FIELDS_BASE = [
  { key: "sku_code",            label: "SKU Code"       },
  { key: "product_code",        label: "Product Code"   },
  { key: "tenant",              label: "Tenant"         },
  { key: "status",              label: "Status"         },
  { key: "sim_esim",            label: "SIM/eSIM"       },
  { key: "data_amount",         label: "Data Amount"    },
  { key: "data_amount_unit",    label: "Data Unit"      },
  { key: "day_amount",          label: "Days"           },
  { key: "day_amount_unit",     label: "Day Unit"       },
  { key: "throttle_speed",      label: "Throttle"       },
  { key: "call",                label: "Call"           },
  { key: "expirations",         label: "Expiration"     },
  { key: "vendor_sku",          label: "Vendor SKU"     },
  { key: "vendor_sku_sim",      label: "Vendor SIM"     },
  { key: "frame",               label: "Frame SKU"      },
  { key: "datapack",            label: "Datapack SKU"   },
  { key: "kyc_needed",          label: "KYC"            },
  { key: "supported_countries", label: "Countries"      },
  { key: "country_names",       label: "Country Names"  },
  { key: "note",                label: "Note"           },
]

const LISTING_TABLE_COLS = [
  { key: "status",                 label: "Status"       },
  { key: "tenant",                 label: "Tenant"       },
  { key: "listing_code",           label: "Listing Code" },
  { key: "reference_product_code", label: "Product Code" },
  { key: "listing_type",           label: "Type"         },
  { key: "listing_name_vn",        label: "Tên VN"       },
  { key: "type_of_sim",            label: "SIM/eSIM"     },
  { key: "network_operator",       label: "Operator"     },
  { key: "kyc_needed_en",          label: "KYC"          },
  { key: "_detail",                label: ""             },
]

const LISTING_MODAL_FIELDS = [
  { key: "listing_code",           label: "Listing Code"  },
  { key: "reference_product_code", label: "Product Code"  },
  { key: "tenant",                 label: "Tenant"        },
  { key: "status",                 label: "Status"        },
  { key: "listing_type",           label: "Type"          },
  { key: "listing_name_vn",        label: "Tên VN"        },
  { key: "listing_name_en",        label: "Name EN"       },
  { key: "type_of_sim",            label: "SIM/eSIM"      },
  { key: "product_type",           label: "Product Type"  },
  { key: "network_operator",       label: "Operator"      },
  { key: "category_code",          label: "Category"      },
  { key: "data_type_en",           label: "Data Type"     },
  { key: "expirations_en",         label: "Expiration"    },
  { key: "kyc_needed_en",          label: "KYC"           },
  { key: "hotspot_en",             label: "Hotspot"       },
  { key: "apn",                    label: "APN"           },
  { key: "call_en",                label: "Call"          },
  { key: "local_phone_number_en",  label: "Local Phone"   },
  { key: "top_up_options_en",      label: "Top-Up"        },
  { key: "unsupported_apps_en",    label: "No Apps"       },
  { key: "telco_perks_en",         label: "Perks"         },
  { key: "activation_en",          label: "Activation"    },
  { key: "activation_links_en",    label: "Activ. Links"  },
  { key: "note_vn",                label: "Note VN"       },
  { key: "note_en",                label: "Note EN"       },
]

const ITEM_COLS = [
  { key: "status",           label: "Status"    },
  { key: "tenant",           label: "Tenant"    },
  { key: "item_code",        label: "Item Code" },
  { key: "alias",            label: "Alias"     },
  { key: "sku_code",         label: "SKU Code"  },
  { key: "listing_code",     label: "Listing"   },
  { key: "item_type",        label: "Type"      },
  { key: "item_name_vn",     label: "Tên VN"    },
  { key: "data",             label: "Data"      },
  { key: "days",             label: "Days"      },
  { key: "unitprice",        label: "Giá bán"   },
  { key: "currency",         label: "Currency"  },
  { key: "_detail",          label: ""          },
]

const ITEM_MODAL_FIELDS = [
  { key: "item_code",        label: "Item Code"     },
  { key: "alias",            label: "Alias"         },
  { key: "sku_code",         label: "SKU Code"      },
  { key: "listing_code",     label: "Listing Code"  },
  { key: "tenant",           label: "Tenant"        },
  { key: "status",           label: "Status"        },
  { key: "item_type",        label: "Type"          },
  { key: "sales_channel",    label: "Channel"       },
  { key: "category_code",    label: "Category"      },
  { key: "item_name_vn",     label: "Tên VN"        },
  { key: "item_name_en",     label: "Name EN"       },
  { key: "data_amount",      label: "Data Amount"   },
  { key: "data_amount_unit", label: "Data Unit"     },
  { key: "day_amount",       label: "Days"          },
  { key: "day_amount_unit",  label: "Day Unit"      },
  { key: "throttle_speed_en",label: "Throttle"      },
  { key: "call_en",          label: "Call"          },
  { key: "unitprice",        label: "Giá bán"       },
  { key: "currency",         label: "Currency"      },
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

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ row, onClose, title, fields }: {
  row: any
  onClose: () => void
  title: string
  fields: { key: string; label: string }[]
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {fields.map(f => {
              const v = row[f.key]
              if (!v && v !== 0) return null
              return (
                <div key={f.key} className="flex flex-col gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{f.label}</dt>
                  <dd className="text-xs text-gray-800 leading-relaxed break-words">{String(v)}</dd>
                </div>
              )
            })}
          </dl>
        </div>
      </div>
    </div>
  )
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function fetchAllPages(apiPath: string, params: URLSearchParams): Promise<any[]> {
  const result: any[] = []
  let page = 1
  while (true) {
    const p = new URLSearchParams(params)
    p.set("page", String(page))
    const res = await fetch(`${apiPath}?${p}`)
    const json = await res.json()
    const data = json.data ?? []
    result.push(...data)
    if (result.length >= (json.total ?? 0) || data.length === 0) break
    page++
  }
  return result
}

function downloadXlsx(data: any[], columns: { key: string; label: string }[], filename: string) {
  const rows = data.map(row => {
    const obj: Record<string, any> = {}
    for (const col of columns) {
      const v = row[col.key]
      obj[col.label] = v != null ? String(v) : ""
    }
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  XLSX.writeFile(wb, filename)
}

function ExportBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-50 whitespace-nowrap">
      {loading ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}
      {loading ? "Đang xuất..." : "Export XLSX"}
    </button>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  search, onSearch, tenant, onTenant,
  status, onStatus, statusDefault,
  extra, hasExtra, onReset,
}: {
  search: string; onSearch: (v: string) => void
  tenant: string; onTenant: (v: string) => void
  status: string; onStatus: (v: string) => void
  statusDefault?: string
  extra?: React.ReactNode
  hasExtra?: boolean
  onReset?: () => void
}) {
  const hasFilter = !!(search || tenant || status !== (statusDefault ?? "") || hasExtra)
  const reset = () => {
    onSearch(""); onTenant(""); onStatus(statusDefault ?? "")
    onReset?.()
  }
  return (
    <div className="flex gap-2 items-end flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 focus:bg-white transition" />
      </div>
      <ComboFilter label="Tenant" value={tenant} onChange={onTenant} width="w-20"
        options={["US","VN"]} />
      <ComboFilter label="Status" value={status} onChange={onStatus} width="w-24"
        options={["Active","Inactive"]} />
      {extra}
      {hasFilter && (
        <button onClick={reset}
          className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap">
          Reset
        </button>
      )}
    </div>
  )
}

function ComboFilter({ label, value, onChange, width = "w-28", options, small = false }: {
  label: string; value: string; onChange: (v: string) => void
  width?: string; options: string[]; small?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const visible = open
    ? options.filter(o => !value || o.toLowerCase().includes(value.toLowerCase()))
    : []

  const sz = small
    ? "px-2 py-1.5 text-xs"
    : "px-2.5 py-1.5 text-sm"

  return (
    <div ref={wrapRef} className={`relative flex flex-col gap-0.5 ${width}`}>
      <label className="text-[10px] text-gray-400 font-medium px-0.5">{label}</label>
      <div className="relative">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Tất cả"
          className={`w-full ${sz} border border-gray-200 rounded-lg bg-white pr-6 focus:outline-none focus:ring-2 focus:ring-brand-300 transition`}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
          <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-100 rounded-xl shadow-xl overflow-y-auto max-h-52 w-full min-w-[110px]">
          <button
            type="button"
            onMouseDown={() => { onChange(""); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-[11px] text-gray-400 hover:bg-gray-50 border-b border-gray-50 transition-colors">
            — Tất cả —
          </button>
          {visible.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={() => { onChange(o); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors font-mono ${
                value === o
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}>
              {o}
            </button>
          ))}
          {visible.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-gray-400">Không tìm thấy</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Filter options hook (fetch once on mount) ───────────────────────────────

function useFilterOpts(url: string) {
  const [opts, setOpts] = useState<Record<string, string[]>>({})
  useEffect(() => {
    fetch(url).then(r => r.json()).then(setOpts).catch(() => {})
  }, [url])
  return opts
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
  const [extraQuery, setExtraQuery] = useState("")

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), search: query })
      if (tenant) p.set("tenant", tenant)
      if (status) p.set("status", status)
      if (extraQuery) new URLSearchParams(extraQuery).forEach((v, k) => p.set(k, v))
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

// ─── TableShell ───────────────────────────────────────────────────────────────

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
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-sm text-gray-400">
                  Không có dữ liệu
                </td>
              </tr>
            ) : rows.map(row => renderRow(row, cols))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Products table ───────────────────────────────────────────────────────────

function ProductsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [pPt,       setPPt]       = useState("")
  const [pPtype,    setPPtype]    = useState("")
  const [pCountry,  setPCountry]  = useState("")
  const [pVendor,   setPVendor]   = useState("")
  const [pDtype,    setPDtype]    = useState("")
  const [pVendorF,  setPVendorF]  = useState("")
  const [pOperator, setPOperator] = useState("")
  const [detailRow, setDetailRow] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  const opts = useFilterOpts("/api/products/filters")
  const d = useTabData("/api/products")

  const clearFilters = () => {
    setPPt(""); setPPtype(""); setPCountry(""); setPVendor("")
    setPDtype(""); setPVendorF(""); setPOperator("")
  }
  const hasFilter = !!(pPt || pPtype || pCountry || pVendor || pDtype || pVendorF || pOperator)

  const { setExtraQuery: setProductExtraQuery } = d
  useEffect(() => {
    const p = new URLSearchParams()
    if (pPt)       p.set("pt",       pPt)
    if (pPtype)    p.set("ptype",    pPtype)
    if (pCountry)  p.set("country",  pCountry)
    if (pVendor)   p.set("vendor",   pVendor)
    if (pDtype)    p.set("dtype",    pDtype)
    if (pVendorF)  p.set("vendor_f", pVendorF)
    if (pOperator) p.set("operator", pOperator)
    const t = setTimeout(() => setProductExtraQuery(p.toString()), 300)
    return () => clearTimeout(t)
  }, [pPt, pPtype, pCountry, pVendor, pDtype, pVendorF, pOperator, setProductExtraQuery])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams({ search: d.search })
      if (d.tenant)  p.set("tenant",   d.tenant)
      if (d.status)  p.set("status",   d.status)
      if (pPt)       p.set("pt",       pPt)
      if (pPtype)    p.set("ptype",    pPtype)
      if (pCountry)  p.set("country",  pCountry)
      if (pVendor)   p.set("vendor",   pVendor)
      if (pDtype)    p.set("dtype",    pDtype)
      if (pVendorF)  p.set("vendor_f", pVendorF)
      if (pOperator) p.set("operator", pOperator)
      const data = await fetchAllPages("/api/products", p)
      const cols = PRODUCT_TABLE_COLS.filter(c => c.key !== "_detail")
      downloadXlsx(data, cols, `products_${new Date().toISOString().slice(0,10)}.xlsx`)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <FilterBar
            search={d.search} onSearch={d.setSearch}
            tenant={d.tenant} onTenant={d.setTenant}
            status={d.status} onStatus={d.setStatus}
            hasExtra={hasFilter} onReset={clearFilters}
          />
        </div>
        <ExportBtn onClick={handleExport} loading={exporting} />
      </div>

      {/* Product code + extra filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Bộ lọc — <span className="font-normal normal-case text-gray-400">
            Product Code: [PurchaseType · ProductType · Country(3) · Vendor(2) · DataType] &nbsp;|&nbsp; Lọc thêm: Vendor Code · Operator
          </span>
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          {([
            { label: "Purchase Type", pos: "pos 1",   val: pPt,      set: setPPt,      optKey: "purchaseTypes", w: "w-24" },
            { label: "Product Type",  pos: "pos 2",   val: pPtype,   set: setPPtype,   optKey: "productTypes",  w: "w-24" },
            { label: "Country",       pos: "pos 3–5", val: pCountry, set: setPCountry, optKey: "countries",     w: "w-24" },
            { label: "Vendor",        pos: "pos 6–7", val: pVendor,  set: setPVendor,  optKey: "vendors",       w: "w-24" },
            { label: "Data Policy",   pos: "pos 8",   val: pDtype,   set: setPDtype,   optKey: "dataTypes",     w: "w-24" },
          ] as const).map(f => (
            <div key={f.label} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 px-0.5">
                {f.label} <span className="text-[10px] text-gray-300 font-normal">{f.pos}</span>
              </span>
              <ComboFilter label="" value={f.val} onChange={f.set}
                width={f.w} options={opts[f.optKey] ?? []} small />
            </div>
          ))}

          <div className="w-px h-7 bg-gray-200 self-end mb-5 hidden sm:block" />

          {([
            { label: "Vendor Code", val: pVendorF,  set: setPVendorF,  optKey: "vendorCodes",   w: "w-28" },
            { label: "Operator",    val: pOperator, set: setPOperator, optKey: "operatorCodes", w: "w-28" },
          ] as const).map(f => (
            <div key={f.label} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 px-0.5">{f.label}</span>
              <ComboFilter label="" value={f.val} onChange={f.set}
                width={f.w} options={opts[f.optKey] ?? []} small />
            </div>
          ))}
        </div>
      </div>

      <TableShell
        cols={PRODUCT_TABLE_COLS}
        rows={d.rows}
        loading={d.loading}
        renderRow={(row, cols) => (
          <tr key={row.product_code} className="hover:bg-gray-50 transition-colors">
            {cols.map(col => col.key === "_detail"
              ? <td key="_detail" className="px-2 py-2 whitespace-nowrap">
                  <button onClick={() => setDetailRow(row)}
                    className="px-2.5 py-1 text-[11px] font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                    Chi tiết
                  </button>
                </td>
              : <ProductCell key={col.key} col={col.key} row={row} />
            )}
          </tr>
        )}
      />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          title={`Product: ${detailRow.product_code}`}
          fields={PRODUCT_MODAL_FIELDS}
        />
      )}
    </div>
  )
}

function ProductCell({ col, row }: { col: string; row: any }) {
  const v = row[col]
  if (col === "status")       return <td className="px-3 py-2 whitespace-nowrap"><StatusBadge value={v} /></td>
  if (col === "tenant")       return <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{v || "—"}</td>
  if (col === "product_code") return <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700">{v}</td>
  if (col === "kyc_needed")   return <td className="px-3 py-2 whitespace-nowrap"><KycBadge value={v} /></td>
  if (col === "note") {
    if (!v) return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">—</td>
    const short = v.length > 55 ? v.slice(0, 55) + "…" : v
    return <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px]" title={v}>{short}</td>
  }
  if (col === "supported_countries") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const codes = (v as string).split(/[,\s]+/).filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap" title={v}>
        {codes.slice(0, 3).join(", ")}
        {codes.length > 3 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{codes.length - 3}</span>}
      </td>
    )
  }
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

// ─── SKUs table ───────────────────────────────────────────────────────────────

function SkusTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [pPt, setPPt]           = useState("")
  const [pPtype, setPPtype]     = useState("")
  const [pCountry, setPCountry] = useState("")
  const [pVendor, setPVendor]   = useState("")
  const [pDtype, setPDtype]     = useState("")
  const [pData, setPData]       = useState("")
  const [pDays, setPDays]       = useState("")
  const [detailRow, setDetailRow] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  const opts = useFilterOpts("/api/skus/filters")
  const d = useTabData("/api/skus")

  const clearSkuFilters = () => {
    setPPt(""); setPPtype(""); setPCountry(""); setPVendor(""); setPDtype(""); setPData(""); setPDays("")
  }
  const hasSkuFilter = !!(pPt || pPtype || pCountry || pVendor || pDtype || pData || pDays)

  const { setExtraQuery: setSkuExtraQuery } = d
  useEffect(() => {
    const p = new URLSearchParams()
    if (pPt)      p.set("pt",      pPt)
    if (pPtype)   p.set("ptype",   pPtype)
    if (pCountry) p.set("country", pCountry)
    if (pVendor)  p.set("vendor",  pVendor)
    if (pDtype)   p.set("dtype",   pDtype)
    if (pData)    p.set("data",    pData)
    if (pDays)    p.set("days",    pDays)
    const t = setTimeout(() => setSkuExtraQuery(p.toString()), 300)
    return () => clearTimeout(t)
  }, [pPt, pPtype, pCountry, pVendor, pDtype, pData, pDays, setSkuExtraQuery])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams({ search: d.search })
      if (d.tenant)  p.set("tenant",  d.tenant)
      if (d.status)  p.set("status",  d.status)
      if (pPt)       p.set("pt",      pPt)
      if (pPtype)    p.set("ptype",   pPtype)
      if (pCountry)  p.set("country", pCountry)
      if (pVendor)   p.set("vendor",  pVendor)
      if (pDtype)    p.set("dtype",   pDtype)
      if (pData)     p.set("data",    pData)
      if (pDays)     p.set("days",    pDays)
      const data = await fetchAllPages("/api/skus", p)
      const exportCols = canSeeCost ? [...SKU_COLS_BASE, ...SKU_COGS_COLS] : SKU_COLS_BASE
      downloadXlsx(data, exportCols, `skus_${new Date().toISOString().slice(0,10)}.xlsx`)
    } finally { setExporting(false) }
  }

  const skuModalFields = [
    ...SKU_MODAL_FIELDS_BASE,
    ...(canSeeCost ? [
      { key: "latest_cogs",          label: "COGS"          },
      { key: "latest_cogs_currency", label: "COGS Currency" },
    ] : []),
  ]

  const cols = [
    ...(canSeeCost
      ? [...SKU_COLS_BASE.slice(0, 13), ...SKU_COGS_COLS, ...SKU_COLS_BASE.slice(13)]
      : SKU_COLS_BASE),
    { key: "_detail", label: "" },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <FilterBar search={d.search} onSearch={d.setSearch} tenant={d.tenant} onTenant={d.setTenant}
            status={d.status} onStatus={d.setStatus} hasExtra={hasSkuFilter} onReset={clearSkuFilters} />
        </div>
        <ExportBtn onClick={handleExport} loading={exporting} />
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          SKU Code — <span className="font-normal normal-case">[PurchaseType · ProductType · Country · Vendor · DataType · DataAmount · DayAmount]</span>
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          {([
            { label: "Purchase Type", pos: "pos 1",    val: pPt,      set: setPPt,      optKey: "purchaseTypes", w: "w-24" },
            { label: "Product Type",  pos: "pos 2",    val: pPtype,   set: setPPtype,   optKey: "productTypes",  w: "w-24" },
            { label: "Country",       pos: "pos 3–5",  val: pCountry, set: setPCountry, optKey: "countries",     w: "w-24" },
            { label: "Vendor",        pos: "pos 6–7",  val: pVendor,  set: setPVendor,  optKey: "vendors",       w: "w-24" },
            { label: "Data Policy",   pos: "pos 8",    val: pDtype,   set: setPDtype,   optKey: "dataTypes",     w: "w-24" },
            { label: "Data Amount",   pos: "pos 9–11", val: pData,    set: setPData,    optKey: "dataAmounts",   w: "w-24" },
            { label: "Day Amount",    pos: "pos 12–13",val: pDays,    set: setPDays,    optKey: "dayAmounts",    w: "w-24" },
          ] as const).map(f => (
            <div key={f.label} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-500 px-0.5">
                {f.label} <span className="text-[10px] text-gray-300 font-normal">{f.pos}</span>
              </span>
              <ComboFilter label="" value={f.val} onChange={f.set}
                width={f.w} options={opts[f.optKey] ?? []} small />
            </div>
          ))}
        </div>
      </div>
      <TableShell cols={cols} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.sku_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => col.key === "_detail"
            ? <td key="_detail" className="px-2 py-2 whitespace-nowrap">
                <button onClick={() => setDetailRow(row)}
                  className="px-2.5 py-1 text-[11px] font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                  Chi tiết
                </button>
              </td>
            : <SkuCell key={col.key} col={col.key} row={row} canSeeCost={canSeeCost} />
          )}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          title={`SKU: ${detailRow.sku_code}`}
          fields={skuModalFields}
        />
      )}
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
    const amt = row.data_amount; const unit = row.data_amount_unit ?? "GB"
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{amt != null ? `${amt}${unit}` : "—"}</td>
  }
  if (col === "days") {
    return <td className="px-3 py-2 whitespace-nowrap text-xs">{row.day_amount != null ? `${row.day_amount} ${row.day_amount_unit ?? "d"}` : "—"}</td>
  }
  if (col === "kyc_needed")  return <td className="px-3 py-2 whitespace-nowrap"><KycBadge value={v} /></td>
  if (col === "latest_cogs") return <td className="px-3 py-2 whitespace-nowrap text-xs text-right">{v != null ? Number(v).toLocaleString() : "—"}</td>
  if (col === "supported_countries") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const codes = (v as string).split(/[,\s]+/).filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs font-mono text-gray-500" title={v}>
        {codes.slice(0, 4).join(", ")}{codes.length > 4 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{codes.length - 4}</span>}
      </td>
    )
  }
  if (col === "country_names") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-400">—</td>
    const names = (v as string).split(", ").filter(Boolean)
    return (
      <td className="px-3 py-2 text-xs text-gray-600" title={v}>
        {names.slice(0, 2).join(", ")}{names.length > 2 && <span className="ml-1 bg-gray-100 text-gray-400 px-1 rounded">+{names.length - 2}</span>}
      </td>
    )
  }
  if (col === "note") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-300">—</td>
    const s = v.length > 60 ? v.slice(0, 60) + "…" : v
    return <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px]" title={v}>{s}</td>
  }
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

// ─── Listings table ───────────────────────────────────────────────────────────

function ListingsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [lType,    setLType]    = useState("")
  const [detailRow, setDetailRow] = useState<any>(null)
  const [exporting, setExporting] = useState(false)
  const opts = useFilterOpts("/api/listings/filters")
  const d = useTabData("/api/listings")
  const { setExtraQuery } = d

  useEffect(() => {
    const p = new URLSearchParams()
    if (lType) p.set("ltype", lType)
    setExtraQuery(p.toString())
  }, [lType, setExtraQuery])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams({ search: d.search })
      if (d.tenant) p.set("tenant", d.tenant)
      if (d.status) p.set("status", d.status)
      if (lType)    p.set("ltype",  lType)
      const data = await fetchAllPages("/api/listings", p)
      const cols = LISTING_TABLE_COLS.filter(c => c.key !== "_detail")
      downloadXlsx(data, cols, `listings_${new Date().toISOString().slice(0,10)}.xlsx`)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <FilterBar
            search={d.search} onSearch={d.setSearch}
            tenant={d.tenant} onTenant={d.setTenant}
            status={d.status} onStatus={d.setStatus}
            hasExtra={!!lType}
            onReset={() => setLType("")}
            extra={
              <ComboFilter label="Type" value={lType} onChange={setLType}
                width="w-32" options={opts.listingTypes ?? []} />
            }
          />
        </div>
        <ExportBtn onClick={handleExport} loading={exporting} />
      </div>
      <TableShell
        cols={LISTING_TABLE_COLS}
        rows={d.rows}
        loading={d.loading}
        renderRow={(row, cols) => (
          <tr key={row.listing_code} className="hover:bg-gray-50 transition-colors">
            {cols.map(col => col.key === "_detail"
              ? <td key="_detail" className="px-2 py-2 whitespace-nowrap">
                  <button onClick={() => setDetailRow(row)}
                    className="px-2.5 py-1 text-[11px] font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                    Chi tiết
                  </button>
                </td>
              : <ListingCell key={col.key} col={col.key} row={row} />
            )}
          </tr>
        )}
      />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          title={`Listing: ${detailRow.listing_code}`}
          fields={LISTING_MODAL_FIELDS}
        />
      )}
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
  if (col === "listing_name_vn") {
    if (!v) return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">—</td>
    const short = (v as string).length > 48 ? (v as string).slice(0, 48) + "…" : v
    return <td className="px-3 py-2 text-xs text-gray-700 min-w-[150px] max-w-[220px]" title={v}>{short}</td>
  }
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

// ─── Items table ──────────────────────────────────────────────────────────────

function ItemsTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [iType, setIType]         = useState("")
  const [exporting, setExporting] = useState(false)
  const [detailRow, setDetailRow] = useState<any>(null)
  const opts = useFilterOpts("/api/items/filters")
  const d = useTabData("/api/items", { defaultStatus: "Active" })
  const { setExtraQuery } = d

  useEffect(() => {
    const p = new URLSearchParams()
    if (iType) p.set("item_type", iType)
    setExtraQuery(p.toString())
  }, [iType, setExtraQuery])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams({ search: d.search, status: d.status || "Active" })
      if (d.tenant) p.set("tenant", d.tenant)
      if (iType)    p.set("item_type", iType)
      const data = await fetchAllPages("/api/items", p)
      downloadXlsx(data, ITEM_COLS, `items_${new Date().toISOString().slice(0,10)}.xlsx`)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <FilterBar
            search={d.search} onSearch={d.setSearch}
            tenant={d.tenant} onTenant={d.setTenant}
            status={d.status} onStatus={d.setStatus}
            statusDefault="Active"
            hasExtra={!!iType}
            onReset={() => setIType("")}
            extra={
              <ComboFilter label="Type" value={iType} onChange={setIType}
                width="w-32" options={opts.itemTypes ?? []} />
            }
          />
        </div>
        <ExportBtn onClick={handleExport} loading={exporting} />
      </div>
      {d.status === "Active" && (
        <p className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
          Mặc định chỉ hiển thị Item Active. Xóa filter Status để xem tất cả.
        </p>
      )}
      <TableShell cols={ITEM_COLS} rows={d.rows} loading={d.loading} renderRow={(row, cols) => (
        <tr key={row.item_code} className="hover:bg-gray-50 transition-colors">
          {cols.map(col => col.key === "_detail"
            ? <td key="_detail" className="px-2 py-2 whitespace-nowrap">
                <button onClick={() => setDetailRow(row)}
                  className="px-2.5 py-1 text-[11px] font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
                  Chi tiết
                </button>
              </td>
            : <ItemCell key={col.key} col={col.key} row={row} />
          )}
        </tr>
      )} />
      <Pagination page={d.page} totalPages={d.totalPages} total={d.total} onPrev={d.prevPage} onNext={d.nextPage} />

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          title={`Item: ${detailRow.item_code}`}
          fields={ITEM_MODAL_FIELDS}
        />
      )}
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
  if (col === "item_name_vn") {
    if (!v) return <td className="px-3 py-2 text-xs text-gray-300">—</td>
    const s = v.length > 40 ? v.slice(0, 40) + "…" : v
    return <td className="px-3 py-2 text-xs text-gray-700 max-w-[180px]" title={v}>{s}</td>
  }
  if (col === "item_name_en")
    return <td className="px-3 py-2 text-xs text-gray-700 min-w-[140px] max-w-[220px]">{v || <span className="text-gray-300">—</span>}</td>
  return <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{v || <span className="text-gray-300">—</span>}</td>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkusPage() {
  const { data: session } = useSession()
  const role       = (session?.user as any)?.role || "standard"
  const canSeeCost = role === "admin" || role === "manager"

  const [activeTab, setActiveTab] = useState<TabId>("products")

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <Package size={20} className="text-brand-600" />
        <h1 className="text-xl font-semibold text-gray-900">SP Hệ Thống</h1>
      </div>

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

      {activeTab === "products" && <ProductsTable canSeeCost={canSeeCost} />}
      {activeTab === "skus"     && <SkusTable     canSeeCost={canSeeCost} />}
      {activeTab === "listings" && <ListingsTable canSeeCost={canSeeCost} />}
      {activeTab === "items"    && <ItemsTable    canSeeCost={canSeeCost} />}
    </div>
  )
}
