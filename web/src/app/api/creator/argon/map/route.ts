import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { readEvents, readRun, recentRuns } from "@/lib/agent-events"
import { argonIndexConfigured } from "@/lib/argon/index-db"
import { buildGraph } from "@/lib/system-map"
import { ALL_TOOL_DECLARATIONS } from "@/lib/agents/creator/declarations"
import { BE_GAU_CORE_TOOLS } from "@/lib/agents/be-gau"
import { ARGON_TOOLS } from "@/lib/argon/tools"
import { WS_TOOLS } from "@/lib/argon/ws-tools"
import { SOURCE_TOOLS } from "@/lib/argon/source-tools"
import { KHO_TOOLS } from "@/lib/argon/kho-tools"
import { SQL_TOOL } from "@/lib/argon/sql-tool"
import { RUN_CODE_TOOL } from "@/lib/argon/code-tool"
import { ASK_TOOL } from "@/lib/argon/ask-tool"
import { PATCH_TOOL } from "@/lib/argon/patch-tool"
import { FORECAST_TOOL, SCORE_TOOL } from "@/lib/argon/forecast-tool"

export const dynamic = "force-dynamic"

const names = (d: { name?: string }[]) => d.map(x => String(x.name)).filter(Boolean)

// GET → đồ thị (dựng từ danh sách công cụ thật) + lượt gần đây. ?since=<ms> → thêm sự kiện mới hơn mốc đó (cho hiệu ứng động). ?run=<id> → toàn bộ sự kiện 1 lượt (phát lại).
export async function GET(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const run = sp.get("run")
  if (run) return NextResponse.json({ events: await readRun(run) })
  const since = Number(sp.get("since"))
  if (Number.isFinite(since) && since > 0) return NextResponse.json({ events: await readEvents(since), now: Date.now() })
  const gauPro = names(ALL_TOOL_DECLARATIONS)
  const agentTools = {
    "gau-pro": gauPro,
    "be-gau": Array.from(new Set([...BE_GAU_CORE_TOOLS, ...gauPro.filter(n => n !== "webSearch")])),
    argon: Array.from(new Set(names([...ARGON_TOOLS, ...WS_TOOLS, SQL_TOOL, RUN_CODE_TOOL, ASK_TOOL, PATCH_TOOL, FORECAST_TOOL, SCORE_TOOL, ...SOURCE_TOOLS, ...KHO_TOOLS]))),
  }
  const graph = buildGraph(agentTools)
  return NextResponse.json({
    ...graph, now: Date.now(), eventsEnabled: argonIndexConfigured(),
    toolCounts: { "be-gau": agentTools["be-gau"].length, "gau-pro": agentTools["gau-pro"].length, argon: agentTools.argon.length },
    runs: await recentRuns(25),
  })
}
