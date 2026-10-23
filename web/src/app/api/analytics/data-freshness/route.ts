import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { latestDataTime } from "@/lib/data-freshness"

export const dynamic = "force-dynamic"

// Thời điểm dữ liệu nguồn được cập nhật gần nhất (ETL job xong hoặc phát hiện số đổi) — hiện ở thanh trên cùng.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin.from("app_settings").select("key, value")
    .in("key", ["etl_cache_sync_last_seen", "data_checksum_state"])
  const byKey = Object.fromEntries((data ?? []).map(r => [r.key as string, r.value as string]))
  return NextResponse.json({ at: latestDataTime(byKey["etl_cache_sync_last_seen"], byKey["data_checksum_state"]) },
    { headers: { "Cache-Control": "private, max-age=60" } })
}
