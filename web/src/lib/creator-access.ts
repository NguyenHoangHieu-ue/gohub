// Tab riêng của Creator mà Creator cấp cho từng người (giống My Metrics: danh sách username trong app_settings).
// Dùng cho tab "Thị trường & Báo giá" (s225: Hiếu yêu cầu chỉ mình Hiếu + người được cấp thấy).
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import { memo, memoInvalidate } from "@/lib/memo"

export const MARKET_USERS_KEY = "market_users"
// Tab "Tính giá & Tạo sản phẩm" (s236): 2 quyền tách riêng, Creator luôn có cả hai.
export const PRICING_USERS_KEY = "pricing_users"            // chỉ xem/tính giá vốn
export const PRODUCT_CREATE_USERS_KEY = "product_create_users" // tạo sản phẩm (xuất file import); gồm cả quyền tính giá

async function loadList(key: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : [] } catch { return [] }
}

/** Creator luôn được; người khác phải có tên trong danh sách. Memo 20s (quyền vừa đổi có hiệu lực sau tối đa 20s). */
export async function hasCreatorGrant(username: string | undefined | null, key: string): Promise<boolean> {
  if (!username) return false
  if ((await getDbRole(username)) === "creator") return true
  return (await memo(`grant:${key}`, 20_000, () => loadList(key))).includes(username)
}

/** Dùng ở route API: trả username nếu được phép, null nếu không. */
export async function requireCreatorGrant(key: string): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  return (await hasCreatorGrant(username, key)) ? username! : null
}

/** GET/POST quản lý danh sách người được cấp (chỉ creator) — cùng hành vi route my-metrics-access. */
export function accessListRoute(key: string, targetType: string) {
  async function requireCreator() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.username) throw new Error("Unauthorized")
    if ((await getDbRole(session.user.username)) !== "creator") throw new Error("Creator only")
    return session.user.username
  }
  const fail = (e: any) => NextResponse.json({ error: e.message }, { status: e.message === "Creator only" ? 403 : 401 })

  async function GET() {
    try {
      await requireCreator()
      const allowed = await loadList(key)
      const { data: users } = await supabaseAdmin.from("users").select("username, name, role").in("username", allowed.length ? allowed : ["_none_"])
      return NextResponse.json({ users: users ?? [] })
    } catch (e: any) { return fail(e) }
  }

  async function POST(req: NextRequest) {
    try {
      const by = await requireCreator()
      const { action, username } = await req.json()
      const u = String(username ?? "").trim()
      if (!u) return NextResponse.json({ error: "username required" }, { status: 400 })
      const allowed = await loadList(key)
      if (action === "add") {
        const { data: user } = await supabaseAdmin.from("users").select("role").eq("username", u).maybeSingle()
        if (!user) return NextResponse.json({ error: `User "${u}" không tồn tại` }, { status: 404 })
        if (!allowed.includes(u)) await save([...allowed, u])
      } else if (action === "remove") {
        await save(allowed.filter(x => x !== u))
      } else return NextResponse.json({ error: "action must be add or remove" }, { status: 400 })
      try { await supabaseAdmin.from("access_audit_log").insert({ action, target_type: targetType, target_username: u, performed_by: by }) } catch {}
      return NextResponse.json({ ok: true })
    } catch (e: any) { return fail(e) }
  }

  async function save(list: string[]) {
    await supabaseAdmin.from("app_settings").upsert({ key, value: JSON.stringify([...new Set(list)]), category: "permission" }, { onConflict: "key" })
    memoInvalidate(`grant:${key}`)
  }

  return { GET, POST }
}

/** Quyền tính giá: Creator, người được cấp "tính giá", hoặc người được cấp "tạo sản phẩm" (tạo sản phẩm cần tính giá). */
export async function canUsePricing(username: string | undefined | null): Promise<boolean> {
  return (await hasCreatorGrant(username, PRICING_USERS_KEY)) || (await hasCreatorGrant(username, PRODUCT_CREATE_USERS_KEY))
}
export async function canCreateProducts(username: string | undefined | null): Promise<boolean> {
  return hasCreatorGrant(username, PRODUCT_CREATE_USERS_KEY)
}
/** Dùng ở route API: "price" = tính giá (hoặc tạo sản phẩm), "create" = tạo sản phẩm. */
export async function requireProductTools(mode: "price" | "create"): Promise<boolean> {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  return mode === "create" ? canCreateProducts(username) : canUsePricing(username)
}
