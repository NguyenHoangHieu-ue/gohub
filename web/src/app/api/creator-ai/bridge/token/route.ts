import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "crypto"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { hasGpAccess } from "@/lib/gp-access"

async function requireGpAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const username = session.user.username
  if (!(await hasGpAccess(session.user.role, username))) {
    return { error: NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 }) }
  }
  return { username }
}

// GET: xem token hiện tại của CHÍNH mình (nếu có) + lần cuối extension của mình poll.
export async function GET() {
  try {
    const guard = await requireGpAccess()
    if (guard.error) return guard.error

    const { data, error } = await supabaseAdmin
      .from("browser_bridge_pairings")
      .select("token,last_seen")
      .eq("username", guard.username)
      .maybeSingle()

    if (error) {
      console.error("[bridge/token] select error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ token: data?.token ?? null, last_seen: data?.last_seen ?? null })
  } catch (e: any) {
    console.error("[bridge/token] unhandled error:", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

// POST: sinh token mới cho CHÍNH mình (ghi đè token cũ của mình — extension cũ sẽ mất kết nối).
export async function POST() {
  try {
    const guard = await requireGpAccess()
    if (guard.error) return guard.error

    const token = randomBytes(24).toString("hex")
    const { error } = await supabaseAdmin.from("browser_bridge_pairings").upsert(
      { username: guard.username, token },
      { onConflict: "username" },
    )
    if (error) {
      console.error("[bridge/token] upsert error:", error)
      return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 500 })
    }

    return NextResponse.json({ token })
  } catch (e: any) {
    console.error("[bridge/token] unhandled error:", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
