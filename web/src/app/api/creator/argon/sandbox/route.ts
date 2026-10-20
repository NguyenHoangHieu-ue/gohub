import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { addUsage, buildSnapshot, cpuLimitMs, getSnapshotInfo, getUsage, quotaState, realBackend } from "@/lib/argon/sandbox"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET → quota Sandbox tháng này (CPU đã dùng / trần) + đã có môi trường Python chưa · POST { action:"build" } → dựng môi trường (pip install pandas…, mở mạng, vài phút, chỉ Creator).
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const [usage, snap] = await Promise.all([getUsage(), getSnapshotInfo()])
  const limit = cpuLimitMs()
  return NextResponse.json({ cpuMs: usage.cpuMs, runs: usage.runs, limitMs: limit, fraction: quotaState(usage.cpuMs, limit).fraction, snapshot: snap ? { at: snap.at, packages: snap.packages } : null })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { action?: string }
  if (b.action !== "build") return NextResponse.json({ error: 'Chỉ có action "build"' }, { status: 400 })
  const q = quotaState((await getUsage()).cpuMs)
  if (!q.ok) return NextResponse.json({ error: q.message }, { status: 429 })
  const t0 = Date.now()
  try {
    const id = await buildSnapshot(await realBackend())
    await addUsage(Date.now() - t0)
    return NextResponse.json({ ok: true, snapshotId: id, seconds: Math.round((Date.now() - t0) / 1000) })
  } catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 600) }, { status: 500 }) }
}
