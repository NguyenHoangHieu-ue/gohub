import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { parseQuarterLabel } from "@/lib/okr-helpers"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3-2026&page=0&limit=20
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const page    = parseInt(req.nextUrl.searchParams.get("page")  ?? "0")
  const limit   = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50)

  // Dùng chung parseQuarterLabel (lib/okr-helpers.ts) thay vì tự tính lại — tránh lệch nếu sau này
  // sửa cách xác định range quý mà quên sửa route này (4 route khác trong My Metrics đều dùng chung).
  const { start, end } = parseQuarterLabel(quarter)
  const startDate = `${start}T00:00:00.000Z`
  const endDate   = `${end}T23:59:59.999Z`

  // s195+18-B: "task được tính" giờ = ĐÃ dùng DB tool (khớp định nghĩa mới ở api/analytics/my-metrics
  // + begau-insights) — trước route này liệt kê MỌI chat có response (kể cả trả lời chay), không khớp
  // số "task" hiển thị trên thẻ KPI. Thêm `used_db_tool` để danh sách này đúng là breakdown "case nào
  // được tính" thay vì danh sách chung chung.
  const { data, error, count } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, user_message, ai_response, user_email, user_name, created_at, agent_id, tools_used", { count: "exact" })
    .eq("event_type", "chat")
    .not("ai_response", "is", null)
    .eq("used_db_tool", true)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map(r => ({
    id:           r.id,
    user_message: r.user_message,
    ai_response:  (r.ai_response as string)?.slice(0, 400),   // truncate để không bloat
    channel:      (r.user_email as string)?.startsWith("lark:") ? "Lark" : "Web",
    user:         r.user_name || r.user_email || "—",
    created_at:   r.created_at,
    tools_used:   (r.tools_used as string[] | null) ?? [],
  }))

  return NextResponse.json({ rows, total: count ?? 0, page, limit })
}
