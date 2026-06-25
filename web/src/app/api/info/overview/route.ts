import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const BUCKET = "Information"

// GET — admin/creator xem tổng quan: mỗi user có bao nhiêu notes + files
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = session.user.role as string
  if (role !== "admin" && role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [{ data: users }, { data: notes }] = await Promise.all([
    supabaseAdmin.from("users").select("username, name, role, lark_open_id").order("name"),
    supabaseAdmin.from("user_notes").select("username, id, updated_at"),
  ])

  // Count files per user từ Storage root folders
  const { data: folders } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 200 })
  const fileCounts: Record<string, number> = {}
  await Promise.all((folders || []).map(async (f) => {
    const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(f.name, { limit: 200 })
    fileCounts[f.name] = files?.length || 0
  }))

  const noteCounts: Record<string, { count: number; lastUpdated: string | null }> = {}
  for (const note of notes || []) {
    if (!noteCounts[note.username]) noteCounts[note.username] = { count: 0, lastUpdated: null }
    noteCounts[note.username].count++
    if (!noteCounts[note.username].lastUpdated || note.updated_at > noteCounts[note.username].lastUpdated!) {
      noteCounts[note.username].lastUpdated = note.updated_at
    }
  }

  const result = (users || []).map(u => ({
    ...u,
    noteCount: noteCounts[u.username]?.count || 0,
    fileCount: fileCounts[u.username] || 0,
    lastUpdated: noteCounts[u.username]?.lastUpdated || null,
  }))

  return NextResponse.json(result)
}
