"use client"

// Tách từ channels/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import React from "react"
import { RefreshCw } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/analytics-formatters"

export function B2BCustomerDetail({ customer, startDate, endDate, dateColumn, countryMap }: {
  customer: any; startDate: string; endDate: string; dateColumn: string; countryMap: Record<string, string>
}) {
  const [channels, setChannels] = React.useState<any[]>([])
  const [products, setProducts] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      const dateF = `${dateColumn}::date >= '${startDate}' AND ${dateColumn}::date <= '${endDate}'`
      const custF = `TRIM(customer_code) = '${customer.customer_code.replace(/'/g, "''")}'`

      const [chRows, prRows] = await Promise.all([
        fetch("/api/analytics/query", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: `
            SELECT COALESCE(TRIM(s.channel_name), 'Other') as channel,
              SUM(f.fulfilled_revenue_amount_vnd) as revenue,
              SUM(f.gross_profit_vnd) as margin,
              COUNT(DISTINCT f.order_code) as orders
            FROM fact_fulfillment_revenue f
            LEFT JOIN dim_order_source s ON f.order_source_code = s.code
            WHERE ${custF} AND f.${dateF}
              AND f.sku != 'SHIPPINGFEE0'
            GROUP BY 1 ORDER BY 2 DESC LIMIT 10` }),
        }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        fetch("/api/analytics/query", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: `
            SELECT f.sku as product_name,
              MAX(sk.category_name) as category,
              UPPER(SUBSTRING(f.sku, 3, 3)) as destination,
              SUM(f.fulfilled_revenue_amount_vnd) as revenue,
              SUM(f.fulfilled_quantity) as units
            FROM fact_fulfillment_revenue f
            LEFT JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)
            WHERE ${custF} AND f.${dateF} AND f.sku != 'SHIPPINGFEE0'
            GROUP BY 1, 3 ORDER BY 4 DESC LIMIT 10` }),
        }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
      ])
      setChannels(chRows.map((r: any) => ({ ...r, revenue: parseFloat(r.revenue||0), margin: parseFloat(r.margin||0), orders: parseInt(r.orders||0) })))
      setProducts(prRows.map((r: any) => ({ ...r, revenue: parseFloat(r.revenue||0), units: parseInt(r.units||0) })))
      setLoading(false)
    }
    load()
  }, [customer.customer_code, startDate, endDate, dateColumn])

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Đang tải...</div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-slate-100">
      {/* Channels */}
      <div>
        <p className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50">Kênh bán hàng</p>
        <table className="w-full text-[12px] border-collapse">
          <thead><tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Kênh</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">Revenue</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">GP</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">Orders</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {channels.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 font-semibold text-slate-800">{c.channel}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(c.revenue)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{formatCurrency(c.margin)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{formatNumber(c.orders)}</td>
              </tr>
            ))}
            {channels.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400 italic">Không có dữ liệu</td></tr>}
          </tbody>
        </table>
      </div>
      {/* Products */}
      <div>
        <p className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50">Top sản phẩm</p>
        <table className="w-full text-[12px] border-collapse">
          <thead><tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">SKU</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Dest</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Category</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">Revenue</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">Units</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {products.map((p, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 font-mono text-[11px] text-slate-700 truncate max-w-[140px]">{p.product_name}</td>
                <td className="px-3 py-2.5 font-bold text-[11px] text-slate-600" title={p.destination || ""}>{p.destination ? (countryMap[p.destination] || p.destination) : "—"}</td>
                <td className="px-3 py-2.5 text-[11px] text-slate-400 truncate max-w-[100px]">{p.category || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(p.revenue)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{formatNumber(p.units)}</td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400 italic">Không có dữ liệu</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
