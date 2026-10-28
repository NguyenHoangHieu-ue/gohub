import { NextRequest, NextResponse } from "next/server"
import { ownSource } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { toDocx, toXlsx } from "@/lib/argon/export"

export const dynamic = "force-dynamic"

// GET ?format=docx|xlsx|md → tải phiên bản hiện tại của nguồn (chữ đã trích/sửa; không giữ định dạng file gốc).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const src = await ownSource(params.id, username)
  if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
  if (src.send_binary || src.extracted_text == null) return NextResponse.json({ error: "Nguồn này là file gốc (PDF/ảnh/video/âm thanh) — không xuất lại từ chữ được" }, { status: 400 })
  const format = req.nextUrl.searchParams.get("format") ?? "md"
  const base = src.name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^\w\-. ]+/g, "_").slice(0, 80) || "argon"
  const stamp = `v${src.version}`
  let body: Uint8Array, type: string, ext: string
  if (format === "docx") { body = new Uint8Array(await toDocx(src.name, src.extracted_text)); type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; ext = "docx" }
  else if (format === "xlsx") { body = new Uint8Array(toXlsx(src.extracted_text)); type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; ext = "xlsx" }
  else { body = new TextEncoder().encode(src.extracted_text); type = "text/markdown; charset=utf-8"; ext = "md" }
  return new Response(body as BodyInit, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${base}-${stamp}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${base}-${stamp}.${ext}`)}` } })
}
