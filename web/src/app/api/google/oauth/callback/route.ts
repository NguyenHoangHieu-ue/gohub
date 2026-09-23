import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { emailFromIdToken, exchangeGoogleCode, googleRedirectUri, saveGoogleToken } from "@/lib/google-oauth"

// Google redirect về kèm ?code&state → đổi token, lưu, quay về Gấu Pro (?google=connected|error).
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const done = (status: string) => NextResponse.redirect(`${origin}/analytics/creator/ai?google=${status}`)

  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return done("error")

  const code  = req.nextUrl.searchParams.get("code") ?? ""
  const state = req.nextUrl.searchParams.get("state") ?? ""
  if (!code || !state || state !== req.cookies.get("google_oauth_state")?.value) return done("error")

  try {
    const tok = await exchangeGoogleCode(code, googleRedirectUri(origin))
    if (!tok.access_token) {
      console.error("[Google OAuth] exchange failed:", tok.error, tok.error_description)
      return done("error")
    }
    await saveGoogleToken(tok, emailFromIdToken(tok.id_token))
    const res = done("connected")
    res.cookies.delete("google_oauth_state")
    return res
  } catch (e) {
    console.error("[Google OAuth] callback error:", (e as Error).message)
    return done("error")
  }
}
