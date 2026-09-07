import { createHash, randomBytes } from "crypto"
import { NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

const KEY_PREFIX = "gh_ext_"

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("hex")
}

// Server-to-server auth cho /api/external/* — Bearer key, tra hash trong external_api_keys.
// Trả { ok: true, label } nếu hợp lệ + chưa bị revoke; { ok: false, error } nếu không.
export async function requireExternalApiKey(
  req: NextRequest,
): Promise<{ ok: true; label: string; id: string } | { ok: false; error: string }> {
  const auth = req.headers.get("authorization") ?? ""
  const key  = auth.replace("Bearer ", "").trim()
  if (!key) return { ok: false, error: "Thiếu Authorization: Bearer <key>" }

  const { data, error } = await supabaseAdmin
    .from("external_api_keys")
    .select("id,label,revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle()

  if (error || !data) return { ok: false, error: "API key không hợp lệ" }
  if (data.revoked_at) return { ok: false, error: "API key đã bị thu hồi" }

  // Fire-and-forget — không chặn response vì cập nhật last_used_at
  void supabaseAdmin.from("external_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)

  return { ok: true, label: data.label, id: data.id }
}
