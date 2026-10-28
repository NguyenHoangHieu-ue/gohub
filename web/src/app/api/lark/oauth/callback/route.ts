import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { exchangeLarkCode, saveLarkUserToken, getLarkSelfOpenId } from "@/lib/lark"
import { loadGpAllowed } from "@/lib/gp-access"
import { requireArgonMemberName } from "@/lib/argon/access"
import { returnUrl, safeReturnPath } from "@/lib/lark-return"

// Lark redirect về đây kèm ?code&state. Đổi code → user token, lưu, quay về Gấu Pro.
export async function GET(req: NextRequest) {
  // Cùng origin với start (redirect_uri phải khớp tuyệt đối + cookie state nằm trên domain này).
  const base = req.nextUrl.origin
  const back = safeReturnPath(req.cookies.get("lark_oauth_return")?.value ?? null)
  const done = (status: string) => { const r = NextResponse.redirect(returnUrl(base, back, status)); r.cookies.delete("lark_oauth_return"); return r }

  const session = await getServerSession(authOptions)
  const isCreator = session?.user?.role === "creator"
  const username = session?.user?.username
  if (!username || (!isCreator && !(await loadGpAllowed()).includes(username) && !(await requireArgonMemberName()))) return done("error")

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
    // Bug đã fix: tok.open_id KHÔNG tồn tại trong response đổi code→token của Lark OAuth v2 — phải
    // gọi riêng /authen/v1/user_info bằng access_token vừa nhận để tự tra open_id thật.
    const openId = await getLarkSelfOpenId(tok.access_token)
    // Creator → khoá cũ (các luồng của Hiếu dùng); người khác → khoá riêng theo username, không bao giờ ghi đè token của Creator.
    await saveLarkUserToken(tok, openId ?? undefined, isCreator ? undefined : username)
    const res = done("connected")
    res.cookies.delete("lark_oauth_state")
    return res
  } catch (e: any) {
    console.error("[Lark OAuth] callback error:", e.message)
    return done("error")
  }
}
