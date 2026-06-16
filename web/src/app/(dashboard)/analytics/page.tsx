"use client"

import { LayoutDashboard, PieChart, Globe2, Building2, ShoppingBag, ClipboardList, Users, BarChart3, Target, Zap, HeartPulse, ArrowRight } from "lucide-react"
import Link from "next/link"

const ANALYTICS_MODULES = [
  { href: "/analytics/bod",             label: "BOD Report",         icon: PieChart,       desc: "Báo cáo tổng hợp cho Ban Giám Đốc — doanh thu, lợi nhuận, kênh",         color: "bg-purple-50 border-purple-100 text-purple-700" },
  { href: "/analytics/channels",        label: "Kênh bán",           icon: Globe2,         desc: "Hiệu suất từng kênh: B2B, B2C, Wholesale, On-demand",                    color: "bg-blue-50 border-blue-100 text-blue-700"   },
  { href: "/analytics/b2b",             label: "B2B Performance",    icon: Building2,      desc: "Strategic partners (Klook, Traveloka...) và Other Partners",             color: "bg-indigo-50 border-indigo-100 text-indigo-700" },
  { href: "/analytics/b2c",             label: "B2C Performance",    icon: ShoppingBag,    desc: "Shopee, TikTok, Momo, ngân hàng, kênh B2C khác",                         color: "bg-pink-50 border-pink-100 text-pink-700"   },
  { href: "/analytics/orders",          label: "Đơn hàng",           icon: ClipboardList,  desc: "Danh sách đơn hàng, lọc theo kênh / SKU / ngày / trạng thái",            color: "bg-green-50 border-green-100 text-green-700" },
  { href: "/analytics/staff",           label: "Nhân viên",          icon: Users,          desc: "Hiệu suất từng nhân viên Sales — doanh thu, đơn, % target",              color: "bg-amber-50 border-amber-100 text-amber-700" },
  { href: "/analytics/products",        label: "Sản phẩm (BI)",      icon: BarChart3,      desc: "Top SKU bán chạy, phân tích theo nước / loại / vendor",                  color: "bg-orange-50 border-orange-100 text-orange-700" },
  { href: "/analytics/targets",         label: "KPI / Target",       icon: Target,         desc: "Thiết lập và theo dõi target tháng theo kênh",                           color: "bg-teal-50 border-teal-100 text-teal-700"  },
  { href: "/analytics/fulfillment",     label: "Fulfillment",        icon: Zap,            desc: "Báo cáo xử lý đơn, SLA, lỗi, hoàn trả",                                 color: "bg-cyan-50 border-cyan-100 text-cyan-700"  },
  { href: "/analytics/cs-troubleshoot", label: "CS Troubleshoot",    icon: HeartPulse,     desc: "Ticket CS, loại lỗi, thời gian xử lý, trend",                            color: "bg-red-50 border-red-100 text-red-700"     },
]

export default function AnalyticsDashboardPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
          <LayoutDashboard size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Báo Cáo &amp; BI</h1>
          <p className="text-sm text-gray-500">Trung tâm phân tích kinh doanh GoHub</p>
        </div>
      </div>

      {/* Status banner — Phase 2 coming */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0 animate-pulse" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Đang tích hợp — Phase 2</p>
          <p className="text-sm text-blue-600 mt-0.5">
            Dữ liệu từ hệ thống gohub-intel đang được port vào. Các module bên dưới sẽ hoạt động đầy đủ sau khi hoàn thành Phase 2.
          </p>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ANALYTICS_MODULES.map(({ href, label, icon: Icon, desc, color }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 hover:border-blue-200 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${color}`}>
                <Icon size={17} />
              </div>
              <ArrowRight size={15} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
            </div>
            <div className="mt-auto">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">Đang phát triển</span>
            </div>
          </Link>
        ))}
      </div>

    </div>
  )
}
