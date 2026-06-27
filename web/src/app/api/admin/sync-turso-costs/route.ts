import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

function tursoHttpUrl(url: string): string {
  return url.replace(/^libsql:\/\//, "https://").replace(/^http:\/\//, "https://")
}

async function tursoHttp(sql: string): Promise<Record<string, any>[]> {
  const rawUrl = process.env.TURSO_URL || ""
  const token  = process.env.TURSO_AUTH_TOKEN || ""
  if (!rawUrl || !token) throw new Error("Thiếu TURSO_URL hoặc TURSO_AUTH_TOKEN")

  const res = await fetch(`${tursoHttpUrl(rawUrl)}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql } },
        { type: "close" },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`)
  const body = await res.json()
  const result = body.results?.[0]
  if (result?.type !== "ok") throw new Error(`Turso error: ${JSON.stringify(result)}`)
  const cols: string[] = result.response.result.cols.map((c: any) => c.name)
  return result.response.result.rows.map((row: any[]) =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? row[i] ?? null]))
  )
}

// POST — sync channel_group_costs từ Turso vào Supabase analytics_channel_group_costs
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const rows = await tursoHttp(
      "SELECT group_name, month, SUM(amount) AS amount FROM channel_group_costs GROUP BY group_name, month ORDER BY month"
    )
    if (!rows.length) return NextResponse.json({ ok: true, synced: 0, message: "Turso trống" })

    const months = [...new Set(rows.map(r => String(r.month)))]

    // Xóa các tháng cũ trước
    const { error: delError } = await supabaseAdmin
      .from("analytics_channel_group_costs")
      .delete()
      .in("month", months)
    if (delError) throw new Error(`Delete error: ${delError.message}`)

    // Insert mới
    const insertRows = rows
      .map(r => ({ group_name: String(r.group_name || ""), month: String(r.month || ""), amount: Number(r.amount) || 0 }))
      .filter(r => r.group_name && r.month)

    const { error: insError } = await supabaseAdmin
      .from("analytics_channel_group_costs")
      .insert(insertRows)
    if (insError) throw new Error(`Insert error: ${insError.message}`)

    return NextResponse.json({ ok: true, synced: insertRows.length, months: months.length })
  } catch (err: any) {
    console.error("[sync-turso-costs]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — preview số dòng Turso vs Supabase
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const [tursoRows, { count: sbCount }] = await Promise.all([
      tursoHttp("SELECT COUNT(*) AS cnt FROM channel_group_costs"),
      supabaseAdmin.from("analytics_channel_group_costs").select("*", { count: "exact", head: true }),
    ])
    return NextResponse.json({
      turso: parseInt(String(tursoRows[0]?.cnt || 0)),
      supabase: sbCount ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
