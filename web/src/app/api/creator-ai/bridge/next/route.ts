import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

// s195+3: multi-tenant — token → username qua browser_bridge_pairings (mỗi user 1 hàng đợi riêng).
async function resolveUsername(req: NextRequest): Promise<string | null> {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  if (!token) return null
  const { data } = await supabaseAdmin.from("browser_bridge_pairings").select("username").eq("token", token).maybeSingle()
  return data?.username ?? null
}

// Extension poll GET định kỳ để lấy lệnh kế tiếp CỦA CHÍNH MÌNH. Không có lệnh → { command: null }.
export async function GET(req: NextRequest) {
  const username = await resolveUsername(req)
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await supabaseAdmin.from("browser_bridge_pairings")
    .update({ last_seen: new Date().toISOString() })
    .eq("username", username)

  // Sweep lệnh hết hạn (pending quá lâu vì extension tắt) — chỉ trong hàng đợi của chính user này.
  await supabaseAdmin.from("browser_bridge_commands")
    .update({ status: "expired" })
    .eq("owner_username", username)
    .in("status", ["pending", "claimed"])
    .lt("expires_at", new Date().toISOString())

  const { data: row } = await supabaseAdmin
    .from("browser_bridge_commands")
    .select("id,action,payload,requires_confirm")
    .eq("owner_username", username)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!row) return NextResponse.json({ command: null })

  const { error: claimErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")

  if (claimErr) return NextResponse.json({ command: null })

  return NextResponse.json({ command: row })
}
