import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabaseAdmin } from "@/lib/supabase"
import { DataTable } from "@/components/data-table"
import { MetricCard } from "@/components/metric-card"
import { ShoppingCart } from "lucide-react"

const COLS = [
  { key: "item_code",          header: "Item Code" },
  { key: "item_ref",           header: "Ref" },
  { key: "sku_code",           header: "SKU" },
  { key: "listing_code",       header: "Listing" },
  { key: "tenant",             header: "Tenant" },
  { key: "status",             header: "Status",        format: "status" as const },
  { key: "item_name_vn",       header: "Tên VN" },
  { key: "item_type",          header: "Type" },
  { key: "price_list",         header: "Price List" },
  { key: "category_code",      header: "Category" },
  { key: "day_amount",         header: "Days",          format: "number" as const },
  { key: "day_amount_unit",    header: "Day Unit" },
  { key: "data_amount",        header: "Data",          format: "decimal" as const },
  { key: "data_amount_unit",   header: "Data Unit" },
  { key: "throttle_speed_en",  header: "Throttle" },
  { key: "call_en",            header: "Call" },
  { key: "unitprice",          header: "Unit Price",    format: "vnd" as const },
  { key: "currency",           header: "Currency" },
  { key: "date_created",       header: "Created",       format: "date" as const },
  { key: "last_modified_date", header: "Modified",      format: "date" as const },
]

async function getItemStats() {
  const { count: total } = await supabaseAdmin
    .from("items").select("*", { count: "exact", head: true })
  const { count: active } = await supabaseAdmin
    .from("items").select("*", { count: "exact", head: true }).eq("status", "Active")
  return { total: total ?? 0, active: active ?? 0 }
}

async function fetchItems(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let offset = 0
  while (true) {
    const { data } = await supabaseAdmin
      .from("items").select("*").range(offset, offset + 999)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return rows
}

export default async function ItemsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const [stats, data] = await Promise.all([getItemStats(), fetchItems()])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <ShoppingCart size={20} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <h1 className="text-xl font-bold text-gray-900">Items</h1>
        <span className="text-sm text-gray-400">Đơn vị bán lẻ theo kênh phân phối</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Tổng"     value={stats.total}                   accent="blue"  />
        <MetricCard label="Active"   value={stats.active}                  accent="green" />
        <MetricCard label="Inactive" value={stats.total - stats.active}    accent="gray"  />
      </div>

      <DataTable data={data} columns={COLS} filename="items" />
    </div>
  )
}
