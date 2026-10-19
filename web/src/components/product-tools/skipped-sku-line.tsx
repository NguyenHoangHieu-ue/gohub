import type { SkippedSku } from "@/lib/bc-datapool/dedupe"

const fmt = (n: number, cur?: string) => (cur === "VND" ? Math.round(n).toLocaleString("vi-VN") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }))

/** 1 dòng SKU đã có trong hệ thống: mã, tenant, trạng thái, gói + so giá vốn hệ thống với giá tính lại (đỏ = lệch quá mức làm tròn). */
export function SkippedSkuLine({ s }: { s: SkippedSku }) {
  const has = s.current != null && s.computed != null
  return (
    <li>
      <span className="font-mono">{s.sku}</span> ({s.tenant}, {s.status}) — {s.label}
      {has && (
        <span className={s.verdict === "diff" ? "text-red-600 font-semibold" : s.verdict === "rounding" ? "text-gray-500" : "text-emerald-700"}>
          {" "}· hệ thống {fmt(s.current!, s.currency)} {s.currency} · tính lại {fmt(s.computed!, s.currency)}
          {s.verdict === "diff" ? ` (lệch ${(s.diffPct ?? 0) > 0 ? "+" : ""}${s.diffPct}%)` : s.verdict === "rounding" ? " (chênh do làm tròn)" : " (khớp)"}
        </span>
      )}
      {s.current == null && s.computed != null && <span className="text-amber-700"> · hệ thống chưa có giá vốn</span>}
    </li>
  )
}
