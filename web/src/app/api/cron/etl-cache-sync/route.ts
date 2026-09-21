import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
import { isCronReq, softExpireAll, prewarmAnalyticsUrls } from "@/lib/analytics-helpers"
import { waitUntil } from "@vercel/functions"
import { alertCronFailure } from "@/lib/cron-alert"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// s200+6 — flush cache BI ngay khi ETL nạp xong (thay vì chờ mù TTL 60'). KHÔNG dùng Vercel Cron (Hobby
// plan giới hạn 1 lần/ngày/job, xem CLAUDE.md) — route này để cron-job.org (đã có sẵn cho browserless
// keep-alive, xem docs/wiki "s195") gọi mỗi 10-15 phút với Authorization: Bearer $CRON_SECRET.
// Theo dõi đúng 4 job ETL ảnh hưởng số liệu BI nhiều nhất (verify tên thật qua SQL trên staging 2026-09-17):
//   ETL_dim (dim_customer/dim_sku — ảnh hưởng phân loại), ETL_vatdb_cogs (giá vốn — ảnh hưởng GP/CM1),
//   ETL_fact_fulfilment_revenue_from_ops_admin_v2 + ETL_fact_sales_revenue_from_gohub_cloud (doanh thu,
//   chạy hàng giờ :50/:55 — root cause lệch số s199+3). Job khác (ops_sync/recon_telco/inventory) chạy
//   1 lần/ngày, TTL 60' hiện tại đã đủ nhanh, không cần theo dõi riêng.
const WATCHED_JOBS = [
  "ETL_dim",
  "ETL_vatdb_cogs",
  "ETL_fact_fulfilment_revenue_from_ops_admin_v2",
  "ETL_fact_sales_revenue_from_gohub_cloud",
]

const STATE_KEY = "etl_cache_sync_last_seen"

interface JobEnd { name: string; last_end: string | null }

async function checkAndFlush(origin: string): Promise<{ advanced: string[]; flushed: boolean }> {
  const rows = await queryAnalytics<JobEnd>(
    `SELECT j.name, MAX(jl.end_time) as last_end
     FROM job_logs jl JOIN jobs j ON j.id = jl.job_id
     WHERE j.name = ANY($1) AND jl.status = 'successful'
     GROUP BY j.name`,
    [WATCHED_JOBS],
  )

  const { data: stateRow } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", STATE_KEY).maybeSingle()
  const lastSeen: Record<string, string> = stateRow?.value ? JSON.parse(stateRow.value) : {}

  const advanced: string[] = []
  const nextSeen = { ...lastSeen }
  for (const row of rows) {
    if (!row.last_end) continue
    const prev = lastSeen[row.name]
    if (!prev || new Date(row.last_end).getTime() > new Date(prev).getTime()) {
      advanced.push(row.name)
      nextSeen[row.name] = row.last_end
    }
  }

  if (advanced.length > 0) {
    // s203: KHÔNG xoá cứng nữa — đánh dấu cache "hết TTL" để người xem vẫn nhận bản cũ ngay (stale-while-revalidate),
    // đồng thời làm tươi trước ở nền các URL được xem gần đây để lượt xem kế tiếp đã có số mới.
    await softExpireAll()
    waitUntil(prewarmAnalyticsUrls(origin, 30, 3).then(() => {}, () => {}))
    await supabaseAdmin.from("app_settings").upsert(
      { key: STATE_KEY, value: JSON.stringify(nextSeen), category: "cache" },
      { onConflict: "key" },
    )
  }

  return { advanced, flushed: advanced.length > 0 }
}

// Gọi định kỳ từ cron-job.org (GET + Bearer CRON_SECRET) — KHÔNG đăng ký trong vercel.json.
export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const result = await checkAndFlush(req.nextUrl.origin)
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
  } catch (err) {
    await alertCronFailure("etl-cache-sync", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

// Trigger tay từ Settings (admin/creator) để test.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ""
  if (!session || !["admin", "creator"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await checkAndFlush(req.nextUrl.origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
