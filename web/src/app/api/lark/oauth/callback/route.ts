import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { exchangeLarkCode, saveLarkUserToken } from "@/lib/lark"

// Lark redirect về đây kèm ?code&state. Đổi code → user token, lưu, quay về Gấu Pro.
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin  // khớp domain đang dùng (phải trùng redirect_uri lúc start)
  const done = (status: string) => NextResponse.redirect(`${base}/analytics/creator/ai?lark=${status}`)

  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return done("error")

  const code  = req.nextUrl.searchParams.get("code")  || ""
  const state = req.nextUrl.searchParams.get("state") || ""
  const cookieState = req.cookies.get("lark_oauth_state")?.value || ""
  if (!code || !state || state !== cookieState) return done("error")

  try {
    const redirectUri = `${base}/api/lark/oauth/callback`
    const tok = await exchangeLarkCode(code, redirectUri)
    if ((tok.code && tok.code !== 0) || !tok.access_token) {
      console.error("[Lark OAuth] exchange failed:", tok.code, tok.msg)
      return done("error")
    }
    await saveLarkUserToken(tok, tok.open_id)
    const res = done("connected")
    res.cookies.delete("lark_oauth_state")
    return res
  } catch (e: any) {
    console.error("[Lark OAuth] callback error:", e.message)
    return done("error")
  }
}
