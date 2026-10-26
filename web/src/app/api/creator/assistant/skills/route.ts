import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { decideLearnedSkill, evalSkillVersion, readRegistry, type SkillDecision } from "@/lib/agents/creator/learned-skills"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Skill Gấu Pro tự học — vòng đời có kiểm soát. Chỉ Creator.
// GET → mọi skill + phiên bản (trạng thái ứng viên/đã duyệt/từ chối/đã gỡ, kết quả kiểm tra tĩnh, nhận xét của model).
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json(await readRegistry())
}

const ACTIONS: SkillDecision[] = ["approve", "reject", "rollback", "retire"]

// POST { name, v, action: approve | reject | rollback | retire } → quyết định của Hiếu (duyệt ứng viên chạy kiểm tra tĩnh lần nữa; skill bị "block" không duyệt được).
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { name?: string; v?: number; action?: SkillDecision | "eval" | "gate" }
  if (b.name && typeof b.v === "number" && b.action === "eval") {   // chấm thử A/B bằng tay (khi lần tự chấm nền bị lỗi)
    const r = await evalSkillVersion(b.name, b.v)
    return r.error ? NextResponse.json({ error: r.error }, { status: 422 }) : NextResponse.json({ ok: true })
  }
  if (b.name && typeof b.v === "number" && b.action === "gate") {   // cổng eval Argon: chạy 4 câu có/không có kỹ năng (đồng bộ ~2–4 phút)
    const { runSkillGate } = await import("@/lib/argon/skill-gate")
    const r = await runSkillGate(b.name, b.v, req.nextUrl.origin)
    return r.error ? NextResponse.json({ error: r.error }, { status: 422 }) : NextResponse.json({ ok: true, gate: r.gate })
  }
  if (!b.name || typeof b.v !== "number" || !b.action || !ACTIONS.includes(b.action as SkillDecision)) return NextResponse.json({ error: "Cần name, v (số) và action hợp lệ" }, { status: 400 })
  const r = await decideLearnedSkill({ name: b.name, v: b.v, action: b.action as SkillDecision, by: username })
  return r.error ? NextResponse.json({ error: r.error }, { status: 409 }) : NextResponse.json({ ok: true })
}
