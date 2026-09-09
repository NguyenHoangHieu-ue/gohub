import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { fetchInventoryAlertThresholds, saveInventoryAlertThresholds } from "@/lib/inventory-thresholds"

const READ_ROLES = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]
const WRITE_ROLES = ["admin", "creator"]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await fetchInventoryAlertThresholds())
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await req.json()
  const safeDays = Number(body.safeDays)
  const normalDays = Number(body.normalDays)
  const warningDays = Number(body.warningDays)
  if (![safeDays, normalDays, warningDays].every(n => Number.isFinite(n) && n > 0))
    return NextResponse.json({ error: "Ngưỡng phải là số dương" }, { status: 400 })
  if (!(safeDays > normalDays && normalDays > warningDays))
    return NextResponse.json({ error: "Thứ tự phải là An toàn > Bình thường > Cần chú ý" }, { status: 400 })
  await saveInventoryAlertThresholds({ safeDays, normalDays, warningDays })
  return NextResponse.json({ ok: true })
}
