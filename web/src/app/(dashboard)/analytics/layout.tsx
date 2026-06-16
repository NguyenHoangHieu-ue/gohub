import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"

const ANALYTICS_ROLES = new Set(["admin", "manager", "bod", "staff"])

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role = (session.user as any).role as string
  if (!ANALYTICS_ROLES.has(role)) redirect("/chatbot")

  return <>{children}</>
}
