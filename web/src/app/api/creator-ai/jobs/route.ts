import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { waitUntil } from "@vercel/functions"
import { authOptions } from "@/lib/auth"
import { loadGpAllowed } from "@/lib/gp-access"
import { createJob, listJobs, cancelJob, triggerJobRun } from "@/lib/agents/creator/jobs"

async function gpUser() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  const isCreator = session.user.role === "creator"
  if (!isCreator && !(await loadGpAllowed()).includes(username)) return null
  return { username, isCreator }
}

// Việc chạy nền Gấu Pro (G2): GET danh sách việc của tôi · POST { prompt } giao việc · DELETE ?id= huỷ.
export async function GET() {
  const u = await gpUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  return NextResponse.json(await listJobs(u.username))
}

export async function POST(req: NextRequest) {
  const u = await gpUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const { prompt } = await req.json().catch(() => ({}))
  if (typeof prompt !== "string" || !prompt.trim()) return NextResponse.json({ error: "Thiếu nội dung việc" }, { status: 400 })
  const { job, error } = await createJob({ username: u.username, isCreator: u.isCreator, prompt: prompt.trim() })
  if (!job) return NextResponse.json({ error }, { status: 500 })
  waitUntil(triggerJobRun(req.nextUrl.origin, job.id))
  return NextResponse.json({ job: { id: job.id, title: job.title, status: job.status, created_at: job.created_at } })
}

export async function DELETE(req: NextRequest) {
  const u = await gpUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 })
  return NextResponse.json({ cancelled: await cancelJob(u.username, id) })
}
