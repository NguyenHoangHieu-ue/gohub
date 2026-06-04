import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { fetchAll } from "@/lib/supabase"
import { DataTable, type ColDef } from "@/components/data-table"
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
  { key: "original_cost",               header: "Original Cost", format: "vnd" },
  { key: "latest_cogs",                  header: "Latest COGS",   format: "vnd" },
  { key: "latest_cogs_currency",         header: "COGS Currency" },
  { key: "final_cogs_included_vat_vnd",  header: "COGS VAT (VND)", format: "vnd" },
  { key: "final_cogs_usd",               header: "COGS (USD)",    format: "usd" },
  { key: "date_created",                 header: "Created",       format: "date" },
  { key: "last_modified_date",           header: "Modified",      format: "date" },
]

const COST_COLS = ["original_cost", "latest_cogs", "latest_cogs_currency",
                   "final_cogs_included_vat_vnd", "final_cogs_usd"]

export default async function SkusPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role   = session.user.role
  const data   = await fetchAll("skus")
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

      <DataTable data={data} columns={ALL_COLS} filename="skus" hiddenColumns={hidden} />
    </div>
  )
}
