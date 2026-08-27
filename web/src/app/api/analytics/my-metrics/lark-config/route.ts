import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const CONFIG_KEY = "my_metrics_lark_scan_config"

async function requireCreatorOrAdmin() {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireCreatorOrAdmin()
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const raw = data?.value ? JSON.parse(data.value) : null
    return NextResponse.json({
      enabled: raw?.enabled === true,
      chat_id: raw?.chat_id ?? "",
      days_back: raw?.days_back ?? 3,
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireCreatorOrAdmin()
    const body = await req.json() as { enabled?: boolean; chat_id?: string; days_back?: number }
    const config = {
      enabled: body.enabled === true,
      chat_id: (body.chat_id ?? "").trim(),
      days_back: Number(body.days_back) > 0 ? Number(body.days_back) : 3,
    }
    await supabaseAdmin.from("app_settings").upsert(
      { key: CONFIG_KEY, value: JSON.stringify(config), category: "lark_tool" },
      { onConflict: "key" }
    )
    return NextResponse.json({ ok: true, ...config })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
