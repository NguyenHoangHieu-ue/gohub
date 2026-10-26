import { NextRequest, NextResponse } from "next/server"
import { cleanAutomatedMailGraph, digestPending } from "@/lib/argon/kho-digest"
import { requireArgonUser } from "@/lib/argon/server"
import { getEntity, listEntities } from "@/lib/argon/graph"
import { listFacts, fold } from "@/lib/argon/facts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET → danh sách thực thể (vendor, thị trường, sản phẩm, khách, người) kèm số nguồn nhắc tới.
// GET ?id=<số> hoặc ?q=<tên> → chi tiết: nhắc ở nguồn nào, liên quan thực thể nào, sự việc đang hiệu lực của nó.
export async function GET(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const id = req.nextUrl.searchParams.get("id"), q = req.nextUrl.searchParams.get("q")
    if (!id && !q) return NextResponse.json({ entities: await listEntities(username) })
    const detail = await getEntity(username, id ? Number(id) : String(q))
    if (!detail) return NextResponse.json({ error: "Không có thực thể này" }, { status: 404 })
    const key = fold(detail.entity.name)
    const facts = (await listFacts(username, { status: ["active"], limit: 800 })).filter(f => fold(f.vendor) === key || fold(f.subject).includes(key)).slice(0, 15)
    return NextResponse.json({ ...detail, facts })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST { max? } → bù graph cho các nguồn đã tóm tắt từ trước (chỉ graph, không trích lại sự việc) + tóm tắt nguồn chưa xử lý. Mỗi lần ≤12 nguồn; bấm lại tới khi `remaining` = 0 (cron đêm cũng tự bù).
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { max?: number; clean?: boolean }
  try {
    if (b.clean) return NextResponse.json({ cleaned: await cleanAutomatedMailGraph(username), entities: (await listEntities(username)).length })   // dọn nhiễu từ mail tự động (OTP/thông báo)
    const r = await digestPending(username, Math.max(1, Math.min(12, Number(b.max) || 12)), Date.now() + 100_000)
    return NextResponse.json({ ...r, entities: (await listEntities(username)).length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
