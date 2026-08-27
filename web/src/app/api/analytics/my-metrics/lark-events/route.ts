import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"

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
  return NextResponse.json({
    items: rows,
    pending_count:   rows.filter(r => r.status === "pending_review").length,
    confirmed_count: rows.filter(r => r.status === "confirmed").length,
    rejected_count:  rows.filter(r => r.status === "rejected").length,
  })
}
