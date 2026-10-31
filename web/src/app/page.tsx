import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await getServerSession(authOptions)
  // Vào thẳng Dashboard (có popup Daily Report); người không có quyền dashboard bị analytics layout đẩy về /chatbot.
  redirect(session ? "/analytics" : "/login")
}
