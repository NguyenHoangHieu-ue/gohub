import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canWrite } from "@/lib/writable-tabs"
import { createNotification } from "@/lib/notifications"
import { loadEffectiveTable, saveMonthlyTable } from "@/lib/fx/server"
import { parseFxWorkbook } from "@/lib/fx/parse"
import { currentMonth, FX_ROWS, monthLabel, MONTHS, setCell, type FxTable } from "@/lib/fx/table"

export const dynamic = "force-dynamic"

async function allowed() {
  const session = await getServerSession(authOptions)
  return !!session && (await canWrite(session, "settings", ["admin", "creator"]))
}

const view = (table: FxTable, source: string, updatedAt: string | null) => ({ table, source, updatedAt, month: currentMonth(), rows: FX_ROWS, months: MONTHS })

export async function GET() {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { table, source, updatedAt } = await loadEffectiveTable()
  return NextResponse.json(view(table, source, updatedAt))
}

/** Sửa từng ô: { changes: [{ id, month, rate | null }] } (null = xoá ô). */
export async function PUT(req: NextRequest) {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const changes: { id: string; month: string; rate: number | null }[] = Array.isArray(body.changes) ? body.changes : []
  if (!changes.length) return NextResponse.json({ error: "Không có thay đổi nào" }, { status: 400 })
  const ids = new Set(FX_ROWS.map(r => r.id))
  let { table } = await loadEffectiveTable()
  for (const c of changes) {
    if (!ids.has(c.id) || !MONTHS.includes(c.month)) return NextResponse.json({ error: `Ô không hợp lệ: ${c.id} ${c.month}` }, { status: 400 })
    if (c.rate != null && !(Number(c.rate) > 0)) return NextResponse.json({ error: `Tỷ giá phải là số dương (${c.id} ${monthLabel(c.month)})` }, { status: 400 })
    table = setCell(table, c.id, c.month, c.rate == null ? null : Number(c.rate))
  }
  try {
    const { flatWritten } = await saveMonthlyTable(table)
    return NextResponse.json({ ...view(table, "monthly", new Date().toISOString()), saved: changes.length, flatWritten })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Nhập từ file Excel "Tỷ giá nội bộ theo tháng.xlsx": ô có trong file ghi đè, ô không có trong file giữ nguyên. */
export async function POST(req: NextRequest) {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const file = (await req.formData()).get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file" }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File quá lớn (tối đa 5MB)" }, { status: 400 })
  let parsed
  try { parsed = parseFxWorkbook(Buffer.from(await file.arrayBuffer())) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }) }

  const { table: old } = await loadEffectiveTable()
  let table = old
  const changed: { id: string; month: string; from: number | null; to: number }[] = []
  for (const [id, byMonth] of Object.entries(parsed.table.values))
    for (const [month, rate] of Object.entries(byMonth)) {
      const from = old.values[id]?.[month] ?? null
      if (from !== rate) { changed.push({ id, month, from, to: rate }); table = setCell(table, id, month, rate) }
    }
  try {
    const { flatWritten } = await saveMonthlyTable(table)
    if (changed.length)
      await createNotification("price_change", `Tỷ giá nội bộ: nhập từ ${file.name} — ${changed.length} ô thay đổi`, "Xem chi tiết ở Admin › Cài đặt › Tỷ Giá Nội Bộ.", { summary: { changed: changed.length } }, "admin_manager")
    return NextResponse.json({ ...view(table, "monthly", new Date().toISOString()), imported: { rows: parsed.rows, cells: parsed.cells }, changed: changed.slice(0, 100), changedCount: changed.length, flatWritten })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
