import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { waitUntil } from "@vercel/functions"
import { authOptions } from "@/lib/auth"
import { createJob, triggerJobRun } from "@/lib/agents/creator/jobs"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"

// U3: Bé Gấu giao việc chạy nền (tính năng "background" theo vai trò). Dùng chung bảng/bộ chạy gp_jobs với Gấu Pro (lib/agents/creator/jobs.ts).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!session || !username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!featureEnabled(await loadFeatureMatrix(), "background", session.user.role))
    return NextResponse.json({ error: "Vai trò của bạn chưa được mở Chạy nền." }, { status: 403 })
  const { prompt } = await req.json().catch(() => ({}))
  if (typeof prompt !== "string" || !prompt.trim()) return NextResponse.json({ error: "Thiếu nội dung việc" }, { status: 400 })
  const { job, error } = await createJob({
    username, isCreator: session.user.role === "creator", prompt: prompt.trim(),
    beGauOwnerName: session.user.name || username,
  })
  if (!job) return NextResponse.json({ error }, { status: 500 })
  waitUntil(triggerJobRun(req.nextUrl.origin, job.id))
  return NextResponse.json({ job: { id: job.id, title: job.title, status: job.status } })
}
