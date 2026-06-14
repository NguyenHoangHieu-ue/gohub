import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      role:       string
      username:   string
      department: string
    } & DefaultSession["user"]
  }
}
