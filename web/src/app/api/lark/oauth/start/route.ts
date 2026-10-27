import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { randomBytes } from "crypto"
import { loadGpAllowed } from "@/lib/gp-access"
import { requireArgonMemberName } from "@/lib/argon/access"
import { safeReturnPath } from "@/lib/lark-return"

// Scope app chưa bật chỉ hiện ở mục "không thể cấp" trên màn authorize, các scope còn lại vẫn cấp bình thường (đã thấy thực tế).
const LARK_OAUTH_SCOPES = "offline_access task:task:read task:task:write task:tasklist:read " +
  "drive:drive docx:document docx:document.block:convert sheets:spreadsheet wiki:wiki bitable:app:readonly " +
  // Phòng Argon (đọc mail Lark của Creator): đo 2026-10-14 token thiếu mail:user_mailbox.message:readonly + mail:user_mailbox.folder:read (+ bitable:app:readonly)
  "mail:user_mailbox.folder:read mail:user_mailbox.message:readonly mail:user_mailbox.message.body:read mail:user_mailbox.message.subject:read mail:user_mailbox.message.address:read"

// Người dùng Gấu Pro/Gấu Prime thường: task + tài liệu + Base trong CHÍNH tài khoản Lark của họ (KHÔNG có mail). Gấu Prime chỉ ĐỌC; scope tài liệu dùng đúng nhóm app đã bật cho Creator.
const MEMBER_OAUTH_SCOPES = "offline_access task:task:read task:task:write task:tasklist:read bitable:app:readonly drive:drive docx:document wiki:wiki sheets:spreadsheet"

// Khởi động OAuth: redirect sang trang cấp quyền Lark. Creator → token của Hiếu (đủ scope); người được cấp Gấu Pro → token riêng, scope task.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const isCreator = session?.user?.role === "creator"
  if (!session?.user?.username || (!isCreator && !(await loadGpAllowed()).includes(session.user.username) && !(await requireArgonMemberName()))) {
    return NextResponse.json({ error: "Không có quyền Gấu Pro / Gấu Prime" }, { status: 403 })
  }

  // Theo domain đang truy cập (staging/production đều đã đăng ký redirect trong Lark Security Settings). Trước dùng
  // NEXTAUTH_URL — trên Preview env đó trỏ production nên kết nối từ staging bị đá sang production.
  const base = req.nextUrl.origin
  const redirectUri = `${base}/api/lark/oauth/callback`
  const state = randomBytes(16).toString("hex")

  const authUrl = new URL("https://open.larksuite.com/open-apis/authen/v1/authorize")
  authUrl.searchParams.set("app_id", process.env.LARK_APP_ID || "")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("state", state)
  // PHẢI xin scope tường minh: bỏ trống thì Lark KHÔNG cấp thêm quyền nào (token thiếu task:task:read → 99991679),
  // và thiếu offline_access thì không có refresh_token. Chỉ liệt kê scope app ĐÃ bật + publish, sai 1 cái là Lark
  // báo lỗi quyền ở màn authorize. Quyền cộng dồn qua các lần cấp nên không mất quyền cũ (vd gửi tin Cà Thread).
  authUrl.searchParams.set("scope", isCreator ? (process.env.LARK_OAUTH_SCOPES || LARK_OAUTH_SCOPES) : MEMBER_OAUTH_SCOPES)

  const res = NextResponse.redirect(authUrl.toString())
  // sameSite=none cần kèm secure=true để hoạt động sau redirect qua domain Lark
  const isProduction = process.env.NODE_ENV === "production"
  const back = safeReturnPath(req.nextUrl.searchParams.get("return"))
  if (back) res.cookies.set("lark_oauth_return", back, { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", maxAge: 600, path: "/" })   // quay lại đúng trang sau khi cấp quyền
  res.cookies.set("lark_oauth_state", state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
