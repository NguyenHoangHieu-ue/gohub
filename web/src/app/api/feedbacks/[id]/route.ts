import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { status, rejectReason } = await req.json()
  const update: Record<string, string> = { status, updated_at: new Date().toISOString() }
  if (rejectReason) update.reject_reason = rejectReason

  const { error } = await supabaseAdmin
    .from("analytics_feedbacks")
    .update(update)
    .eq("id", params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
