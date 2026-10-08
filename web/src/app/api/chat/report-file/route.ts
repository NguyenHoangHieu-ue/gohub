import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { REPORT_BUCKET, ownerFolder } from "@/lib/report"

// U2: tải file báo cáo — chỉ người tạo (thư mục = username) hoặc admin/creator. Trả về link ký 60 giây.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL("/login", req.url))
  const p = req.nextUrl.searchParams.get("p") ?? ""
  if (!p || p.includes("..")) return NextResponse.json({ error: "Thiếu đường dẫn" }, { status: 400 })
  const mine = p.startsWith(`${ownerFolder(session.user.username || session.user.email || "")}/`)
  if (!mine && !["admin", "creator"].includes(session.user.role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const { data, error } = await supabaseAdmin.storage.from(REPORT_BUCKET).createSignedUrl(p, 60, { download: p.split("/").pop() })
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Không tìm thấy file" }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
