import { NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { PACKS } from "@/lib/argon/data-packs"

export const dynamic = "force-dynamic"

// GET → danh sách "gói dữ liệu" (số liệu hệ thống mới nhất) + các quý có thể chọn (quý hiện tại và 3 quý trước).
export async function GET() {
  if (!(await requireArgonUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const vn = new Date(Date.now() + 7 * 3600_000)
  let q = Math.floor(vn.getUTCMonth() / 3) + 1, y = vn.getUTCFullYear()
  const quarters: string[] = []
  for (let i = 0; i < 4; i++) { quarters.push(`Q${q}-${y}`); q--; if (q === 0) { q = 4; y-- } }
  return NextResponse.json({ packs: PACKS, quarters })
}
