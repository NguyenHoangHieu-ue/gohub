import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { loadGpAllowed } from "@/lib/gp-access"
import { decidePendingAction, followupMessage } from "@/lib/agents/creator/approvals"

export const maxDuration = 120

// POST { id, approve } — người dùng duyệt/từ chối hành động Gấu Pro đang chờ (cổng duyệt G0). Chỉ chủ hành động.
// Trả `followup` để UI gửi tiếp cho Gấu Pro làm nốt việc dở.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = session.user.username
  const isCreator = session.user.role === "creator"
  if (!isCreator && !(await loadGpAllowed()).includes(username)) {
    return NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== "string" || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Cần id (string) và approve (boolean)." }, { status: 400 })
  }

  const r = await decidePendingAction({ username, isCreator, id: body.id, approve: body.approve })
  const decided = ["executed", "failed", "rejected"].includes(r.status ?? "")
  return NextResponse.json({ ...r, followup: decided ? followupMessage(r) : null }, { status: decided || r.status ? 200 : 400 })
}
