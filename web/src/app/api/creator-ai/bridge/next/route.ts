import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { authBridge } from "@/lib/bridge-device"
import { BRIDGE_LATEST_VERSION } from "@/lib/bridge-version"

// s195+3: multi-tenant — token → username qua browser_bridge_pairings (mỗi user 1 hàng đợi riêng).
// s202: extension gửi X-Device-Id (+ X-Device-Info) → ghi nhận thiết bị, gắn device/IP vào từng lệnh được nhận.
const BURST_MS = 60_000
const HOLD_MS = 8_000
const HOLD_STEP_MS = 300
export const maxDuration = 20

// Extension poll GET định kỳ để lấy lệnh kế tiếp CỦA CHÍNH MÌNH. Không có lệnh → { command: null }.
export async function GET(req: NextRequest) {
  const auth = await authBridge(req, true)
  if (!auth.ok) return auth.res
  const { username, deviceId, ip } = auth

  await supabaseAdmin.from("browser_bridge_pairings")
    .update({ last_seen: new Date().toISOString() })
    .eq("username", username)

  // Sweep lệnh hết hạn (pending quá lâu vì extension tắt) — chỉ trong hàng đợi của chính user này.
  await supabaseAdmin.from("browser_bridge_commands")
    .update({ status: "expired" })
    .eq("owner_username", username)
    .in("status", ["pending", "claimed"])
    .lt("expires_at", new Date().toISOString())

  // Daemon local (X-Agent-Kind: local) chỉ nhận lệnh file "fs_*"; extension (không gửi header) không bao giờ nhận chúng.
  const isLocalAgent = req.headers.get("x-agent-kind") === "local"
  const findPending = async () => {
    let q = supabaseAdmin
      .from("browser_bridge_commands")
      .select("id,action,payload,requires_confirm")
      .eq("owner_username", username)
      .eq("status", "pending")
    q = isLocalAgent ? q.like("action", "fs_%") : q.not("action", "like", "fs_%")
    const { data } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle()
    return data
  }
  let row = await findPending()

  // Đang "dồn dập" (có lệnh trong 60s qua = Gấu Pro đang thao tác): giữ request tối đa HOLD_MS, hỏi lại mỗi 300ms → lệnh mới được nhận gần như
  // tức thì thay vì chờ tới lần poll kế tiếp của extension. Không dồn dập (extension poll 15s/lần) → trả ngay như cũ.
  if (!row) {
    let burstQ = supabaseAdmin.from("browser_bridge_commands").select("created_at").eq("owner_username", username)
    burstQ = isLocalAgent ? burstQ.like("action", "fs_%") : burstQ.not("action", "like", "fs_%")
    const { data: last } = await burstQ.order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (last && Date.now() - new Date(last.created_at).getTime() < BURST_MS) {
      const until = Date.now() + HOLD_MS
      while (!row && Date.now() < until && !req.signal.aborted) {
        await new Promise(r => setTimeout(r, HOLD_STEP_MS))
        row = await findPending()
      }
    }
  }

  if (!row) return NextResponse.json({ command: null, latest_version: BRIDGE_LATEST_VERSION })

  const { error: claimErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .update({ status: "claimed", claimed_at: new Date().toISOString(), device_id: deviceId, claimed_ip: ip })
    .eq("id", row.id)
    .eq("status", "pending")

  if (claimErr) return NextResponse.json({ command: null, latest_version: BRIDGE_LATEST_VERSION })

  return NextResponse.json({ command: row, latest_version: BRIDGE_LATEST_VERSION })
}
