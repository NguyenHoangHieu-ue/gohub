import { NextResponse } from "next/server"
import { requireProductTools } from "@/lib/creator-access"
import { buildDestinations, unlimitedOptions } from "@/lib/product-tools/quote"
import { loadQuoteContext } from "../_ctx"

export const dynamic = "force-dynamic"

/** Dữ liệu cho màn Tính giá: danh sách điểm đến (gộp BC + 3HK), mức Unlimited, tỷ giá đang dùng. Không trả bảng giá gốc của vendor. */
export async function GET() {
  if (!(await requireProductTools("price"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const ctx = await loadQuoteContext()
    const { dests } = buildDestinations(ctx)
    return NextResponse.json({
      destinations: dests,
      unlimited: unlimitedOptions(ctx.a),
      fx: { month: ctx.fx.month, hkdPerUsd: ctx.fx.hkdPerUsd, vndPerUsd: ctx.fx.vndPerUsd },
      missing: [!ctx.list && "bảng giá BC Datapool", !ctx.catalog && "danh mục gói Portal BC", !ctx.ncc.length && "bảng giá 3HK"].filter(Boolean),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
