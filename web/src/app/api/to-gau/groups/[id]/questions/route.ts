import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email / chat_questions.asked_by lưu USERNAME, không phải email thật.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

const VALID_STATUS = ["chua", "dang", "da_xu_ly"]

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role     = session.user.role     || ""
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("chat_questions")
    .select("id, group_id, question, asked_by, asked_by_name, status, answer, answered_by, answered_by_name, created_at, updated_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role     = session.user.role     || ""
  const name     = session.user.name     || username
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body     = await req.json()
  const question = (body.question ?? "").trim()
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("chat_questions")
    .insert({
      group_id:      id,
      question,
      asked_by:      username,
      asked_by_name: name,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH ?question_id= — đổi trạng thái và/hoặc trả lời. Bất kỳ thành viên nào trong nhóm đều có thể
// cập nhật (câu hỏi CS mang tính cộng tác — ai biết thông tin thì trả lời/đổi trạng thái được).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username   = session.user.username || ""
  const role       = session.user.role     || ""
  const name       = session.user.name     || username
  const { id }     = params
  const questionId = req.nextUrl.searchParams.get("question_id")

  if (!questionId) return NextResponse.json({ error: "question_id required" }, { status: 400 })
  if (!isPrivileged(role) && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body   = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ("status" in body) {
    if (!VALID_STATUS.includes(body.status)) return NextResponse.json({ error: "status không hợp lệ" }, { status: 400 })
    update.status = body.status
  }
  if ("answer" in body) {
    update.answer           = (body.answer ?? "").trim() || null
    update.answered_by      = update.answer ? username : null
    update.answered_by_name = update.answer ? name      : null
  }

  const { data, error } = await supabaseAdmin
    .from("chat_questions")
    .update(update)
    .eq("id", questionId)
    .eq("group_id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username   = session.user.username || ""
  const role       = session.user.role     || ""
  const { id }     = params
  const questionId = req.nextUrl.searchParams.get("question_id")

  if (!questionId) return NextResponse.json({ error: "question_id required" }, { status: 400 })

  const { data: q, error: fetchErr } = await supabaseAdmin
    .from("chat_questions")
    .select("id, group_id, asked_by")
    .eq("id", questionId)
    .eq("group_id", id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!q)       return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (q.asked_by !== username && !isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("chat_questions").delete().eq("id", questionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
