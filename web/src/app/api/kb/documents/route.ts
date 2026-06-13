import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { parseFileToText, chunkText, embedText, DEPARTMENTS } from "@/lib/kb"
import { createNotification } from "@/lib/notifications"

// GET — list documents
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dept = req.nextUrl.searchParams.get("dept") || ""

  let query = supabaseAdmin
    .from("kb_documents")
    .select("id, name, file_type, department, chunk_count, uploaded_by, created_at")
    .order("created_at", { ascending: false })

  if (dept && DEPARTMENTS.includes(dept as any)) query = query.eq("department", dept)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST — upload + parse + embed
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }) }

  const file       = formData.get("file") as File | null
  const department = (formData.get("department") as string) || "all"
  const customName = (formData.get("name") as string) || ""

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const allowedTypes = ["application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown"]
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const allowed = allowedTypes.includes(file.type) || ["pdf","docx","md","txt"].includes(ext)
  if (!allowed) return NextResponse.json({ error: "Định dạng không hỗ trợ (PDF, DOCX, MD, TXT)" }, { status: 400 })

  const MAX_MB = 10
  if (file.size > MAX_MB * 1024 * 1024)
    return NextResponse.json({ error: `File quá lớn (max ${MAX_MB}MB)` }, { status: 400 })

  // Parse text
  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  try {
    text = await parseFileToText(buffer, file.type, file.name)
  } catch (e: any) {
    return NextResponse.json({ error: `Lỗi đọc file: ${e.message}` }, { status: 422 })
  }

  if (!text.trim()) return NextResponse.json({ error: "File không có nội dung" }, { status: 422 })

  const chunks = chunkText(text)
  if (chunks.length === 0) return NextResponse.json({ error: "Không tách được nội dung" }, { status: 422 })

  // Create document record
  const docName = customName.trim() || file.name.replace(/\.[^.]+$/, "")
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("kb_documents")
    .insert({ name: docName, file_type: ext || "txt", department, uploaded_by: username })
    .select("id")
    .single()

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  // Embed + insert chunks (batched)
  const BATCH = 5
  try {
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const embedded = await Promise.all(batch.map(c => embedText(c)))
      const rows = batch.map((content, j) => ({
        document_id: doc.id,
        content,
        embedding:   embedded[j],
        chunk_index: i + j,
      }))
      const { error: chunkErr } = await supabaseAdmin.from("kb_chunks").insert(rows)
      if (chunkErr) throw chunkErr
    }
  } catch (e: any) {
    // Rollback document if chunks fail
    await supabaseAdmin.from("kb_documents").delete().eq("id", doc.id)
    return NextResponse.json({ error: `Lỗi tạo embeddings: ${e.message}` }, { status: 500 })
  }

  // Update chunk count
  await supabaseAdmin.from("kb_documents").update({ chunk_count: chunks.length }).eq("id", doc.id)

  // Notification (fire-and-forget)
  createNotification(
    "kb_doc",
    `Tài liệu mới: ${docName}`,
    `Upload bởi ${username} — ${chunks.length} chunks`,
    { name: docName, action: "upload", department, chunks: chunks.length, uploaded_by: username },
  )

  return NextResponse.json({ id: doc.id, name: docName, chunk_count: chunks.length })
}
