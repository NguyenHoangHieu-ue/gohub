import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"
import { embedText }                 from "@/lib/kb"
import type { MrpPlan, MrpProposedPage } from "@/lib/mrp"

// GET — lấy trạng thái job
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("kb_processing_jobs")
    .select("id, document_id, document_name, status, plan_json, result_json, error_text, created_at")
    .eq("id", params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH — approve hoặc reject
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const { action } = await req.json()

  const { data: job } = await supabaseAdmin
    .from("kb_processing_jobs")
    .select("id, status, plan_json")
    .eq("id", params.id)
    .single()
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
  if (job.status !== "plan_ready") return NextResponse.json({ error: "Job not ready" }, { status: 400 })

  if (action === "reject") {
    await supabaseAdmin.from("kb_processing_jobs")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", params.id)
    return NextResponse.json({ status: "rejected" })
  }

  if (action === "approve") {
    const plan = job.plan_json as MrpPlan
    const createdPages: string[] = []
    const errors: string[] = []

    for (const p of (plan.proposed_pages ?? []) as MrpProposedPage[]) {
      try {
        let embedding: number[] | null = null
        try {
          embedding = await embedText(`${p.title}\n\n${p.content}`.slice(0, 2000))
        } catch { /* embed failure không block creation */ }

        const { data: created, error: createErr } = await supabaseAdmin
          .from("kb_wiki_pages")
          .insert({
            title:      p.title,
            content:    p.content,
            page_type:  p.page_type ?? "note",
            department: p.department ?? "all",
            tags:       p.tags ?? [],
            embedding,
            version:    1,
            created_by: username,
            updated_by: username,
          })
          .select("id, title")
          .single()

        if (createErr) errors.push(`${p.title}: ${createErr.message}`)
        else if (created) createdPages.push(created.title)
      } catch (e: any) {
        errors.push(`${p.title}: ${e.message}`)
      }
    }

    await supabaseAdmin.from("kb_processing_jobs")
      .update({
        status:      "done",
        result_json: { created_pages: createdPages, errors },
        updated_at:  new Date().toISOString(),
      })
      .eq("id", params.id)

    return NextResponse.json({ status: "done", created_pages: createdPages, errors })
  }

  return NextResponse.json({ error: "Invalid action — use approve or reject" }, { status: 400 })
}
