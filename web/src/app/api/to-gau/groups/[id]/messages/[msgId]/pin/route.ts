import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// POST /api/to-gau/groups/[id]/messages/[msgId]/pin — toggle pin
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; msgId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { msgId } = params

  // Lấy trạng thái hiện tại
  const { data: msg, error: fetchErr } = await supabaseAdmin
    .from("chat_messages")
    .select("id, is_pinned")
    .eq("id", msgId)
    .maybeSingle()
  if (fetchErr || !msg) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  // Toggle
  const newPinned = !msg.is_pinned
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .update({ is_pinned: newPinned })
    .eq("id", msgId)
    .select("id, is_pinned")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
