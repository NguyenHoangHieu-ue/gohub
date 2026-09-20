import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

// Thông tin thiết bị extension Bridge gửi kèm (header X-Device-Info, base64 JSON) — phục vụ truy vết khi có sự cố.
// Chrome extension KHÔNG đọc được tên máy tính; dùng device_id sinh 1 lần + OS + email profile Chrome + IP server ghi.
export interface DeviceInfo {
  os?: string
  arch?: string
  user_agent?: string
  browser_version?: string
  ext_version?: string
  timezone?: string
  language?: string
  cpu_cores?: number
  memory_gb?: number
  chrome_email?: string
}

const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/

const str = (v: unknown, max = 300): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e6 ? v : undefined

export function parseDeviceInfo(header: string | null): DeviceInfo | null {
  if (!header) return null
  try {
    const raw = JSON.parse(Buffer.from(header, "base64").toString("utf8"))
    if (!raw || typeof raw !== "object") return null
    const info: DeviceInfo = {
      os: str(raw.os, 40),
      arch: str(raw.arch, 40),
      user_agent: str(raw.user_agent, 400),
      browser_version: str(raw.browser_version, 40),
      ext_version: str(raw.ext_version, 20),
      timezone: str(raw.timezone, 60),
      language: str(raw.language, 20),
      cpu_cores: num(raw.cpu_cores),
      memory_gb: num(raw.memory_gb),
      chrome_email: str(raw.chrome_email, 200),
    }
    return info
  } catch {
    return null
  }
}

export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim().slice(0, 64) || null
  return req.headers.get("x-real-ip")?.trim().slice(0, 64) || null
}

export type BridgeAuth =
  | { ok: true; username: string; deviceId: string; ip: string | null }
  | { ok: false; res: NextResponse }

// Xác thực request từ extension: token → username, X-Device-Id bắt buộc, thiết bị chưa bị thu hồi.
// touch=true (poll) thì ghi nhận/cập nhật thiết bị (thông tin + IP + last_seen).
export async function authBridge(req: NextRequest, touch: boolean): Promise<BridgeAuth> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim()
  if (!token) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: pairing } = await supabaseAdmin
    .from("browser_bridge_pairings").select("username").eq("token", token).maybeSingle()
  if (!pairing?.username) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const username: string = pairing.username

  const deviceId = req.headers.get("x-device-id") ?? ""
  if (!DEVICE_ID_RE.test(deviceId)) {
    return { ok: false, res: NextResponse.json({ error: "extension_outdated", message: "Cập nhật extension Bridge lên bản mới (thiếu device id)." }, { status: 400 }) }
  }
  const ip = clientIp(req)

  const { data: existing } = await supabaseAdmin
    .from("browser_bridge_devices").select("id,revoked").eq("username", username).eq("device_id", deviceId).maybeSingle()
  if (existing?.revoked) {
    return { ok: false, res: NextResponse.json({ error: "device_revoked", message: "Thiết bị này đã bị thu hồi quyền." }, { status: 403 }) }
  }

  if (touch) {
    const info = parseDeviceInfo(req.headers.get("x-device-info"))
    const now = new Date().toISOString()
    const fields: Record<string, unknown> = { last_seen: now, last_ip: ip }
    if (info) for (const [k, v] of Object.entries(info)) if (v !== undefined) fields[k] = v
    if (existing) {
      await supabaseAdmin.from("browser_bridge_devices").update(fields).eq("id", existing.id)
    } else {
      await supabaseAdmin.from("browser_bridge_devices")
        .insert({ username, device_id: deviceId, first_ip: ip, first_seen: now, ...fields })
    }
  }

  return { ok: true, username, deviceId, ip }
}
