import type { CatalogDiff, PriceDiff } from "@/lib/bc-datapool/diff"

export interface DiffGroup { label: string; tone: "red" | "green" | "amber"; total: number; items: string[] }
const TONE = { red: "text-red-700", green: "text-emerald-700", amber: "text-amber-700" }

/** Báo cáo thay đổi sau khi upload: nhóm có số lượng, bấm mở xem chi tiết. */
export function DiffBox({ diff, groups }: { diff: { at: string; compared: boolean } | null | undefined; groups: DiffGroup[] }) {
  if (!diff) return null
  const when = new Date(diff.at).toLocaleString("vi-VN")
  if (!diff.compared) return <div className="text-[12px] text-gray-400">Lần upload đầu tiên ({when}) — chưa có bản cũ để so sánh.</div>
  const active = groups.filter(g => g.total > 0)
  if (!active.length) return <div className="text-[12px] text-emerald-700">✓ Không có thay đổi so với bản trước ({when}).</div>
  return (
    <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 space-y-1">
      <div className="text-[12px] font-semibold text-amber-900 dark:text-amber-200">Thay đổi so với bản trước ({when}) — sản phẩm/giá đã tạo trước đó có thể cần cập nhật</div>
      {active.map(g => (
        <details key={g.label} className="text-[12px]">
          <summary className={`cursor-pointer font-semibold ${TONE[g.tone]}`}>{g.label}: {g.total}</summary>
          <ul className="mt-1 ml-4 list-disc max-h-48 overflow-auto space-y-0.5 text-gray-700 dark:text-slate-300">
            {g.items.map((t, k) => <li key={k}>{t}</li>)}
            {g.total > g.items.length && <li className="text-gray-400">… và {g.total - g.items.length} dòng nữa</li>}
          </ul>
        </details>
      ))}
    </div>
  )
}

export const priceGroups = (d?: PriceDiff | null): DiffGroup[] => !d ? [] : [
  { label: "Đổi giá", tone: "amber", total: d.counts.changed, items: d.changed.map(c => `${c.pool} · ${c.coverage} · ${c.operator}: ${c.from} → ${c.to} ${c.currency}/GB`) },
  { label: "Nhà mạng/khu vực mới", tone: "green", total: d.counts.added, items: d.added.map(c => `${c.pool} · ${c.coverage} · ${c.operator}: ${c.to} ${c.currency}/GB`) },
  { label: "Nhà mạng/khu vực bị bỏ", tone: "red", total: d.counts.removed, items: d.removed.map(c => `${c.pool} · ${c.coverage} · ${c.operator} (trước: ${c.from} ${c.currency}/GB)`) },
  { label: "Đổi phí (IMSI/eSIM/SIM)", tone: "amber", total: d.counts.fees, items: d.fees.map(f => `${f.pool} · ${f.field}: ${f.from} → ${f.to}`) },
]

export const catalogGroups = (d?: CatalogDiff | null): DiffGroup[] => !d ? [] : [
  { label: "Gói mới", tone: "green", total: d.counts.added, items: d.added.map(p => `${p.label} — ${p.id}`) },
  { label: "Gói bị bỏ", tone: "red", total: d.counts.removed, items: d.removed.map(p => `${p.label} — ${p.id}`) },
  { label: "Gói đổi số ngày/tốc độ/nhà mạng", tone: "amber", total: d.counts.changed, items: d.changed.map(p => `${p.label} — ${p.id}: ${p.detail}`) },
]
