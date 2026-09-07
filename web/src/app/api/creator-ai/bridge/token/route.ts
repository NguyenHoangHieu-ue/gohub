import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "crypto"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const TOKEN_KEY = "browser_bridge_token"
const LAST_SEEN_KEY = "browser_bridge_last_seen"

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.user.role !== "creator") return { error: NextResponse.json({ error: "Chỉ creator" }, { status: 403 }) }
  return { session }
}

// GET: xem token hiện tại (nếu có) + lần cuối extension poll (last_seen).
export async function GET() {
  const guard = await requireCreator()
  if (guard.error) return guard.error

  const [{ data: tokenRow }, { data: seenRow }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", TOKEN_KEY).maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", LAST_SEEN_KEY).maybeSingle(),
  ])

  return NextResponse.json({ token: tokenRow?.value ?? null, last_seen: seenRow?.value ?? null })
}

// POST: sinh token mới (ghi đè token cũ — extension cũ sẽ mất kết nối, cần dán lại token mới).
export async function POST() {
  const guard = await requireCreator()
  if (guard.error) return guard.error

  const token = randomBytes(24).toString("hex")
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: TOKEN_KEY, value: token },
    { onConflict: "key" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token })
}
