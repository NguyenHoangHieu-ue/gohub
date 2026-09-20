import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { authBridge } from "@/lib/bridge-device"

// Extension POST kết quả sau khi thực thi (hoặc lỗi) 1 lệnh đã claim — chỉ cho lệnh thuộc CHÍNH mình.
export async function POST(req: NextRequest) {
  const auth = await authBridge(req, false)
  if (!auth.ok) return auth.res
  const { username } = auth

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 })

  const update: Record<string, any> = { completed_at: new Date().toISOString() }
  if (body.error) {
    update.status = "error"
    update.error = String(body.error).slice(0, 2000)
  } else {
    update.status = "done"
    update.result = body.result ?? null
  }

  const { error } = await supabaseAdmin
    .from("browser_bridge_commands")
    .update(update)
    .eq("id", body.id)
    .eq("owner_username", username)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
