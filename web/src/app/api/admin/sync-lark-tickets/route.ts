import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getLarkToken } from "@/lib/lark"

const LARK_API = "https://open.larksuite.com/open-apis"

function getLarkString(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "string") return val.trim()
  if (Array.isArray(val)) {
    if (!val.length) return ""
    const first = val[0]
    if (typeof first === "object" && first !== null) {
      return ((first as any).text || (first as any).name || JSON.stringify(first)).trim()
    }
    return String(first).trim()
  }
  if (typeof val === "object") {
    return ((val as any).text || (val as any).name || JSON.stringify(val)).trim()
  }
  return String(val).trim()
}

// POST /api/admin/sync-lark-tickets — trigger sync from Lark Base → Supabase
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const authHeader = _req.headers.get("authorization")
  const isCronAuthed = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!session && !isCronAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session && !["admin", "creator"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Cắt phần dư nếu user paste cả URL fragment (vd "tbl27...&view=vew..." → chỉ lấy "tbl27...").
  // Tránh lỗi 1254041 TableIdNotFound khi env vô tình kèm "&view=" / "?" / khoảng trắng.
  const clean = (v: string) => v.split(/[&?\s]/)[0].trim()
  const appToken   = clean(process.env.LARK_BASE_ID  || "")
  const tableId    = clean(process.env.LARK_TABLE_ID || "")

  if (!appToken || !tableId) {
    return NextResponse.json({
      error: "Thiếu env vars: LARK_BASE_ID và LARK_TABLE_ID (token của Lark Base app)",
    }, { status: 400 })
  }

  try {
    const token = await getLarkToken()
    let pageToken: string | undefined
    let totalSynced = 0

    do {
      const url = new URL(`${LARK_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`)
      url.searchParams.set("page_size", "500")   // max Lark bitable — giảm số vòng (18k records ~37 trang thay vì 181)
      if (pageToken) url.searchParams.set("page_token", pageToken)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()

      if (body.code !== 0) {
        throw new Error(`Lark API error (${body.code}): ${body.msg}`)
      }

      const items: any[] = body.data?.items || []
      if (!items.length) break

      const rows = items
        .map((item: any) => {
          const f = item.fields || {}
          const lark_record_id = item.record_id || ""
          if (!lark_record_id) return null

          let creation_date = Number(f["Creation Date"] || 0)
          if (!Number.isFinite(creation_date)) {
            const dv = f["Creation Date"]
            if (dv) creation_date = new Date(String(dv)).getTime()
          }
          if (!Number.isFinite(creation_date)) creation_date = 0

          const htField = f["Leadtime Done Ticket (Minutes)"]
          let leadtime_minutes = typeof htField === "number"
            ? htField
            : parseFloat(getLarkString(htField).replace(/[^0-9.-]/g, "") || "0")
          if (!Number.isFinite(leadtime_minutes)) leadtime_minutes = 0

          return {
            lark_record_id,
            ticket_no:        getLarkString(f["Ticket No."]),
            order_no:         getLarkString(f["Order No."]),
            sku:              getLarkString(f["SKU"]),
            ticket_type:      getLarkString(f["Ticket Type"]),
            issue_detail:     getLarkString(f["Issue Detail"]),
            details:          getLarkString(f["Details"]),
            source:           getLarkString(f["Source"]),
            channel:          getLarkString(f["Channel"]),
            vendor:           getLarkString(f["Vendor"]),
            handler:          getLarkString(f["Ticket Handler"] ?? f["PIC (CS-OPs)"] ?? f["Handler"]),
            product_action:   getLarkString(f["Product Action"]),
            money_action:     getLarkString(f["Money Action"]),
            creation_date,
            ticket_status:    getLarkString(f["Ticket Status"]),
            leadtime_minutes,
            source_1:         getLarkString(f["Source-1"]),
            updated_at:       new Date().toISOString(),
          }
        })
        .filter(Boolean)

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from("lark_cs_tickets")
          .upsert(rows as any[], { onConflict: "lark_record_id", ignoreDuplicates: false })
        if (error) throw new Error(`Supabase upsert error: ${error.message}`)
      }

      totalSynced += items.length
      pageToken = body.data?.page_token

      if (totalSynced >= 50000) break
    } while (pageToken)

    return NextResponse.json({ ok: true, totalSynced })
  } catch (err: any) {
    console.error("[sync-lark-tickets]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — quick count to show current state
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { count } = await supabaseAdmin
    .from("lark_cs_tickets")
    .select("*", { count: "exact", head: true })

  const { data: latest } = await supabaseAdmin
    .from("lark_cs_tickets")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  // Trả trạng thái chi tiết để debug: từng env var có được đọc không.
  const hasBaseId    = !!process.env.LARK_BASE_ID
  const hasTableId   = !!process.env.LARK_TABLE_ID
  const hasAppId     = !!process.env.LARK_APP_ID
  const hasAppSecret = !!process.env.LARK_APP_SECRET

  return NextResponse.json({
    count: count ?? 0,
    lastSync: latest?.updated_at ?? null,
    configured: hasBaseId && hasTableId,
    envCheck: {
      LARK_BASE_ID:    hasBaseId    ? "✅ set" : "❌ missing",
      LARK_TABLE_ID:   hasTableId   ? "✅ set" : "❌ missing",
      LARK_APP_ID:     hasAppId     ? "✅ set" : "❌ missing (cần để xác thực bot)",
      LARK_APP_SECRET: hasAppSecret ? "✅ set" : "❌ missing (cần để xác thực bot)",
    },
  })
}
