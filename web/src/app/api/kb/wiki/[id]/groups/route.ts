import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { getDbRole }                 from "@/lib/db-role"

type Ctx = { params: { id: string } }

function isPrivileged(role: string) {
  return role === "admin" || role === "creator"
}

// GET — trạng thái gán nhóm hiện tại của 1 trang (chỉ admin/creator)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getDbRole(session.user.username, session.user.role)
  if (!isPrivileged(role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  const [{ data: page }, { data: rows }] = await Promise.all([
    supabaseAdmin.from("kb_wiki_pages").select("visibility_mode").eq("id", params.id).maybeSingle(),
    supabaseAdmin.from("kb_wiki_page_groups").select("group_id").eq("page_id", params.id),
  ])

  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    visibility_mode: page.visibility_mode ?? "all",
    group_ids: (rows ?? []).map(r => r.group_id),
  })
}

// PUT — thay toàn bộ danh sách nhóm được gán (chỉ admin/creator)
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getDbRole(session.user.username, session.user.role)
  if (!isPrivileged(role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  const body = await req.json()
  const vmode: string = body.visibility_mode === "groups" ? "groups" : "all"
  const groupIds: string[] = vmode === "groups" && Array.isArray(body.group_ids) ? body.group_ids.filter(Boolean) : []

  const { error: updErr } = await supabaseAdmin
    .from("kb_wiki_pages")
    .update({ visibility_mode: vmode })
    .eq("id", params.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Replace toàn bộ dòng gán cũ
  const { error: delErr } = await supabaseAdmin.from("kb_wiki_page_groups").delete().eq("page_id", params.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (vmode === "groups" && groupIds.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from("kb_wiki_page_groups")
      .insert(groupIds.map(gid => ({ page_id: params.id, group_id: gid })))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, visibility_mode: vmode, group_ids: groupIds })
}
