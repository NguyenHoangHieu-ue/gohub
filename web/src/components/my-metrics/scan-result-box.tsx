// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import type { LarkScanResult } from "@/lib/my-metrics-types"

export function ScanResultBox({ result }: { result: LarkScanResult }) {
  if (result.skipped) return <p className="text-[11px] text-slate-500 mt-2">Bỏ qua: {result.skipped}</p>
  return (
    <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2.5 space-y-0.5">
      {result.groups.length > 0 ? (
        <div>
          <span className="text-slate-400">Đã quét {result.groups.length} group: </span>
          {result.groups.map((g, i) => (
            <span key={g.chat_id}>
              {i > 0 && ", "}<strong>{g.chat_name}</strong> ({g.thread_count})
            </span>
          ))}
        </div>
      ) : (
        <div className="text-amber-600">Không tìm thấy group/thread nào phù hợp.</div>
      )}
      <div>Đã quét <strong className="tabular-nums">{result.scanned}</strong> thread có reply, liên quan Hiếu.</div>
      <div>Phân loại lần này: <strong className="tabular-nums">{result.classified}</strong> thread mới.</div>
      <div>→ <strong className="text-emerald-600 tabular-nums">{result.inserted}</strong> case mới vào hàng chờ duyệt · <strong className="tabular-nums">{result.not_matched}</strong> không khớp.</div>
      {result.classify_errors > 0 && (
        <div className="text-red-600">⚠ <strong className="tabular-nums">{result.classify_errors}</strong> thread lỗi khi AI phân loại (không tính vào metrics) — xem Vercel log <code>[Lark classify]</code> để biết lý do.</div>
      )}
      {result.backlog_remaining > 0 && (
        <div className="text-amber-600">Còn <strong className="tabular-nums">{result.backlog_remaining}</strong> thread cũ hơn chưa kịp phân loại — chạy thêm lần nữa.</div>
      )}
    </div>
  )
}
