import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { getAffiliateCreds, saveAffiliateCreds } from "@/lib/shopee-affiliate"

function isCreator(role: string) { return role === "creator" }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const creds = await getAffiliateCreds()
  return NextResponse.json({ configured: !!creds, appId: creds?.appId ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isCreator((session.user as any).role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { appId, secret } = await req.json()
  if (!appId?.trim() || !secret?.trim()) return NextResponse.json({ error: "appId và secret bắt buộc" }, { status: 400 })

  await saveAffiliateCreds(appId.trim(), secret.trim())
  return NextResponse.json({ ok: true })
}
