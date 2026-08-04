import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { randomBytes } from "crypto"

// Khởi động OAuth: redirect creator sang trang cấp quyền Lark.
// Chỉ creator (task cá nhân của Hiếu).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  // Base = origin request thực tế (khớp domain đang truy cập) → tránh lệch NEXTAUTH_URL
  const base = req.nextUrl.origin
  const redirectUri = `${base}/api/lark/oauth/callback`
  const state = randomBytes(16).toString("hex")
  // Chỉ xin scope app đang có (task:task). Thêm "task:tasklist" nếu muốn duyệt Task List riêng
  // (Hiếu phải bật scope đó trong Lark trước, nếu không authorize sẽ lỗi).
  const scope = "task:task"

  const authUrl = new URL("https://accounts.larksuite.com/open-apis/authen/v1/authorize")
  authUrl.searchParams.set("client_id", process.env.LARK_APP_ID || "")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("scope", scope)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("state", state)

  const res = NextResponse.redirect(authUrl.toString())
  // Lưu state qua cookie httpOnly để verify ở callback (chống CSRF)
  res.cookies.set("lark_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })
  return res
}
