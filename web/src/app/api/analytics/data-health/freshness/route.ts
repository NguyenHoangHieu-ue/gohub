import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery } from "@/lib/analytics-helpers"
import { DATA_HEALTH_ENTRIES, classifyFreshness } from "@/lib/data-health-config"

export const maxDuration = 60

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role !== "creator") throw new Error("Creator only")
  return session
}

async function checkOne(entry: (typeof DATA_HEALTH_ENTRIES)[number]) {
  try {
    let rows = 0
    let latest: string | null = null
    let lastLoaded: string | null = null

    if (entry.source === "gohub_dw") {
      const loadSel = entry.loadCol ? `, MAX(${entry.loadCol})::text AS last_loaded` : ""
      const r = await queryAnalytics<any>(
        `SELECT COUNT(*)::bigint AS n, MAX(${entry.dateCol})::text AS latest${loadSel} FROM ${entry.table}`
      )
      rows = Number(r[0]?.n ?? 0)
      latest = r[0]?.latest ?? null
      lastLoaded = r[0]?.last_loaded ?? null
    } else {
      const { count } = await supabaseAdmin.from(entry.table).select("*", { count: "exact", head: true })
      const { data: row } = await supabaseAdmin
        .from(entry.table).select(entry.dateCol).order(entry.dateCol, { ascending: false }).limit(1).maybeSingle()
      rows = count ?? 0
      latest = (row as any)?.[entry.dateCol] ?? null
    }

    const refDate = lastLoaded ?? latest
    const delayHours = refDate ? (Date.now() - new Date(refDate).getTime()) / 3_600_000 : null
    return {
      key: entry.key, label: entry.label, category: entry.category, relatedTab: entry.relatedTab,
      rows, latest, lastLoaded, delayHours,
      status: classifyFreshness(delayHours, entry),
    }
  } catch (e: any) {
    return {
      key: entry.key, label: entry.label, category: entry.category, relatedTab: entry.relatedTab,
      rows: 0, latest: null, lastLoaded: null, delayHours: null, status: "unknown" as const,
      error: e?.message?.slice(0, 200) ?? "error",
    }
  }
}

export async function GET() {
  try {
    await requireCreator()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const items = await cachedQuery(
    "data-health:freshness:v1",
    () => Promise.all(DATA_HEALTH_ENTRIES.map(checkOne)),
    10,
  )

  return NextResponse.json({ checkedAt: new Date().toISOString(), items })
}
