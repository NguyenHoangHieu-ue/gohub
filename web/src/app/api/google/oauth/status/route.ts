import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getGoogleConnection } from "@/lib/google-oauth"

// Trạng thái kết nối Google của creator (badge header Gấu Pro).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ connected: false })
  return NextResponse.json(await getGoogleConnection())
}
