import { Truck, Clock } from "lucide-react"

export default function NccPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Truck size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Sản Phẩm Nhà Cung Cấp</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
          <Clock size={28} className="text-amber-500" />
        </div>
        <p className="font-semibold text-gray-800 mb-1">Đang phát triển</p>
        <p className="text-sm text-gray-400 max-w-sm">
          Tab này sẽ hiển thị toàn bộ sản phẩm từ các nhà cung cấp (WM, 3HK, BillionConnect, TrueMove...) sau khi được chuẩn hóa về 1 schema chung.
        </p>
      </div>
    </div>
  )
}
