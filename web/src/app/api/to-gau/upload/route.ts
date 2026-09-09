import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

const BUCKET      = "to-gau-files"
const MAX_BYTES   = 20 * 1024 * 1024 // 20 MB
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  // .docx
  "text/plain",
]

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email lưu USERNAME, không phải email thật.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (buckets?.some(b => b.name === BUCKET)) return
  await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role      = session.user.role     || ""

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file    = formData.get("file") as File | null
  const groupId = formData.get("group_id") as string | null

  if (!file)    return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!groupId) return NextResponse.json({ error: "group_id required" }, { status: 400 })

  // Auth guard: phải là thành viên hoặc privileged
  if (!isPrivileged(role) && !(await isMember(groupId, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Validate size
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File quá lớn (tối đa 20MB)" }, { status: 400 })
  }

  // Validate type
  const mimeType = file.type || "application/octet-stream"
  const isImage  = mimeType.startsWith("image/")
  const allowed  = isImage || ALLOWED_MIME.includes(mimeType)
  if (!allowed) {
    return NextResponse.json({ error: "Định dạng file không được hỗ trợ" }, { status: 400 })
  }

  // Ensure bucket exists
  await ensureBucket()

  // Build path
  const timestamp  = Date.now()
  const safeName   = file.name.replace(/[^a-zA-Z0-9._\-]/g, "_")
  const path       = `${groupId}/${timestamp}_${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer      = new Uint8Array(arrayBuffer)

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({
    url:     publicData.publicUrl,
    name:    file.name,
    size:    file.size,
    type:    mimeType,
    isImage,
  })
}
