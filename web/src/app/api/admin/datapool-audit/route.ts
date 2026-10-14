import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { requireAdmin } from "@/lib/bc-datapool/server"
import { buildAuditWorkbook } from "@/lib/datapool-audit/export"
import { ALL_VENDORS, runAudit, loadState, diffInputs, runAuditAndNotify, ACTIVE_STATUSES } from "@/lib/datapool-audit/server"
import type { AuditVendor } from "@/lib/datapool-audit/engine"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const vendorsOf = (v: string | null): AuditVendor[] => (v && (ALL_VENDORS as string[]).includes(v) ? [v as AuditVendor] : ALL_VENDORS)
const statusesOf = (s: string | null) => (s === "all" ? null : ACTIVE_STATUSES)
const MAX_ROWS = 4000

/**
 * GET ?vendor=ALL|3HK|BC_CMHK|BC_SINGTEL&status=active|all → soát: tính lại giá vốn từng SKU đang có rồi so với hệ thống.
 *   Trả số đếm + các dòng KHÔNG khớp tuyệt đối (lệch / làm tròn / bỏ qua / chưa có giá) + đầu vào đã đổi so với lần soát tự động trước.
 * POST ?format=xlsx { vendor, status, verdicts: ["diff","nocogs"] | "all" } → file Excel có công thức · POST { action: "notify" } → soát + DM thử ngay.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    const [run, state] = await Promise.all([runAudit(vendorsOf(sp.get("vendor")), statusesOf(sp.get("status"))), loadState()])
    const shown = run.rows.filter(r => r.verdict !== "match")
    const levels = run.inputs.levels
    return NextResponse.json({
      summary: run.summary,
      rows: shown.slice(0, MAX_ROWS).map(({ calc: _c, ...r }) => (void _c, r)),
      truncated: shown.length > MAX_ROWS,
      inputs: { fx: run.inputs.fx, fixedPct: run.inputs.fixedPct, dailyPct: run.inputs.dailyPct, levels, frames: run.inputs.frames, whiteSimVnd: run.inputs.whiteSimVnd },
      changed: diffInputs(state?.inputs, run.inputs),
      last: state ? { at: state.at, notifiedAt: state.notifiedAt ?? null, counts: state.counts } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { action?: string; vendor?: string; status?: string; verdicts?: string[] | "all" }
  try {
    if (body.action === "notify") {
      const r = await runAuditAndNotify("Hiếu bấm \"Gửi DM kiểm tra\" ở tab Soát giá vốn", true)
      return NextResponse.json({ ok: true, ...r })
    }
    if (req.nextUrl.searchParams.get("format") !== "xlsx") return NextResponse.json({ error: "Thiếu format=xlsx hoặc action" }, { status: 400 })
    const run = await runAudit(vendorsOf(body.vendor ?? null), statusesOf(body.status ?? null))
    const want = body.verdicts === "all" ? null : new Set(Array.isArray(body.verdicts) && body.verdicts.length ? body.verdicts : ["diff", "nocogs"])
    const rows = run.rows.filter(r => !want || want.has(r.verdict))
    if (!rows.length) return NextResponse.json({ error: "Không có SKU nào theo bộ lọc này — không có gì để xuất" }, { status: 422 })
    const buf = XLSX.write(buildAuditWorkbook(rows, run.ctx), { type: "buffer", bookType: "xlsx" }) as Buffer
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="soat_gia_von_datapool_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
