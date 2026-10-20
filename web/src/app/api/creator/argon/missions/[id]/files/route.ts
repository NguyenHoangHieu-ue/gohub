import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { buildTree } from "@/lib/argon/missions"
import { listFiles, ownMission, readFile, removeFile, writeFile } from "@/lib/argon/missions-db"

export const dynamic = "force-dynamic"

// GET → cây workspace · GET ?path= → nội dung 1 file · PUT { path, content } → tạo/ghi file chữ (Hiếu ghi mọi lúc) · DELETE ?path= → xoá (trừ brief.md, decisions.md).
async function guard(id: string) {
  const username = await requireArgonUser()
  if (!username) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const mission = await ownMission(id, username)
  return mission ? { mission } : { res: NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 }) }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const path = req.nextUrl.searchParams.get("path")
  if (path) {
    const f = await readFile(g.mission.id, path)
    return f ? NextResponse.json({ file: f }) : NextResponse.json({ error: "Không tìm thấy file" }, { status: 404 })
  }
  const files = await listFiles(g.mission.id)
  return NextResponse.json({ tree: buildTree(files), files })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const b = (await req.json().catch(() => ({}))) as { path?: string; content?: string }
  if (typeof b.path !== "string" || typeof b.content !== "string") return NextResponse.json({ error: "Cần path và content (chữ)" }, { status: 400 })
  const r = await writeFile(g.mission.id, b.path, b.content, "user")
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ file: r.file })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "Thiếu path" }, { status: 400 })
  const r = await removeFile(g.mission.id, path)
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true })
}
