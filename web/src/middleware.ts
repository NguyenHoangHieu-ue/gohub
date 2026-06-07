import { withAuth } from "next-auth/middleware"

export default withAuth({ pages: { signIn: "/login" } })

export const config = {
  matcher: [
    "/products/:path*",
    "/skus/:path*",
    "/listings/:path*",
    "/items/:path*",
    "/chatbot/:path*",
    "/admin/:path*",
  ],
}
