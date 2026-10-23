"use client"

// Nhãn nhỏ góc dưới phải khi trang đang hiện số cũ (đã xem trước đó) và chờ số mới về — tránh người xem tưởng số cũ là mới.
export function StaleNotice({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div role="status" className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-md dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
      Đang cập nhật số mới…
    </div>
  )
}
