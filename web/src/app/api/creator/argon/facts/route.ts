import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { FACT_TYPES, addManualFact, isoDate, listFacts, updateFact, vnToday, type FactPatch, type FactStatus, type FactType } from "@/lib/argon/facts"

export const dynamic = "force-dynamic"

// GET → sổ sự việc của người dùng (còn hiệu lực + đã qua) và ngày hôm nay theo giờ VN.
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ facts: await listFacts(username, { limit: 600 }), today: vnToday() })
}

const STATUSES: FactStatus[] = ["active", "expired", "superseded", "rejected"]

// PATCH { id, status?, type?, vendor?, subject?, summary?, effective_from?, expires_at?, remind_days? } → sửa/bỏ 1 sự việc.
export async function PATCH(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as FactPatch & { id?: string }
  if (!b.id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 })
  const p: FactPatch = {}
  if (b.status) { if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "status không hợp lệ" }, { status: 400 }); p.status = b.status }
  if (b.type) { if (!(b.type in FACT_TYPES)) return NextResponse.json({ error: "type không hợp lệ" }, { status: 400 }); p.type = b.type }
  for (const k of ["vendor", "subject", "summary"] as const) if (typeof b[k] === "string") p[k] = b[k]!.trim().slice(0, k === "summary" ? 300 : 120)
  for (const k of ["effective_from", "expires_at"] as const) if (k in b) {
    if (b[k] && !isoDate(b[k])) return NextResponse.json({ error: `${k} phải dạng YYYY-MM-DD` }, { status: 400 })
    p[k] = b[k] ? String(b[k]) : null
  }
  if (typeof b.remind_days === "number") p.remind_days = b.remind_days
  const row = await updateFact(username, b.id, p)
  return row ? NextResponse.json({ fact: row }) : NextResponse.json({ error: "Không tìm thấy sự việc" }, { status: 404 })
}

// POST { type, vendor?, subject?, summary, effective_from?, expires_at? } → Hiếu tự ghi một sự việc.
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { type?: string; vendor?: string; subject?: string; summary?: string; effective_from?: string; expires_at?: string }
  const summary = String(b.summary ?? "").trim().slice(0, 300)
  if (!summary) return NextResponse.json({ error: "Thiếu nội dung" }, { status: 400 })
  const type = (b.type && b.type in FACT_TYPES ? b.type : "khac") as FactType
  const fact = await addManualFact(username, { type, vendor: String(b.vendor ?? "").trim().slice(0, 80), subject: String(b.subject ?? "").trim().slice(0, 120), summary, evidence: "", effectiveFrom: isoDate(b.effective_from), expiresAt: isoDate(b.expires_at) })
  return NextResponse.json({ fact })
}
