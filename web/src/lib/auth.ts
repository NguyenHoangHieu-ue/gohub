import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { createClient } from "@supabase/supabase-js"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const { data: user } = await adminClient()
          .from("users")
          .select("*")
          .eq("username", credentials.username)
          .single()

        if (!user) return null

        const ok = await bcrypt.compare(credentials.password, user.password)
        if (!ok) return null

        return {
          id:       user.username,
          name:     user.name,
          email:    user.email || "",
          username: user.username,
          role:     user.role,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role     = (user as any).role
        token.username = (user as any).username
      }
      return token
    },
    session({ session, token }) {
      session.user.role     = token.role as string
      session.user.username = token.username as string
      return session
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
}
