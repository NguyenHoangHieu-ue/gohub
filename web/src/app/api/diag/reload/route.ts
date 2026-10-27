import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export const dynamic = "force-dynamic"

// Nhật ký chẩn đoán "trang tự tải lại" (components/reload-probe.tsx). Lưu ở app_settings.reload_log (≤120 mục mới nhất), KHÔNG dùng app_usage_events vì bảng đó chỉ nhận page_view/chat (CHECK constraint).
// POST: mọi người dùng đã đăng nhập ghi 1 mục (chỉ trường chẩn đoán, không nội dung). GET: chỉ Creator đọc.
const KEY = "reload_log"
const MAX = 120
const cut = (v: unknown, n = 160) => (typeof v === "string" ? v.slice(0, n) : v == null ? null : String(v).slice(0, n))

async function readLog(): Promise<unknown[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  try { const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value; return Array.isArray(v) ? v : [] } catch { return [] }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const entry = {
    at: new Date().toISOString(), user: session.user.username ?? session.user.name ?? null, role: session.user.role ?? null,
    kind: cut(b.kind, 24), type: cut(b.type, 24), path: cut(b.path), prevPath: cut(b.prevPath), gapSec: typeof b.gapSec === "number" ? b.gapSec : null,
    discarded: b.discarded === true, vis: cut(b.vis, 12), chunk: cut(b.chunk, 60), ref: cut(b.ref), msg: cut(b.msg, 200),
  }
  try {
    const list = await readLog()
    await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify([entry, ...list].slice(0, MAX)), category: "diag", label: "Nhật ký trang tự tải lại", updated_at: new Date().toISOString() }, { onConflict: "key" })
  } catch { /* chẩn đoán không được làm hỏng gì */ }
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ log: await readLog() })
}
