import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { alertCronFailure } from "@/lib/cron-alert"
import { backfillNext, health, logRun, reconcileMonth, refreshRecent, refreshWindow, syncCustomers, syncSmallDims } from "@/lib/rollup/builder"
import { rollupConfigured, rollupDedicated } from "@/lib/rollup/client"
import { ensureRollupSchema } from "@/lib/rollup/schema"
import { legacyTables } from "@/lib/rollup/legacy"
import { setRollupMode } from "@/lib/rollup/mode"
import { addDays, isBasis, isDay, isMonth, monthsInclusive, vnToday, type Basis } from "@/lib/rollup/pure"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Rollup Analytics (docs/plans/analytics-rollup.md). Chỉ ĐỌC gohub_dw (SELECT), ghi vào Turso. Bearer CRON_SECRET.
//   ?mode=refresh (mặc định) [&days=45] [&basis=ful|sal]   làm mới N ngày gần nhất (cron-job.org gọi hằng giờ, sau ETL)
//   ?mode=backfill [&basis=][&from=YYYY-MM][&to=YYYY-MM]   dựng lịch sử, làm tiếp phần còn lại mỗi lần gọi
//   ?mode=window&basis=&start=YYYY-MM-DD&end=YYYY-MM-DD    làm mới một cửa sổ ngày [start, end)
//   ?mode=dims                                              bản sao dm_* (khách theo con trỏ, làm tiếp mỗi lần gọi)
//   ?mode=reconcile [&months=3][&basis=][&month=YYYY-MM]    đối chiếu rollup với bảng thô theo tháng
//   ?mode=flag&route=quarterly-report&value=off|shadow|on   đặt chế độ rollup của một route (cờ app_settings rollup_routes)
//   ?mode=legacy [&confirm=drop]                           liệt kê (hoặc xoá) bảng ru_*/dm_* tạm ở DB config
//   ?mode=init | health                                     tạo bảng / xem trạng thái
export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!rollupConfigured()) return NextResponse.json({ ok: false, error: "Chưa cấu hình Turso (ROLLUP_TURSO_* hoặc TURSO_URL/TURSO_AUTH_TOKEN)" }, { status: 503 })
  const q = req.nextUrl.searchParams
  const mode = q.get("mode") || "refresh"
  const basisP = q.get("basis")
  if (basisP && !isBasis(basisP)) return NextResponse.json({ error: "basis phải là ful hoặc sal" }, { status: 400 })
  const bases: Basis[] | undefined = basisP ? [basisP as Basis] : undefined
  const t0 = Date.now()
  const deadline = t0 + 255_000
  try {
    let result: unknown
    if (mode === "init") { await ensureRollupSchema(); result = { dedicated: rollupDedicated(), ...(await health()) } }
    else if (mode === "health") result = { dedicated: rollupDedicated(), ...(await health()) }
    else if (mode === "refresh") result = await refreshRecent(Math.min(Math.max(Number(q.get("days") ?? 45) || 45, 1), 120), bases)
    else if (mode === "legacy") result = await legacyTables(q.get("confirm") === "drop")
    else if (mode === "flag") {
      const [route, value] = [q.get("route"), q.get("value")]
      if (!route || !/^[a-z0-9-]+$/.test(route) || !(value === "off" || value === "shadow" || value === "on")) return NextResponse.json({ error: "Cần route và value=off|shadow|on" }, { status: 400 })
      result = await setRollupMode(route, value)
    }
    else if (mode === "window") {
      const [s, e] = [q.get("start"), q.get("end")]
      if (!basisP || !isDay(s) || !isDay(e)) return NextResponse.json({ error: "Cần basis, start, end (YYYY-MM-DD)" }, { status: 400 })
      result = await refreshWindow(basisP as Basis, s, e)
    }
    else if (mode === "backfill") {
      const [from, to] = [q.get("from") ?? undefined, q.get("to") ?? undefined]
      if ((from && !isMonth(from)) || (to && !isMonth(to))) return NextResponse.json({ error: "from/to dạng YYYY-MM" }, { status: 400 })
      result = await backfillNext(deadline, { basis: basisP as Basis | undefined, from, to })
    }
    else if (mode === "dims") {
      const small = await syncSmallDims()
      result = { small, customers: await syncCustomers(deadline) }
    }
    else if (mode === "reconcile") {
      const month = q.get("month")
      const cur = vnToday().slice(0, 7)
      const months = month ? (isMonth(month) ? [month] : []) : monthsInclusive(addDays(`${cur}-01`, -31 * (Math.min(Math.max(Number(q.get("months") ?? 3) || 3, 1), 24) - 1)).slice(0, 7), cur)
      if (!months.length) return NextResponse.json({ error: "month dạng YYYY-MM" }, { status: 400 })
      const out = []
      for (const b of bases ?? (["ful", "sal"] as Basis[])) for (const m of months) { if (Date.now() > deadline) break; out.push(await reconcileMonth(b, m)) }
      const bad = out.filter(r => !r.ok)
      if (bad.length) await alertCronFailure("rollup-reconcile", new Error(`Rollup lệch bảng thô: ${bad.map(b => `${b.basis} ${b.month}`).join(", ")}`))
      result = { checked: out.length, mismatched: bad.length, results: out }
    }
    else return NextResponse.json({ error: `mode không hợp lệ: ${mode}` }, { status: 400 })
    const ms = Date.now() - t0
    if (mode !== "health") await logRun(mode, basisP, true, ms, result)
    return NextResponse.json({ ok: true, mode, ms, result, at: new Date().toISOString() })
  } catch (e) {
    const msg = (e as Error).message
    await logRun(mode, basisP, false, Date.now() - t0, { error: msg }).catch(() => undefined)
    if (mode === "refresh" || mode === "reconcile") await alertCronFailure("rollup-refresh", e)
    return NextResponse.json({ ok: false, mode, error: msg }, { status: 500 })
  }
}
