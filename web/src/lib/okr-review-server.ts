// Gom dữ liệu cho "Đánh giá hôm nay" (khối trên trang My Metrics + Lark DM 8:30 — s227). Mọi số dùng đúng hàm của các
// route My Metrics (lib/my-metrics-*.ts) nên khớp trang.
import { supabaseAdmin } from "@/lib/supabase"
import { parseQuarterLabel } from "@/lib/okr-helpers"
import { defaultTargetsFor, type OkrTargets } from "@/lib/my-metrics-types"
import { loadAutoMetrics } from "@/lib/my-metrics-auto"
import { loadSkuScan } from "@/lib/my-metrics-sku-scan"
import { loadEvidence } from "@/lib/my-metrics-evidence"
import { loadPlan, pendingQuotes } from "@/lib/okr-plan-server"
import { loadMarketData } from "@/lib/market-data"
import { openThreadsThisMonth } from "@/lib/lark-scan-runner"
import { isMonthEndWarning } from "@/lib/okr-lark-rules"
import { reviewKpis, marketAlerts, type DailyReview } from "@/lib/okr-review"

async function loadTargets(label: string): Promise<{ targets: OkrTargets; note: string | null }> {
  const { targets: def, isFallback, source } = defaultTargetsFor(label)
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", `okr.${label}`).maybeSingle()
  let m: Record<string, number> = {}
  try { m = data?.value ? JSON.parse(data.value) : {} } catch {}
  // Giống trang: giá trị đã nhập (khác 0) đè mặc định.
  const t: OkrTargets = {
    sla_hours: m.target_sla_hours || def.sla_hours, sla_pct: m.target_sla_pct || def.sla_pct,
    vendor_speed: m.target_vendor_speed || def.vendor_speed, gm_delta: m.target_gm_delta || def.gm_delta,
    hk3_pct: m.target_hk3_pct || def.hk3_pct, begau: m.target_begau || def.begau,
  }
  return { targets: t, note: !data?.value && isFallback ? `chưa nhập target ${label}, tạm dùng target ${source}` : null }
}

export async function loadDailyReview(quarter: string): Promise<DailyReview> {
  const { q, year, start, end } = parseQuarterLabel(quarter)
  const settle = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb)
  const [tg, auto, sku, sla, vendor, plan, market, quotes, lark] = await Promise.all([
    loadTargets(quarter),
    loadAutoMetrics(q, year),
    settle(loadSkuScan(quarter), null),
    settle(loadEvidence(quarter, "sla"), null),
    settle(loadEvidence(quarter, "vendor_speed"), null),
    settle(loadPlan(quarter), null),
    settle(loadMarketData(quarter, "ALL"), null),
    pendingQuotes(),
    settle(openThreadsThisMonth(), []),
  ])

  const today = market?.cutoff ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const quarterDays = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  const dayOfQuarter = Math.min(quarterDays, Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000) + 1))
  const elapsed = dayOfQuarter / quarterDays

  const { kpis, score } = reviewKpis({
    sla: sla?.avg ?? null, vendor: vendor?.avg ?? null,
    skuDelta: (sku as { weighted_delta?: number | null } | null)?.weighted_delta ?? null,
    datapool: auto.hk3.pct, begau: auto.begau.total,
  }, tg.targets, elapsed)

  const items = (plan?.items ?? []).filter(i => !i.dropped)
  return {
    quarter, today, elapsed, dayOfQuarter, quarterDays, score, kpis,
    plan: {
      total: items.length,
      done: items.filter(i => i.eval.status === "done").length,
      issues: items.filter(i => i.eval.status === "overdue" || i.eval.status === "behind")
        .sort((a, b) => (a.eval.status === "overdue" ? 0 : 1) - (b.eval.status === "overdue" ? 0 : 1))
        .map(i => ({ title: i.title, status: i.eval.status, message: i.eval.message })),
    },
    alerts: market ? marketAlerts(market, today) : [],
    lark: { open: lark.length, yesNoTyping: lark.filter(l => l.yesNoTyping).length, monthEnd: isMonthEndWarning(), lines: lark.map(l => l.line) },
    pendingQuotes: quotes,
    targetNote: tg.note,
  }
}
