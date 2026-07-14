import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const BUCKET = "Information"

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return null
  return { username: session.user.username, role: session.user.role }
}

// GET — list files của user (hoặc user khác nếu admin)
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const targetUser = req.nextUrl.searchParams.get("username")
  const isAdmin = user.role === "admin" || user.role === "creator"
  const folder = (targetUser && isAdmin) ? targetUser : user.username

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, { sortBy: { column: "created_at", order: "desc" } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Tạo signed URL cho mỗi file (1 giờ)
  const files = await Promise.all((data || []).map(async (f) => {
    const path = `${folder}/${f.name}`
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
    return { name: f.name, path, size: f.metadata?.size, created_at: f.created_at, url: urlData?.signedUrl }
  }))

  return NextResponse.json(files)
}

// POST — upload file (multipart/form-data)
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  // Max 20MB
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File quá lớn (max 20MB)" }, { status: 400 })

  const ext = file.name.split(".").pop() || "bin"
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${user.username}/${Date.now()}_${safeName}`

  const buf = await file.arrayBuffer()
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, path, name: file.name })
}

// DELETE — xóa file (query param: path)
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "No path" }, { status: 400 })

  const isAdmin = user.role === "admin" || user.role === "creator"
  // Chỉ xóa file của mình trừ khi admin
  if (!isAdmin && !path.startsWith(`${user.username}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
