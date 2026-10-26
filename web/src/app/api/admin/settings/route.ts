import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"
import { triggerAudit } from "@/lib/datapool-audit/server"
import { logSettingChanges, readSettings, userOfSession } from "@/lib/manual-history/wire"
import { DATAPOOL_FORMULA, FORMULA_KEYS, UNLIMITED_LEVELS_KEY, findLevel, sanitizeLevels } from "@/lib/datapool-formula"

const WRITE_ROLES = ["admin", "creator"]

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "settings", WRITE_ROLES)))
    throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value, label, category, updated_at")
      .order("category")
      .order("key")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data ?? [] })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminSession = await requireAdmin()
    const body = await req.json()
    const updates: { key: string; value: string }[] = body.updates ?? []

    if (!Array.isArray(updates) || updates.length === 0)
      return NextResponse.json({ error: "Không có thay đổi nào" }, { status: 400 })

    const rows = updates.map(u => ({
      key:        u.key,
      value:      String(u.value),
      // perm_* keys cần category để INSERT không fail nếu row chưa tồn tại
      ...(u.key.startsWith("perm_") && { category: "permission" }),
      // datapool.* (công thức Datapool dùng chung): dòng mới cần label + category để INSERT
      ...(DATAPOOL_FORMULA.some(d => d.key === u.key) && { category: "formula", label: DATAPOOL_FORMULA.find(d => d.key === u.key)!.label }),
      ...(u.key === UNLIMITED_LEVELS_KEY && { category: "formula", label: "Bảng mức Unlimited (GB tốc độ cao + throttle + GB/ngày, JSON)" }),
      updated_at: new Date().toISOString(),
    }))

    // Bảng mức Unlimited lưu → ghi xuôi 3 khoá cũ cho mức tương ứng (code/đọc dự phòng cũ vẫn chạy): 500MB+5Mbps, 500MB+10Mbps, 3GB+10Mbps
    const lvRow = updates.find(u => u.key === UNLIMITED_LEVELS_KEY)
    if (lvRow) {
      let arr: unknown = null
      try { arr = JSON.parse(String(lvRow.value)) } catch { /* bỏ qua */ }
      const lv = sanitizeLevels(arr)
      for (const [key, mb, sp] of [[FORMULA_KEYS.unl500mb5, 500, 5], [FORMULA_KEYS.unl500mb10, 500, 10], [FORMULA_KEYS.unl3gb10, 3072, 10]] as const) {
        const hit = findLevel(lv, mb, sp)
        if (hit && !rows.some(r => r.key === key)) rows.push({ key, value: String(hit.gbPerDay), category: "formula", label: DATAPOOL_FORMULA.find(d => d.key === key)!.label, updated_at: new Date().toISOString() } as (typeof rows)[number])
      }
    }

    const oldSettings = await readSettings(rows.map(r => r.key))   // giá trị cũ để ghi lịch sử sửa tay
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(rows, { onConflict: "key" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logSettingChanges(rows.map(r => ({ key: r.key, before: oldSettings.get(r.key), after: String(r.value) })), userOfSession(adminSession), "PATCH /admin/settings")
    if (updates.some(u => u.key.startsWith("datapool."))) triggerAudit("Hiếu đổi Công Thức Datapool (giả định / bảng mức Unlimited)")
    return NextResponse.json({ ok: true, updated: rows.length })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
