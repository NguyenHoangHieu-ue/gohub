import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

// Forward đường dẫn hiện tại qua header để server layout (vd /analytics) biết trang nào
// đang được mở → enforce phân quyền per-report server-side (không bypass được bằng URL).
export default withAuth(
  function middleware(req) {
    const headers = new Headers(req.headers)
    headers.set("x-pathname", req.nextUrl.pathname)
    return NextResponse.next({ request: { headers } })
  },
  { pages: { signIn: "/login" } },
)

export const config = {
  matcher: [
    "/products/:path*",
    "/skus/:path*",
    "/listings/:path*",
    "/items/:path*",
    "/chatbot/:path*",
    "/admin/:path*",
    "/analytics/:path*",
  ],
}
