import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

const TOKEN_KEY = "browser_bridge_token"
const LAST_SEEN_KEY = "browser_bridge_last_seen"

async function checkAuth(req: NextRequest): Promise<boolean> {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  if (!token) return false
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", TOKEN_KEY).maybeSingle()
  return !!data?.value && data.value === token
}

// Extension poll GET định kỳ để lấy lệnh kế tiếp. Không có lệnh → { command: null }.
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await supabaseAdmin.from("app_settings").upsert(
    { key: LAST_SEEN_KEY, value: new Date().toISOString() },
    { onConflict: "key" },
  )

  // Sweep lệnh hết hạn (pending quá lâu vì extension tắt/Hiếu không duyệt kịp)
  await supabaseAdmin.from("browser_bridge_commands")
    .update({ status: "expired" })
    .in("status", ["pending", "claimed"])
    .lt("expires_at", new Date().toISOString())

  const { data: row } = await supabaseAdmin
    .from("browser_bridge_commands")
    .select("id,action,payload,requires_confirm")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!row) return NextResponse.json({ command: null })

  const { error: claimErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending") // tránh 2 extension cùng claim (dù v1 chỉ 1 token/1 máy)

  if (claimErr) return NextResponse.json({ command: null })

  return NextResponse.json({ command: row })
}
