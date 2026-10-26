import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { activeAlerts, dismissAlert, listAlerts } from "@/lib/argon/kpi-watch"

export const dynamic = "force-dynamic"

// Cảnh báo KPI lệch kế hoạch của Trợ lý (ARGON-X P2). Chỉ Creator.
// GET → cảnh báo đang hiện · POST { id, action: "dismiss" } → bỏ qua 7 ngày (nặng hơn thì báo lại).
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ alerts: activeAlerts(await listAlerts(username)) })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string }
  if (!b.id || b.action !== "dismiss") return NextResponse.json({ error: "Cần id và action dismiss" }, { status: 400 })
  return (await dismissAlert(username, b.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không thấy cảnh báo" }, { status: 404 })
}
