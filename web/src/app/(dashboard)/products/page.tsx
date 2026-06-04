import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getProducts } from "@/lib/supabase"
import { DataTable } from "@/components/data-table"
import { MetricCard } from "@/components/metric-card"
import { Package } from "lucide-react"

const COLS = [
  { key: "product_code",        header: "Product Code" },
  { key: "product_ref",         header: "Ref" },
  { key: "tenant",              header: "Tenant" },
  { key: "status",              header: "Status",   format: "status" as const },
  { key: "type_of_sim",         header: "Type" },
  { key: "product_type",        header: "Product Type" },
  { key: "vendor_code",         header: "Vendor" },
  { key: "operator_code",       header: "Operator" },
  { key: "source_type",         header: "Source" },
  { key: "sku_type",            header: "SKU Type" },
  { key: "data_type",           header: "Data Type" },
  { key: "supported_countries", header: "Countries" },
  { key: "network_type",        header: "Network" },
  { key: "hotspot",             header: "Hotspot" },
  { key: "date_created",        header: "Created",  format: "date" as const },
  { key: "last_modified_date",  header: "Modified", format: "date" as const },
]

export default async function ProductsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const data   = await getProducts()
  const active = data.filter(r => String(r.status ?? "").toLowerCase() === "active").length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <Package size={20} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <h1 className="text-xl font-bold text-gray-900">Products</h1>
        <span className="text-sm text-gray-400">Danh sách sản phẩm từ GoHub API</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Tổng"     value={data.length}            accent="blue"  />
        <MetricCard label="Active"   value={active}                 accent="green" />
        <MetricCard label="Inactive" value={data.length - active}   accent="gray"  />
      </div>

      <DataTable data={data} columns={COLS} filename="products" />
    </div>
  )
}
