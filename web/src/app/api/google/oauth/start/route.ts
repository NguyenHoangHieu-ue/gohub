import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { randomBytes } from "crypto"
import { GOOGLE_SCOPES, googleRedirectUri } from "@/lib/google-oauth"

// Redirect creator sang màn cấp quyền Google (Drive/Docs/Sheets cho Gấu Pro).
// redirect_uri theo origin đang truy cập — staging + production đều đã đăng ký trong client "GoHub Intel - Drive".
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }
  const state = randomBytes(16).toString("hex")
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID ?? "")
  authUrl.searchParams.set("redirect_uri", googleRedirectUri(req.nextUrl.origin))
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "))
  // offline + consent: bắt Google trả refresh_token kể cả khi đã từng cấp quyền.
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("state", state)

  const res = NextResponse.redirect(authUrl.toString())
  const secure = process.env.NODE_ENV === "production"
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure, sameSite: "lax", maxAge: 600, path: "/" })
  return res
}
