import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { analyzeMrpDocument }       from "@/lib/mrp"

// POST — tạo MRP job + phân tích tài liệu với Gemini
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { document_id } = await req.json()
  if (!document_id) return NextResponse.json({ error: "document_id required" }, { status: 400 })

  // Lấy metadata document
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("kb_documents")
    .select("id, name")
    .eq("id", document_id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  // Tạo job record (status=analyzing)
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("kb_processing_jobs")
    .insert({ document_id, document_name: doc.name, status: "analyzing" })
    .select("id")
    .single()
  if (jobErr || !job) return NextResponse.json({ error: jobErr?.message ?? "Cannot create job" }, { status: 500 })

  // Reconstruct text từ chunks
  const { data: chunks } = await supabaseAdmin
    .from("kb_chunks")
    .select("content, chunk_index")
    .eq("document_id", document_id)
    .order("chunk_index")
    .limit(20)

  const text = (chunks ?? []).map((c: any) => c.content).join("\n")
  if (!text.trim()) {
    await supabaseAdmin.from("kb_processing_jobs")
      .update({ status: "error", error_text: "Không đọc được nội dung", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return NextResponse.json({ error: "Không đọc được nội dung document" }, { status: 422 })
  }

  // Phân tích với Gemini
  try {
    const plan = await analyzeMrpDocument(text, doc.name)
    await supabaseAdmin.from("kb_processing_jobs")
      .update({ status: "plan_ready", plan_json: plan, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return NextResponse.json({ id: job.id, status: "plan_ready", plan })
  } catch (e: any) {
    await supabaseAdmin.from("kb_processing_jobs")
      .update({ status: "error", error_text: e.message, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return NextResponse.json({ error: `MRP failed: ${e.message}` }, { status: 500 })
  }
}
