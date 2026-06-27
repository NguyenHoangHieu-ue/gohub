import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Schema Config (port intel SchemaConfig): mô tả bảng/cột để AI (BI analyst) hiểu dữ liệu.
// Lưu trong app_settings key 'schema_config' = JSON { tables: [{ id, name, description, fields:[{id,name,type,description}] }] }.
// GET: trả schema đã lưu (rỗng nếu chưa có). POST: admin lưu.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "schema_config").maybeSingle()
  let tables: any[] = []
  try { if (data?.value) tables = (JSON.parse(data.value).tables) || [] } catch {}
  return NextResponse.json({ tables })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user?.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  const tables = body?.schema?.tables ?? []
  await supabaseAdmin.from("app_settings").upsert({
    key: "schema_config",
    value: JSON.stringify({ tables, updatedBy: body?.updatedBy || session.user?.name || "system", updatedAt: new Date().toISOString() }),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
