import { NextRequest, NextResponse } from "next/server"
import { requireProductTools } from "@/lib/creator-access"
import { quote, type PlanReq } from "@/lib/product-tools/quote"
import { loadQuoteContext } from "../_ctx"

export const dynamic = "force-dynamic"

const MAX_DAYS = 40
const MAX_PLANS = 12

/** POST { destKey, sim, plans:[{kind, amount, unit, speedMbps?, days[]}], includeDataOnly? } → các dòng giá vốn theo từng nhà cung cấp. */
export async function POST(req: NextRequest) {
  if (!(await requireProductTools("price"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const b = await req.json()
    const sim = b.sim === "SIM" ? "SIM" : "eSIM"
    const destKey = String(b.destKey ?? "")
    if (!destKey) return NextResponse.json({ error: "Chưa chọn nước / khu vực" }, { status: 400 })
    const plans: PlanReq[] = (Array.isArray(b.plans) ? b.plans : []).slice(0, MAX_PLANS).map((p: any) => ({
      kind: p?.kind === "Fixed" ? "Fixed" : p?.kind === "Unlimited" ? "Unlimited" : "Daily",
      amount: Number(p?.amount) || 0,
      unit: p?.unit === "MB" ? "MB" : "GB",
      speedMbps: p?.speedMbps != null ? Number(p.speedMbps) || 10 : undefined,
      days: (Array.isArray(p?.days) ? p.days : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 365).slice(0, MAX_DAYS),
    }))
    if (!plans.some(p => p.amount > 0 && p.days.length)) return NextResponse.json({ error: "Chưa chọn dung lượng và số ngày" }, { status: 400 })
    const ctx = await loadQuoteContext()
    return NextResponse.json({ ...quote(ctx, { destKey, sim, plans, includeDataOnly: b.includeDataOnly === true }), fx: { month: ctx.fx.month } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
