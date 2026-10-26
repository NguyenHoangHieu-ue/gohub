import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { ARGON_USERS_KEY, vnDayStartIso } from "@/lib/argon/access-pure"
import { loadLimits } from "@/lib/argon/access"

export const dynamic = "force-dynamic"

// Mức dùng Trợ lý của những người được Creator cấp (ARGON-X P5): hôm nay + 7 ngày (số lượt, chi phí, lần dùng cuối) và hạn mức mỗi ngày. Chỉ Creator.
export async function GET() {
  const owner = await requireArgonUser()
  if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: g } = await supabaseAdmin.from("app_settings").select("value").eq("key", ARGON_USERS_KEY).maybeSingle()
  let granted: string[] = []
  try { const v = typeof g?.value === "string" ? JSON.parse(g.value) : g?.value; if (Array.isArray(v)) granted = v.map(String) } catch { /* rỗng */ }
  const limits = await loadLimits()
  if (!granted.length) return NextResponse.json({ members: [], limits })
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString(), today = vnDayStartIso()
  const [{ data: runs }, { data: users }] = await Promise.all([
    supabaseAdmin.from("argon_runs").select("username,created_at,cost_usd,status").in("username", granted).gte("created_at", since7).order("created_at", { ascending: false }).limit(3000),
    supabaseAdmin.from("users").select("username,name").in("username", granted),
  ])
  const name = new Map((users ?? []).map(u => [u.username as string, (u.name as string) || (u.username as string)]))
  const members = granted.map(u => {
    const mine = (runs ?? []).filter(r => r.username === u), td = mine.filter(r => (r.created_at as string) >= today)
    const sum = (a: typeof mine) => Math.round(a.reduce((s, r) => s + Number(r.cost_usd || 0), 0) * 100) / 100
    return { username: u, name: name.get(u) ?? u, runsToday: td.length, usdToday: sum(td), runs7d: mine.length, usd7d: sum(mine), lastAt: (mine[0]?.created_at as string | undefined) ?? null }
  })
  return NextResponse.json({ members, limits })
}
