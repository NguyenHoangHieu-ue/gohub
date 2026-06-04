import { Package, Clock } from "lucide-react"

const COLUMNS = [
  { key: "status",           label: "Status",            note: "Active / Inactive" },
  { key: "tenant",           label: "Tenant",            note: "US / VN" },
  { key: "productCode",      label: "Product Code",      note: "" },
  { key: "SKU",              label: "SKU",               note: "Mã SKU hệ thống" },
  { key: "nameVn",           label: "Tên VN",            note: "" },
  { key: "nameEn",           label: "Tên EN",            note: "" },
  { key: "dataAmount",       label: "Data",              note: "GB / Unlimited" },
  { key: "dayAmount",        label: "Số ngày",           note: "" },
  { key: "throttleSpeed",    label: "Throttle",          note: "kbps sau khi hết data" },
  { key: "latestCogs",       label: "COGS",              note: "Giá nhập" },
  { key: "latestCogsCurrency", label: "Tiền tệ COGS",   note: "USD / VND" },
  { key: "expirations",      label: "Hạn sử dụng",      note: "Ngày" },
  { key: "vendorSku",        label: "Vendor SKU",        note: "Mã SKU bên NCC" },
  { key: "frameSku",         label: "Frame SKU",         note: "" },
  { key: "datapackSku",      label: "Datapack SKU",      note: "" },
  { key: "call",             label: "Gọi điện",          note: "Yes / No" },
]

export default function SkusPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Package size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Sản Phẩm Hệ Thống</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Coming soon banner */}
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100">
          <Clock size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            Đang phát triển — Sẽ hiển thị toàn bộ SKU hệ thống theo format chuẩn bên dưới
          </p>
        </div>

        {/* Column preview */}
        <div className="p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Cấu trúc cột dự kiến</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {COLUMNS.map(col => (
              <div key={col.key} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-sm font-medium text-gray-800">{col.label}</div>
                {col.note && <div className="text-xs text-gray-400 mt-0.5">{col.note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
