import { NextRequest, NextResponse } from "next/server"
import { flushAnalyticsCacheByPrefixes } from "@/lib/analytics-helpers"
import { monthsYtd, refreshB2CMonthlySnapshots } from "@/lib/b2c-report-snapshot"
import { alertCronFailure } from "@/lib/cron-alert"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function cronAuthorized(req: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return true
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

function warmPath(path: string): string {
  if (process.env.NODE_ENV !== "development" || process.env.CRON_SECRET) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}localPreview=1`
}

async function warm(origin: string, path: string): Promise<{ path: string; ok: boolean; status?: number; error?: string }> {
  const targetPath = warmPath(path)
  try {
    const res = await fetch(`${origin}${targetPath}`, {
      headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
      cache: "no-store",
    })
    return { path: targetPath, ok: res.ok, status: res.status }
  } catch (err) {
    return { path: targetPath, ok: false, error: (err as Error).message }
  }
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const ytdMonths = monthsYtd()
    const requestedMonth = req.nextUrl.searchParams.get("month")
    const mode = req.nextUrl.searchParams.get("mode") ?? "daily"
    const months = requestedMonth
      ? [requestedMonth]
      : mode === "all"
        ? ytdMonths
        : [ytdMonths[ytdMonths.length - 1]]

    const snapshot = await refreshB2CMonthlySnapshots(months)
    const flushed = await flushAnalyticsCacheByPrefixes(["b2c-monthly:", "b2c-leads:"])
    const main = await warm(req.nextUrl.origin, "/api/analytics/b2c/monthly?skipLeads=1")
    const leads = await warm(req.nextUrl.origin, "/api/analytics/b2c/monthly?onlyLeads=1")

    return NextResponse.json({
      ok: main.ok && leads.ok,
      refreshedAt: new Date().toISOString(),
      timezone: "Asia/Ho_Chi_Minh",
      schedule: "0 17 * * *",
      mode,
      snapshot,
      flushed,
      main,
      leads,
    })
  } catch (err) {
    const message = (err as Error)?.message || "Refresh B2C report failed"
    await alertCronFailure("refresh-b2c-report", err)
    return NextResponse.json({
      ok: false,
      refreshedAt: new Date().toISOString(),
      timezone: "Asia/Ho_Chi_Minh",
      schedule: "0 17 * * *",
      error: message,
    }, { status: 500 })
  }
}
