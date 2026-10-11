// Tính lại cờ used_db_tool của app_usage_events theo luật task mới (s230: isDataTask — thêm GA4/GSC/Lark Base/báo cáo…, bỏ Creator)
// từ cột tools_used + user_role. Chỉ đổi used_db_tool. Mặc định dryRun (đếm trước/sau). Chỉ gọi bằng CRON_SECRET.
// Body: { from: "2026-07-01", to: "2026-12-31", dryRun?: boolean }
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { isDataTask } from "@/lib/okr-helpers"
import { loadChatEvents, isCountedTask } from "@/lib/task-events"

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { from, to, dryRun = true } = await req.json().catch(() => ({})) as { from?: string; to?: string; dryRun?: boolean }
  if (!from || !to) return NextResponse.json({ error: "from, to (YYYY-MM-DD) bắt buộc" }, { status: 400 })

  const { rows, error } = await loadChatEvents("id, user_role, agent_id, ai_response, tools_used, used_db_tool", from, to)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const toTrue: number[] = [], toFalse: number[] = []
  let before = 0, after = 0
  for (const r of rows) {
    const next = isDataTask(r.tools_used, r.user_role)
    if (isCountedTask(r)) before++
    if (next && ((r.ai_response as string) ?? "").trim().length >= 15) after++
    if (next !== !!r.used_db_tool) (next ? toTrue : toFalse).push(r.id as number)
  }

  if (!dryRun) {
    for (const [ids, value] of [[toTrue, true], [toFalse, false]] as const) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error: e } = await supabaseAdmin.from("app_usage_events").update({ used_db_tool: value }).in("id", ids.slice(i, i + 200))
        if (e) return NextResponse.json({ error: e.message, partial: true }, { status: 500 })
      }
    }
  }
  return NextResponse.json({ dryRun, from, to, events: rows.length, tasksBefore: before, tasksAfter: after, setTrue: toTrue.length, setFalse: toFalse.length })
}
