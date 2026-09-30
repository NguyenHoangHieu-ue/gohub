import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { parsePlanFile, type CatalogPlan, type PlanCatalog } from "@/lib/bc-datapool/plan-catalog"
import { PLAN_CATALOG_KEY, catalogSummary, loadPlanCatalog, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Upload 1–2 file "Purchase information" (eSIM và/hoặc SIM) xuất từ Portal BC Datapool.
 * Plan ID trong file = ProductID BC. Loại SIM nào có trong file upload thì thay hẳn loại đó, loại còn lại giữ nguyên.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const files = (await req.formData()).getAll("files").filter((f): f is File => f instanceof File)
  if (!files.length) return NextResponse.json({ error: "Thiếu file" }, { status: 400 })

  const uploaded: CatalogPlan[] = []
  for (const f of files) {
    if (f.size > 20 * 1024 * 1024) return NextResponse.json({ error: `${f.name}: file quá lớn (tối đa 20MB)` }, { status: 400 })
    try { uploaded.push(...parsePlanFile(Buffer.from(await f.arrayBuffer()))) }
    catch (e) { return NextResponse.json({ error: `${f.name}: ${(e as Error).message}` }, { status: 422 }) }
  }

  const old = await loadPlanCatalog()
  const replaced = new Set(uploaded.map(p => p.sim))
  const catalog: PlanCatalog = {
    uploadedAt: new Date().toISOString(),
    files: [...(old?.files ?? []).filter(n => !files.some(f => f.name === n)), ...files.map(f => f.name)].slice(-6),
    plans: [...(old?.plans ?? []).filter(p => !replaced.has(p.sim)), ...uploaded],
  }

  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: PLAN_CATALOG_KEY,
    value: JSON.stringify(catalog),
    label: "Danh mục gói Portal BC Datapool (Plan ID = ProductID)",
    category: "bc_datapool",
    updated_at: catalog.uploadedAt,
  }, { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planCatalog: catalogSummary(catalog) })
}
