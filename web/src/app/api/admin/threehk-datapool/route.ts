import { NextResponse } from "next/server"
import { loadAssumptions, loadFx, requireAdmin } from "@/lib/bc-datapool/server"
import { loadFrames, loadNcc3hk } from "@/lib/threehk-datapool/server"

export const dynamic = "force-dynamic"

/** Dữ liệu nền cho màn "Tạo sản phẩm" vendor 3HK: bảng giá ncc_3hk, tỷ giá nội bộ, công thức Datapool, giá khung. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const [ncc, assumptions, frames] = await Promise.all([loadNcc3hk(), loadAssumptions(), loadFrames()])
    let fx = null, fxError: string | null = null
    try { fx = await loadFx() } catch (e) { fxError = (e as Error).message }
    return NextResponse.json({ ncc, assumptions, frames, fx, fxError })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
