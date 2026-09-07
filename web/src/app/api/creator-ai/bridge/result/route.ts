import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

const TOKEN_KEY = "browser_bridge_token"

async function checkAuth(req: NextRequest): Promise<boolean> {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  if (!token) return false
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", TOKEN_KEY).maybeSingle()
  return !!data?.value && data.value === token
}

// Extension POST kết quả sau khi thực thi (hoặc lỗi/từ chối) 1 lệnh đã claim.
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const { error } = await supabaseAdmin.from("browser_bridge_commands").update(update).eq("id", body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
