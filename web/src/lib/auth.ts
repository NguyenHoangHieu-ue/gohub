import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import type { OAuthConfig } from "next-auth/providers/oauth"
import bcrypt from "bcryptjs"
import { createClient } from "@supabase/supabase-js"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
}

interface LarkProfile {
  open_id:    string
  name:       string
  email?:     string
  avatar_url?: string
}

// Custom Lark OAuth provider (international: larksuite.com)
const LarkProvider: OAuthConfig<LarkProfile> = {
  id:   "lark",
  name: "Lark",
  type: "oauth",
  checks: ["state"],
  authorization: {
    url:    "https://open.larksuite.com/open-apis/authen/v1/index",
    params: { app_id: process.env.LARK_APP_ID, scope: "" },
  },
  token: {
    url: "https://open.larksuite.com/open-apis/authen/v1/access_token",
    async request({ params }) {
      const res = await fetch(
        "https://open.larksuite.com/open-apis/authen/v1/access_token",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            grant_type: "authorization_code",
            code:       params.code,
            app_id:     process.env.LARK_APP_ID,
            app_secret: process.env.LARK_APP_SECRET,
          }),
        },
      )
      const json = await res.json()
      return {
        tokens: {
          access_token:  json.data?.access_token  ?? json.access_token,
          token_type:    "Bearer",
          expires_in:    json.data?.expires_in    ?? json.expires_in,
          refresh_token: json.data?.refresh_token ?? json.refresh_token,
        },
      }
    },
  },
  userinfo: {
    url: "https://open.larksuite.com/open-apis/authen/v1/user_info",
    async request({ tokens }) {
      const res = await fetch(
        "https://open.larksuite.com/open-apis/authen/v1/user_info",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      )
      const json = await res.json()
      // Lark wraps response in json.data
      return json.data ?? json
    },
  },
  profile(profile) {
    return {
      id:      profile.open_id,
      name:    profile.name,
      email:   profile.email ?? "",
      image:   profile.avatar_url ?? null,
      open_id: profile.open_id,
    }
  },
  clientId:     process.env.LARK_APP_ID,
  clientSecret: process.env.LARK_APP_SECRET,
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

        if (!user)          return null
        if (!user.password) return null

        const ok = await bcrypt.compare(credentials.password, user.password)
        if (!ok) return null

        return {
          id:         user.username,
          name:       user.name,
          email:      user.email || "",
          username:   user.username,
          role:       user.role,
          department: user.department ?? "all",
        }
      },
    }),

    LarkProvider,
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "lark") {
        const openId = (user as any).open_id as string | undefined
        if (!openId) return false

        const db = adminClient()

        // 1. Look up by lark_open_id
        const { data: byOpenId } = await db
          .from("users")
          .select("username, role, lark_open_id")
          .eq("lark_open_id", openId)
          .maybeSingle()

        if (byOpenId) {
          ;(user as any).username = byOpenId.username
          ;(user as any).role     = byOpenId.role
          return true
        }

        // 2. Look up by email
        if (user.email) {
          const { data: byEmail } = await db
            .from("users")
            .select("username, role, lark_open_id")
            .eq("email", user.email)
            .maybeSingle()

          if (byEmail) {
            // Link lark_open_id to existing account
            await db
              .from("users")
              .update({ lark_open_id: openId })
              .eq("username", byEmail.username)
            ;(user as any).username = byEmail.username
            ;(user as any).role     = byEmail.role
            return true
          }
        }

        // 3. Auto-create new user with role="sale"
        const emailPrefix = user.email
          ? user.email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase()
          : null
        const openIdSlug  = openId.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 30)
        const baseUsername = emailPrefix || `lark_${openIdSlug}`

        // Ensure uniqueness
        let username = baseUsername
        let suffix   = 1
        while (true) {
          const { data: exists } = await db
            .from("users")
            .select("username")
            .eq("username", username)
            .maybeSingle()
          if (!exists) break
          username = `${baseUsername}_${suffix++}`
        }

        await db.from("users").insert({
          username,
          name:         user.name ?? username,
          email:        user.email || null,
          role:         "standard",
          lark_open_id: openId,
          password:     null,
        })

        ;(user as any).username = username
        ;(user as any).role     = "standard"
        return true
      }

      // CredentialsProvider — already validated in authorize()
      return true
    },

    async jwt({ token, user, account }) {
      // First sign-in: copy fields from user object
      if (user) {
        token.role       = (user as any).role
        token.username   = (user as any).username
        token.department = (user as any).department ?? "all"
      }

      // For Lark: re-read from DB on first token creation to confirm persisted role
      if (account?.provider === "lark" && token.username) {
        const { data: dbUser } = await adminClient()
          .from("users")
          .select("username, role, department")
          .eq("username", token.username as string)
          .maybeSingle()
        if (dbUser) {
          token.role       = dbUser.role
          token.username   = dbUser.username
          token.department = dbUser.department ?? "all"
        }
      }

      return token
    },

    session({ session, token }) {
      session.user.role       = token.role as string
      session.user.username   = token.username as string
      session.user.department = (token.department as string) ?? "all"
      return session
    },
  },

  pages:   { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
}
