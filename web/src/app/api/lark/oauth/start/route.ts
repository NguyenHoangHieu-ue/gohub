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

  // Dùng NEXTAUTH_URL để redirect URI luôn khớp với cái đã đăng ký trong Lark Developer Console
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || req.nextUrl.origin
  const redirectUri = `${base}/api/lark/oauth/callback`
  const state = randomBytes(16).toString("hex")

  const authUrl = new URL("https://open.larksuite.com/open-apis/authen/v1/authorize")
  authUrl.searchParams.set("app_id", process.env.LARK_APP_ID || "")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("state", state)

  const res = NextResponse.redirect(authUrl.toString())
  // sameSite=none cần kèm secure=true để hoạt động sau redirect qua domain Lark
  const isProduction = process.env.NODE_ENV === "production"
  res.cookies.set("lark_oauth_state", state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
