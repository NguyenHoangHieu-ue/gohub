/**
 * POST /api/admin/migrate-turso-tickets
 * Đọc toàn bộ lark_tickets từ Turso (gohub-intel) qua HTTP API
 * → upsert vào Supabase lark_cs_tickets
 *
 * Env vars cần:
 *   TURSO_URL        = libsql://gohub-intel-baole.aws-ap-northeast-1.turso.io
 *   TURSO_AUTH_TOKEN = eyJ... (từ .turso-config.json)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Convert Turso libsql:// URL → HTTPS URL for HTTP API
function tursoHttpUrl(url: string): string {
  return url
    .replace(/^libsql:\/\//, "https://")
    .replace(/^http:\/\//, "https://")
}

async function tursoQuery(sql: string, args: unknown[] = []): Promise<Record<string, string | number | null>[]> {
  const rawUrl = process.env.TURSO_URL || ""
  const token  = process.env.TURSO_AUTH_TOKEN || ""
  if (!rawUrl || !token) throw new Error("Thiếu TURSO_URL hoặc TURSO_AUTH_TOKEN trong env vars")

  const base = tursoHttpUrl(rawUrl)
  const res = await fetch(`${base}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(v => ({ type: "text", value: String(v ?? "") })) } },
        { type: "close" },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Turso HTTP error ${res.status}: ${await res.text()}`)

  const body = await res.json()
  const result = body.results?.[0]
  if (result?.type !== "ok") throw new Error(`Turso query error: ${JSON.stringify(result)}`)

  const cols: string[] = result.response.result.cols.map((c: any) => c.name)
  const rows: any[][]  = result.response.result.rows

  return rows.map(row =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? row[i] ?? null]))
  )
}

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // Count total tickets in Turso
    const countRows = await tursoQuery("SELECT COUNT(*) as cnt FROM lark_tickets")
    const total = parseInt(String(countRows[0]?.cnt || 0))

    let offset = 0
    const batchSize = 200
    let totalUpserted = 0

    while (offset < total) {
      const rows = await tursoQuery(
        `SELECT * FROM lark_tickets ORDER BY creation_date DESC LIMIT ${batchSize} OFFSET ${offset}`
      )

      if (!rows.length) break

      const upsertRows = rows.map(r => ({
        lark_record_id:  String(r.lark_record_id || ""),
        ticket_no:       String(r.ticket_no || ""),
        order_no:        String(r.order_no  || ""),
        sku:             String(r.sku        || ""),
        ticket_type:     String(r.ticket_type || ""),
        issue_detail:    String(r.issue_detail || ""),
        details:         String(r.details    || ""),
        source:          String(r.source     || ""),
        channel:         String(r.channel    || ""),
        vendor:          String(r.vendor     || ""),
        handler:         String(r.handler    || ""),
        product_action:  String(r.product_action || ""),
        money_action:    String(r.money_action   || ""),
        creation_date:   r.creation_date ? Number(r.creation_date) : null,
        ticket_status:   String(r.ticket_status || ""),
        leadtime_minutes: r.leadtime_minutes ? Number(r.leadtime_minutes) : null,
        source_1:        String(r.source_1   || ""),
        updated_at:      new Date().toISOString(),
      })).filter(r => r.lark_record_id)

      if (upsertRows.length > 0) {
        const { error } = await supabaseAdmin
          .from("lark_cs_tickets")
          .upsert(upsertRows, { onConflict: "lark_record_id", ignoreDuplicates: false })
        if (error) throw new Error(`Supabase upsert error: ${error.message}`)
      }

      totalUpserted += upsertRows.length
      offset += batchSize
    }

    return NextResponse.json({ ok: true, total, totalUpserted })
  } catch (err: any) {
    console.error("[migrate-turso-tickets]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — check Turso connection and ticket count
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const configured = !!(process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN)
  if (!configured) {
    return NextResponse.json({ configured: false, message: "TURSO_URL và TURSO_AUTH_TOKEN chưa set" })
  }

  try {
    const rows = await tursoQuery("SELECT COUNT(*) as cnt FROM lark_tickets")
    return NextResponse.json({ configured: true, tursoTickets: parseInt(String(rows[0]?.cnt || 0)) })
  } catch (err: any) {
    return NextResponse.json({ configured: true, error: err.message }, { status: 500 })
  }
}
