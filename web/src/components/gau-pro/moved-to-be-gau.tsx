"use client"

import Link from "next/link"

// U5 (plan be-gau-upgrade.md): người từng được cấp Gấu Pro (không phải Creator) mở trang Gấu Pro/Bridge thấy màn hình này.
export function MovedToBeGau() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-4xl mb-3">🐻</div>
        <h2 className="text-lg font-semibold text-slate-800">Gấu Pro đang cập nhật</h2>
        <p className="mt-2 text-sm text-slate-600">
          Mọi chức năng của Gấu Pro đã chuyển sang <b>Bé Gấu</b>: phân tích số liệu, báo cáo Word/Excel/PPT, tạo ảnh/video,
          nghiên cứu sâu, chạy nền, việc theo lịch, trò chuyện trực tiếp. Các hội thoại Gấu Pro cũ của bạn cũng đã nằm trong Bé Gấu.
        </p>
        <Link
          href="/chatbot"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#1446A5] px-4 py-2 text-sm font-medium text-white hover:bg-[#003A93]"
        >
          Mở Bé Gấu
        </Link>
      </div>
    </div>
  )
}
