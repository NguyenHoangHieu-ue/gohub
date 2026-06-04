import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getListings } from "@/lib/supabase"
import { DataTable } from "@/components/data-table"
import { MetricCard } from "@/components/metric-card"
import { List } from "lucide-react"

const COLS = [
  { key: "listing_code",             header: "Listing Code" },
  { key: "listing_ref",              header: "Ref" },
  { key: "reference_product_code",   header: "Product" },
  { key: "tenant",                   header: "Tenant" },
  { key: "status",                   header: "Status",      format: "status" as const },
  { key: "listing_name_vn",          header: "Tên VN" },
  { key: "listing_type",             header: "Type" },
  { key: "type_of_sim",              header: "SIM/eSIM" },
  { key: "product_type",             header: "Product Type" },
  { key: "network_operator",         header: "Operator" },
  { key: "category_code",            header: "Category" },
  { key: "network_type",             header: "Network" },
  { key: "expirations_en",           header: "Expiry (days)", format: "number" as const },
  { key: "hotspot_en",               header: "Hotspot" },
  { key: "call_en",                  header: "Call" },
  { key: "top_up_options_en",        header: "Top-up" },
  { key: "date_created",             header: "Created",     format: "date" as const },
  { key: "last_modified_date",       header: "Modified",    format: "date" as const },
]

export default async function ListingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const data   = await getListings()
  const active = data.filter(r => String(r.status ?? "").toLowerCase() === "active").length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <List size={20} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <h1 className="text-xl font-bold text-gray-900">Listings</h1>
        <span className="text-sm text-gray-400">Gói bán trên các kênh phân phối</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Tổng"     value={data.length}          accent="blue"  />
        <MetricCard label="Active"   value={active}               accent="green" />
        <MetricCard label="Inactive" value={data.length - active} accent="gray"  />
      </div>

      <DataTable data={data} columns={COLS} filename="listings" />
    </div>
  )
}
