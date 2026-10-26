import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canWrite } from "@/lib/writable-tabs"
import { listHistory, historyStats } from "@/lib/manual-history/store"
import { restoreEntry } from "@/lib/manual-history/restore"
import { TABLES, canRestore, tableLabel } from "@/lib/manual-history/registry"
import { userOfSession } from "@/lib/manual-history/wire"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const READ_ROLES = ["admin", "creator", "bod", "manager"]
const RESTORE_ROLES = ["admin", "creator"]

// GET ?table=&key=&user=&q=&before=<id>&limit= → lịch sử sửa tay (mới nhất trước) + danh mục bảng + thống kê dung lượng. Chỉ admin/creator/bod/manager.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ""
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const p = req.nextUrl.searchParams
  try {
    const entries = await listHistory({ table: p.get("table") || undefined, key: p.get("key") || undefined, user: p.get("user") || undefined, q: p.get("q") || undefined, beforeId: Number(p.get("before")) || undefined, limit: Number(p.get("limit")) || 50 })
    return NextResponse.json({
      entries: entries.map(e => ({ ...e, tableLabel: tableLabel(e.tbl), restoreBlocked: canRestore(e) })),
      tables: Object.entries(TABLES).map(([id, d]) => ({ id, label: d.label })),
      stats: p.get("stats") === "1" ? await historyStats() : undefined,
      canRestore: RESTORE_ROLES.includes(role),
    })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

// POST { action: "restore", id } → khôi phục số cũ của một mục (chỉ admin/creator). Việc khôi phục cũng được ghi vào lịch sử.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWrite(session, "settings", RESTORE_ROLES))) return NextResponse.json({ error: "Chỉ admin/creator được khôi phục" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: number }
  if (b.action !== "restore" || typeof b.id !== "number") return NextResponse.json({ error: "Cần action=restore và id" }, { status: 400 })
  const r = await restoreEntry(b.id, userOfSession(session))
  return "error" in r ? NextResponse.json({ error: r.error }, { status: 422 }) : NextResponse.json({ ok: true })
}
