import { NextResponse }      from "next/server"
import { getServerSession }  from "next-auth"
import { authOptions }       from "@/lib/auth"
import { queryAnalyticsOne } from "@/lib/analytics-db"

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!process.env.ANALYTICS_DB_PASSWORD) {
    return NextResponse.json({ status: "not_configured", message: "ANALYTICS_DB_PASSWORD chưa set trong Vercel env vars" })
  }

  try {
    const row = await queryAnalyticsOne<{ now: string }>("SELECT NOW() as now")
    return NextResponse.json({ status: "ok", db_time: row?.now, message: "gohub_dw connected" })
  } catch (e: any) {
    return NextResponse.json({ status: "error", message: e.message }, { status: 500 })
  }
}
