import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { getEntity, listEntities } from "@/lib/argon/graph"
import { listFacts, fold } from "@/lib/argon/facts"

export const dynamic = "force-dynamic"

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
