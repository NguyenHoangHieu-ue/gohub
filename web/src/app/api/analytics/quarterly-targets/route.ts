import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery } from "@/lib/turso"
import { canWriteTab } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator", "bod", "b2b", "b2c", "staff"]

// Lưu/lấy target quý từ Turso table: target_planning_quarter
// Schema: id TEXT PK, quarter TEXT, channel TEXT, target_revenue REAL,
//         target_cm1 REAL, target_three_hk_pct REAL, updated_by TEXT, updated_at TEXT
// Nhất quán với gohub-report/gohub.py (save_quarter_targets / cm1_quarter).

async function ensureTable() {
  await tursoQuery(
    `CREATE TABLE IF NOT EXISTS target_planning_quarter (
      id TEXT PRIMARY KEY,
      quarter TEXT NOT NULL,
      channel TEXT NOT NULL,
      target_revenue REAL DEFAULT 0,
      target_cm1 REAL DEFAULT 0,
      target_three_hk_pct REAL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT
    )`
  )
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const quarter = req.nextUrl.searchParams.get("quarter") || ""
  const year    = req.nextUrl.searchParams.get("year")    || ""
  if (!quarter || !year) return NextResponse.json({ targets: null })

  const q = `${quarter}-${year}`   // VD: "Q3-2026"

  try {
    const rows = await tursoQuery<{
      channel: string
      target_revenue: string | number
      target_cm1: string | number
      target_three_hk_pct: string | number
    }>(
      `SELECT channel, target_revenue, target_cm1, target_three_hk_pct
       FROM target_planning_quarter WHERE quarter = ?`,
      [q]
    )

    if (rows.length === 0) return NextResponse.json({ targets: null })

    const b2b = rows.find(r => r.channel === "B2B")
    const b2c = rows.find(r => r.channel === "B2C")
    const n = (v: string | number | undefined) => parseFloat(String(v ?? 0)) || 0

    return NextResponse.json({
      targets: {
        b2bRev: n(b2b?.target_revenue),  b2bCm1: n(b2b?.target_cm1),  b2bThk: n(b2b?.target_three_hk_pct),
        b2cRev: n(b2c?.target_revenue),  b2cCm1: n(b2c?.target_cm1),  b2cThk: n(b2c?.target_three_hk_pct),
      },
    })
  } catch {
    return NextResponse.json({ targets: null })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Ưu tiên kiểm tra session role trực tiếp (nhanh, không cần DB round-trip).
  // Fallback canWriteTab cho user được grant explicit writable_tabs.
  const sessionRole = (session.user as any).role as string ?? ""
  const ok = WRITE_ROLES.includes(sessionRole) || await canWriteTab(session.user.username, "quarterly", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { quarter, year, targets } = await req.json()
  if (!quarter || !year) return NextResponse.json({ error: "quarter and year required" }, { status: 400 })

  const q   = `${quarter}-${year}`
  const by  = (session.user as any).username || session.user.email || "web"
  const now = new Date().toISOString()

  try {
    await ensureTable()

    for (const [ch, rev, cm1, thk] of [
      ["B2B", targets.b2bRev ?? 0, targets.b2bCm1 ?? 0, targets.b2bThk ?? 0],
      ["B2C", targets.b2cRev ?? 0, targets.b2cCm1 ?? 0, targets.b2cThk ?? 0],
    ] as [string, number, number, number][]) {
      await tursoQuery(
        `INSERT OR REPLACE INTO target_planning_quarter
           (id, quarter, channel, target_revenue, target_cm1, target_three_hk_pct, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${q}_${ch}`, q, ch, rev, cm1, thk, by, now]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[quarterly-targets POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
