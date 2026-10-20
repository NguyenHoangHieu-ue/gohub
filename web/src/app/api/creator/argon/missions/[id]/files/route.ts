import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { buildTree } from "@/lib/argon/missions"
import { listFiles, ownMission, readFile, readFileBuffer, removeFile, writeFile } from "@/lib/argon/missions-db"
import { isXlsxPath, previewWorkbook } from "@/lib/argon/xlsx-preview"

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
  if (path && req.nextUrl.searchParams.get("preview") === "1") {   // xem trước .xlsx: các sheet đã cắt gọn (tối đa 200 dòng × 30 cột)
    if (!isXlsxPath(path)) return NextResponse.json({ error: "Chỉ xem trước được file .xlsx" }, { status: 400 })
    const f = await readFileBuffer(g.mission.id, path)
    if (!f) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 404 })
    try { return NextResponse.json({ preview: previewWorkbook(f.data) }) } catch (e) { return NextResponse.json({ error: `Không đọc được file Excel: ${(e as Error).message.slice(0, 200)}` }, { status: 422 }) }
  }
  if (path && req.nextUrl.searchParams.get("download") === "1") {   // tải file (chữ hoặc nhị phân) nguyên bản; ảnh dùng làm src xem trước
    const f = await readFileBuffer(g.mission.id, path)
    if (!f) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 404 })
    const name = path.split("/").pop() ?? "file"
    const inline = /^image\/(png|jpe?g)$/.test(f.mime)   // SVG/HTML KHÔNG inline (cùng origin → có thể chạy script)
    return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  }
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
