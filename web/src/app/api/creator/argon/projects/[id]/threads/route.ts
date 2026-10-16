import { NextRequest, NextResponse } from "next/server"
import { ownProject, requireArgonUser } from "@/lib/argon/server"
import { listBotChats, loadThreadRules, sanitizeThreadRule, saveThreadRules, syncAllThreadRules, syncThreadRule, type ThreadRule } from "@/lib/argon/threads"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Thread trong group Lark (token của BOT, CHỈ ĐỌC) → nguồn của dự án. Mỗi thread = 1 nguồn (tin gốc + mọi trả lời), file/ảnh đính kèm = nguồn riêng.
//   GET → { rules } · GET ?chats=1 → thêm { chats } (các group bot đang ở)
//   POST { rule } → lưu quy tắc + nạp ngay · POST { action:"sync" } → nạp lại mọi quy tắc · DELETE ?ruleId= → xoá quy tắc (nguồn đã nạp giữ nguyên)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const rules = await loadThreadRules(params.id)
  if (req.nextUrl.searchParams.get("chats") !== "1") return NextResponse.json({ rules })
  try { return NextResponse.json({ rules, chats: await listBotChats() }) }
  catch (e) { return NextResponse.json({ rules, chats: [], error: (e as Error).message }) }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; rule?: Partial<ThreadRule> }
  const deadline = Date.now() + 240_000
  try {
    if (b.action === "sync") return NextResponse.json({ results: await syncAllThreadRules(params.id, username, deadline), rules: await loadThreadRules(params.id) })
    if (!b.rule?.chatId) return NextResponse.json({ error: "Chọn group Lark cần đọc" }, { status: 400 })
    const rule = sanitizeThreadRule(b.rule)
    const rules = await loadThreadRules(params.id)
    const next = rules.some(r => r.id === rule.id) ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule].slice(-10)
    await saveThreadRules(params.id, next)
    return NextResponse.json({ results: [await syncThreadRule(params.id, username, rule, deadline)], rules: next })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const ruleId = req.nextUrl.searchParams.get("ruleId")
  const rules = (await loadThreadRules(params.id)).filter(r => r.id !== ruleId)
  await saveThreadRules(params.id, rules)
  return NextResponse.json({ rules })
}
