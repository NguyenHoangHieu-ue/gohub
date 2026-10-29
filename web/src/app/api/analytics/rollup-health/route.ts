import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { requireArgonUser } from "@/lib/argon/server"
import { health } from "@/lib/rollup/builder"
import { rollupConfigured, rollupDedicated } from "@/lib/rollup/client"

export const dynamic = "force-dynamic"

// Trạng thái Rollup cho Creator (Data Map): số ngày/dòng đã dựng, phiên bản dữ liệu, lần làm mới, hạn mức ghi, nhật ký chạy.
export async function GET(req: NextRequest) {
  if (!isCronReq(req) && !(await requireArgonUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!rollupConfigured()) return NextResponse.json({ configured: false })
  try { return NextResponse.json({ configured: true, dedicated: rollupDedicated(), ...(await health()) }) }
  catch (e) { return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 500 }) }
}
