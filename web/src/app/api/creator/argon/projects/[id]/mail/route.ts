import { NextRequest, NextResponse } from "next/server"
import { ownProject, requireArgonUser } from "@/lib/argon/server"
import { listFolders } from "@/lib/argon/mail"
import { loadRules, sanitizeRule, saveRules, syncAllRules, syncMailRule } from "@/lib/argon/mail-sync"
import type { MailRule } from "@/lib/argon/mail"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Mail Lark của Creator (CHỈ ĐỌC) → nguồn của dự án theo QUY TẮC nạp (thư mục / người gửi / từ khoá / số ngày). Mỗi luồng thư = 1 nguồn `mail`,
// đính kèm pdf/docx/xlsx/pptx/csv/txt/md thành nguồn file riêng.
//   GET → { rules, folders } · POST { rule } → lưu quy tắc + nạp ngay · POST { action:"sync" } → nạp lại mọi quy tắc · DELETE ?ruleId= → xoá quy tắc (nguồn đã nạp giữ nguyên)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const rules = await loadRules(params.id)
  try { return NextResponse.json({ rules, folders: await listFolders() }) }
  catch (e) { return NextResponse.json({ rules, folders: [], error: (e as Error).message }) }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; rule?: Partial<MailRule> }
  try {
    if (b.action === "sync") return NextResponse.json({ results: await syncAllRules(params.id, username), rules: await loadRules(params.id) })
    if (!b.rule) return NextResponse.json({ error: "Thiếu quy tắc" }, { status: 400 })
    const rule = sanitizeRule(b.rule)
    const rules = await loadRules(params.id)
    const next = rules.some(r => r.id === rule.id) ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule].slice(-10)
    await saveRules(params.id, next)
    const result = await syncMailRule(params.id, username, rule)
    return NextResponse.json({ results: [result], rules: next })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const ruleId = req.nextUrl.searchParams.get("ruleId")
  const rules = (await loadRules(params.id)).filter(r => r.id !== ruleId)
  await saveRules(params.id, rules)
  return NextResponse.json({ rules })
}
