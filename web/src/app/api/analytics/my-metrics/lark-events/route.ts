import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { getLarkToken } from "@/lib/lark"
import { getChatName } from "@/lib/lark-thread-scan"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3-2026&status=pending_review|confirmed|rejected&metric=sla|vendor_speed (bỏ trống = tất cả)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const status  = req.nextUrl.searchParams.get("status")
  const metric  = req.nextUrl.searchParams.get("metric")

  let q = supabaseAdmin.from("okr_lark_events").select("*").eq("quarter", quarter)
  if (status) q = q.eq("status", status)
  if (metric) q = q.eq("metric", metric)
  const { data, error } = await q.order("request_time", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Hiếu duyệt case cần biết đang ở group nào (Hiếu báo "add 4 group mà không biết case này ở đâu") —
  // resolve tên qua Lark API, cache theo chat_id trong 1 request (thường vài group trùng nhau/nhiều event).
  const chatIds = Array.from(new Set(rows.map((r: any) => r.chat_id).filter(Boolean)))
  const chatNames: Record<string, string> = {}
  if (chatIds.length > 0) {
    try {
      const appToken = await getLarkToken()
      await Promise.all(chatIds.map(async id => { chatNames[id] = await getChatName(id, appToken) }))
    } catch { /* Lark lỗi tạm thời — fallback hiện chat_id thô, không chặn danh sách case */ }
  }
  const itemsWithGroup = rows.map((r: any) => ({ ...r, chat_name: chatNames[r.chat_id] ?? r.chat_id }))

  return NextResponse.json({
    items: itemsWithGroup,
    pending_count:   rows.filter(r => r.status === "pending_review").length,
    confirmed_count: rows.filter(r => r.status === "confirmed").length,
    rejected_count:  rows.filter(r => r.status === "rejected").length,
  })
}
