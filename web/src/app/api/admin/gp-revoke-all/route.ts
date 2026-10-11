// Thu hồi quyền Gấu Pro của TẤT CẢ người không phải Creator: lưu bản sao danh sách cũ rồi đặt gp_allowed_users = [] (Hiếu cấp lại từng người
// ở Creator Settings → Gấu Pro access). Mặc định dryRun (chỉ liệt kê). Chỉ gọi bằng CRON_SECRET. Ghi access_audit_log từng người (nếu có bảng).
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { loadGpListed } from "@/lib/gp-access"

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { dryRun = true } = await req.json().catch(() => ({})) as { dryRun?: boolean }

  const listed = await loadGpListed()
  const { data: users } = await supabaseAdmin.from("users").select("username,name,role").in("username", listed.length ? listed : ["_none_"])
  const names = new Map((users ?? []).map(u => [u.username as string, u.name as string]))
  const targets = listed.map(u => ({ username: u, name: names.get(u) ?? null }))

  if (!dryRun && listed.length) {
    const at = new Date().toISOString()
    // Bản sao để biết ai từng có quyền (không còn cấp quyền): key riêng theo thời điểm.
    const { error: bErr } = await supabaseAdmin.from("app_settings")
      .upsert({ key: `gp_allowed_users_revoked_${at.slice(0, 10)}`, value: JSON.stringify({ at, users: listed }), category: "system" }, { onConflict: "key" })
    if (bErr) return NextResponse.json({ error: `Không lưu được bản sao: ${bErr.message}` }, { status: 500 })
    const { error } = await supabaseAdmin.from("app_settings").upsert({ key: "gp_allowed_users", value: "[]" }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    try {
      await supabaseAdmin.from("access_audit_log").insert(listed.map(u => ({ action: "remove", target_type: "gp_access", target_username: u, performed_by: "revoke-all" })))
    } catch { /* bảng chưa tạo */ }
  }
  return NextResponse.json({ dryRun, count: targets.length, targets })
}
