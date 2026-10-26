import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { runLogArchive } from "@/lib/log-archive"
import { pruneHistory } from "@/lib/manual-history/store"
import { alertCronFailure } from "@/lib/cron-alert"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Mỗi ngày: sao log cũ (hội thoại, lượt chạy, sự kiện, nhật ký hành động...) sang Turso rồi xoá khỏi Supabase. Thêm ?dry=1 để chỉ đếm, không sao/xoá gì.
export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const apply = req.nextUrl.searchParams.get("dry") !== "1"
    const results = await runLogArchive(apply, req.nextUrl.searchParams.get("only") || undefined)
    const failed = results.filter(r => r.error)
    if (apply && failed.length) await alertCronFailure("log-archive", new Error(failed.map(f => `${f.table}: ${f.error}`).join("; ")))
    // Lịch sử nhập tay: dọn theo trần (24 tháng, 100 mục/dòng, 150.000 mục toàn bảng) — chỉ khi chạy thật.
    const historyPrune = apply ? await pruneHistory().catch(e => ({ error: (e as Error).message })) : null
    return NextResponse.json({ ok: failed.length === 0, apply, results, historyPrune, at: new Date().toISOString() })
  } catch (e) {
    await alertCronFailure("log-archive", e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
