import { NextRequest, NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { listProposals, resolveProposal } from "@/lib/assistant/memory-proposals"

export const dynamic = "force-dynamic"

// Đề xuất ghi nhớ của Argon (ARGON-X P1: một trí nhớ). Chỉ Creator.
// GET → danh sách chờ duyệt · POST { id, action: "approve" | "reject" } → duyệt (lưu vào assistant_memory, nguồn "argon-proposal") hoặc bỏ.
export async function GET() {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ proposals: await listProposals(username) })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string }
  if (!b.id || (b.action !== "approve" && b.action !== "reject")) return NextResponse.json({ error: "Cần id và action approve | reject" }, { status: 400 })
  const r = await resolveProposal(username, b.id, b.action)
  return r.ok ? NextResponse.json({ ok: true, message: r.message }) : NextResponse.json({ error: r.message }, { status: 422 })
}
