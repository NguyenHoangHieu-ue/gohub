import { NextRequest, NextResponse } from "next/server"
import { start } from "workflow/api"
import { kpiWatchWorkflow } from "@/workflows/kpi-watch-trial"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const run = await start(kpiWatchWorkflow, ["lark_ou_e5af3c7f447984052c1c5a5c2f5", req.nextUrl.origin])
  return NextResponse.json({ ok: true, runId: run.runId })
}
