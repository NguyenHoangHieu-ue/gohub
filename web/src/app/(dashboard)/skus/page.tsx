import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getSkus } from "@/lib/supabase"
import { DataTable, type ColDef, type ExtraFilter } from "@/components/data-table"
import { MetricCard } from "@/components/metric-card"
import { Tag } from "lucide-react"

const ALL_COLS: ColDef[] = [
  { key: "sku_code",                     header: "SKU Code" },
  { key: "sku_ref",                      header: "Ref" },
  { key: "product_code",                 header: "Product" },
  { key: "tenant",                       header: "Tenant" },
  { key: "status",                       header: "Status",        format: "status" },
  { key: "sim_esim",                     header: "SIM/eSIM" },
  { key: "product_type",                 header: "Type" },
  { key: "data_amount",                  header: "Data",          format: "decimal" },
  { key: "data_amount_unit",             header: "Data Unit" },
  { key: "day_amount",                   header: "Days",          format: "number" },
  { key: "day_amount_unit",              header: "Day Unit" },
  { key: "throttle_speed",               header: "Throttle" },
  { key: "call",                         header: "Call" },
  { key: "expirations",                  header: "Expiration",    format: "number" },
  { key: "currency",                     header: "Currency" },
  { key: "original_cost",               header: "Original Cost" },
  { key: "latest_cogs",                  header: "Latest COGS" },
  { key: "latest_cogs_currency",         header: "COGS Currency" },
  { key: "final_cogs_included_vat_vnd",  header: "COGS VAT (VND)" },
  { key: "final_cogs_usd",               header: "COGS (USD)" },
  { key: "date_created",                 header: "Created",       format: "date" },
  { key: "last_modified_date",           header: "Modified",      format: "date" },
]

const COST_COLS = ["original_cost", "latest_cogs", "latest_cogs_currency",
                   "final_cogs_included_vat_vnd", "final_cogs_usd"]

const EXTRA_FILTERS: ExtraFilter[] = [
  {
    field: "sim_esim", label: "SIM/eSIM", type: "select",
    options: ["SIM", "eSIM"],
  },
  {
    field: "product_type", label: "Product Type", type: "select",
    options: ["SIM/eSIM data", "eSIM full", "SIM full", "SIM frame"],
  },
  {
    field: "throttle_speed", label: "Throttle", type: "select",
    options: ["Unlimited high speed", "1 mbps", "512 kbps", "384 kbps", "256 kbps", "128 kbps", "Stop"],
  },
  { field: "day_amount",  label: "Số ngày",  type: "range" },
  { field: "data_amount", label: "Data (GB)", type: "range" },
]

export default async function SkusPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role   = session.user.role
  const data   = await getSkus()
  const active = data.filter(r => String(r.status ?? "").toLowerCase() === "active").length
  const hidden = role !== "admin" ? COST_COLS : []

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <Tag size={20} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <h1 className="text-xl font-bold text-gray-900">SKUs</h1>
        <span className="text-sm text-gray-400">Gói cước — giá, dung lượng, số ngày</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Tổng"     value={data.length}          accent="blue"  />
        <MetricCard label="Active"   value={active}               accent="green" />
        <MetricCard label="Inactive" value={data.length - active} accent="gray"  />
      </div>

      <DataTable data={data} columns={ALL_COLS} filename="skus" hiddenColumns={hidden} extraFilters={EXTRA_FILTERS} />
    </div>
  )
}
