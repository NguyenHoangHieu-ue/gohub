import { NextResponse }     from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

const KEY = "user_heartbeats"
const ONLINE_MS = 5 * 60_000  // 5 phút

// POST — cập nhật last_seen cho user hiện tại
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ ok: false })

  const username = session.user.username
  const now = Date.now()

  try {
    // Đọc blob hiện tại
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    const beats: Record<string, number> = data?.value ? JSON.parse(data.value) : {}

    // Cập nhật timestamp user này + dọn user quá 30 phút
    beats[username] = now
    for (const u of Object.keys(beats)) {
      if (now - beats[u] > 30 * 60_000) delete beats[u]
    }

    await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(beats), category: "system" }, { onConflict: "key" })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }) }
}

// GET — trả về danh sách online (username → last_seen ms)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    const beats: Record<string, number> = data?.value ? JSON.parse(data.value) : {}
    const now = Date.now()
    const online: Record<string, number> = {}
    for (const [u, ts] of Object.entries(beats)) {
      if (now - ts < ONLINE_MS) online[u] = ts
    }
    return NextResponse.json({ online, count: Object.keys(online).length })
  } catch { return NextResponse.json({ online: {}, count: 0 }) }
}
