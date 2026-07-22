import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Lưu chi phí kênh nhập tay cho từng KH B2B theo tháng (batch upsert).
// Body: { costs: [{ month, customer_code, cost_type, cost_value, cost_lines }] }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !["admin", "creator"].includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const costs: any[] = Array.isArray(body?.costs) ? body.costs : []
    if (costs.length === 0)
      return NextResponse.json({ error: "Không có dòng chi phí nào để lưu" }, { status: 400 })

    const now = new Date().toISOString()
    const updatedBy = session.user.email || session.user.name || "unknown"

    const rows = costs.map((c: any) => {
      const month = String(c.month || "").trim()
      const code = String(c.customer_code || "").trim()
      if (!month || !code) return null
      // cost_lines lưu dạng JSON string cho đồng bộ; chuẩn hoá value/type
      let lines: any[] = []
      try { lines = typeof c.cost_lines === "string" ? JSON.parse(c.cost_lines) : (Array.isArray(c.cost_lines) ? c.cost_lines : []) } catch { lines = [] }
      const cleanLines = lines
        .map((l: any) => ({ label: String(l?.label ?? ""), type: l?.type === "percent" ? "percent" : "amount", value: Number(l?.value) || 0 }))
        .filter((l: any) => l.value !== 0 || l.label)
      // cost_type/cost_value gộp: nếu có percent → percent (tổng %), else amount (tổng đ)
      const hasPct = cleanLines.some((l: any) => l.type === "percent")
      const cost_type = hasPct ? "percent" : "amount"
      const cost_value = hasPct
        ? cleanLines.filter((l: any) => l.type === "percent").reduce((s: number, l: any) => s + l.value, 0)
        : cleanLines.reduce((s: number, l: any) => s + l.value, 0)
      return {
        id: `${month}_${code}`,
        month, customer_code: code,
        cost_type, cost_value,
        cost_lines: JSON.stringify(cleanLines),
        updated_by: updatedBy,
        updated_at: now,
      }
    }).filter(Boolean) as any[]

    if (rows.length === 0)
      return NextResponse.json({ error: "Dòng chi phí không hợp lệ" }, { status: 400 })

    const { error } = await supabaseAdmin
      .from("b2b_customer_cost_monthly")
      .upsert(rows, { onConflict: "id" })

    if (error)
      return NextResponse.json({ error: `Lưu thất bại: ${error.message}` }, { status: 500 })

    return NextResponse.json({ ok: true, saved: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 })
  }
}
