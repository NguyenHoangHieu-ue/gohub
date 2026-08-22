import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// Phân loại audience từ page_type + is_hidden
function deriveAudience(pageType: string, isHidden: boolean): string {
  if (isHidden || pageType === "tab_guide") return "system"
  if (["vendor_profile", "pricing_rule"].includes(pageType)) return "cs-product"
  if (pageType === "process_sop") return "staff"
  return "staff"
}

// Parse trường last_edited_by / last_edited_at từ YAML frontmatter trong content
function parseEditorMeta(content: string): { last_edited_by: string; last_edited_at: string } {
  const byMatch  = content.match(/^last_edited_by:\s*"?([^"\n]*)"?/m)
  const atMatch  = content.match(/^last_edited_at:\s*"?([^"\n]*)"?/m)
  return {
    last_edited_by: byMatch?.[1]?.trim() || "",
    last_edited_at: atMatch?.[1]?.trim() || "",
  }
}

// Cập nhật trường trong YAML frontmatter của content string
function updateFrontmatterField(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^(${key}:\\s*)"?[^"\\n]*"?`, "m")
  if (pattern.test(content)) {
    return content.replace(pattern, `$1"${value}"`)
  }
  // Chèn trước dòng --- đóng frontmatter
  return content.replace(/^(---\n[\s\S]*?)(---)/m, `$1${key}: "${value}"\n$2`)
}

// GET — duyệt/tìm kiếm wiki pages theo role
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role       = session.user.role || ""
  const privileged = isPrivileged(role)

  const q        = req.nextUrl.searchParams.get("q")?.trim() || ""
  const audience = req.nextUrl.searchParams.get("audience") || ""

  // Base query — không lấy content đầy đủ ở list view (tốn bandwidth)
  let query = supabaseAdmin
    .from("kb_wiki_pages")
    .select("id, title, page_type, department, tags, is_hidden, status, updated_at, content")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(80)

  // Không phải admin/creator → ẩn tab_guide và is_hidden
  if (!privileged) {
    query = query.eq("is_hidden", false).neq("page_type", "tab_guide")
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pages = (data ?? []).map(p => {
    const derivedAudience = deriveAudience(p.page_type, p.is_hidden)
    const { last_edited_by, last_edited_at } = parseEditorMeta(p.content || "")
    // Trả content tóm tắt cho list view (250 ký tự đầu phần body, sau frontmatter)
    const bodyStart = (p.content || "").replace(/^---[\s\S]*?---\n?/, "").slice(0, 250)
    return {
      id:             p.id,
      title:          p.title,
      page_type:      p.page_type,
      audience:       derivedAudience,
      tags:           p.tags ?? [],
      updated_at:     p.updated_at,
      last_edited_by,
      last_edited_at,
      preview:        bodyStart,
    }
  })

  // Lọc theo audience param nếu có
  const filtered = audience ? pages.filter(p => p.audience === audience) : pages

  return NextResponse.json({ data: filtered })
}

// GET /[id] — lấy full content 1 trang
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role       = session.user.role || ""
  const privileged = isPrivileged(role)

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: page, error } = await supabaseAdmin
    .from("kb_wiki_pages")
    .select("id, title, page_type, department, tags, is_hidden, status, updated_at, content")
    .eq("id", id)
    .single()

  if (error || !page) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Ẩn system docs với user thường
  if (!privileged && (page.is_hidden || page.page_type === "tab_guide")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const derivedAudience = deriveAudience(page.page_type, page.is_hidden)
  const { last_edited_by, last_edited_at } = parseEditorMeta(page.content || "")

  return NextResponse.json({
    data: {
      ...page,
      audience: derivedAudience,
      last_edited_by,
      last_edited_at,
    },
  })
}

// PATCH — cập nhật nội dung + ghi nhận người sửa
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role) && role !== "manager") {
    return NextResponse.json({ error: "Chỉ admin/creator/manager mới được sửa tài liệu" }, { status: 403 })
  }

  const body = await req.json()
  const { id, content: newContent, editor_name } = body
  if (!id || !newContent) return NextResponse.json({ error: "id và content là bắt buộc" }, { status: 400 })

  const editorName = editor_name || session.user.name || session.user.email || "Unknown"
  const now        = new Date().toISOString().split("T")[0] // YYYY-MM-DD

  // Cập nhật editor meta trong frontmatter
  let updated = updateFrontmatterField(newContent, "last_edited_by", editorName)
  updated     = updateFrontmatterField(updated, "last_edited_at", now)

  const { error } = await supabaseAdmin
    .from("kb_wiki_pages")
    .update({ content: updated, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, last_edited_by: editorName, last_edited_at: now })
}
