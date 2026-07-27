import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { tursoQuery } from "@/lib/turso"
import { supabaseAdmin } from "@/lib/supabase"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"

// DELETE: Xóa records tạo nhầm (customer_code chứa ký tự < > là placeholder chưa điền)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await ensureB2bCostTable()

  // Tìm tất cả records có customer_code chứa < hoặc > (placeholder chưa điền)
  const wrongRecords = await tursoQuery<{ id: string; customer_code: string; month: string }>(
    `SELECT id, customer_code, month FROM b2b_customer_cost_monthly
     WHERE customer_code LIKE '%<%' OR customer_code LIKE '%>%'`
  )

  if (wrongRecords.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Không có records sai để xóa" })
  }

  const deleted: string[] = []
  for (const r of wrongRecords) {
    await tursoQuery("DELETE FROM b2b_customer_cost_monthly WHERE id = ?", [r.id])
    deleted.push(r.id)
  }

  return NextResponse.json({ deleted: deleted.length, ids: deleted })
}

// GET: Tìm real customer_code cho Shopee/TikTok/Lazada trong gohub_dw dim_customer
//      bằng cách query b2b_customers_cache (Supabase) hoặc trực tiếp dim_customer
// POST: Tạo Turso records mới với real customer_code (copy từ virtual records)
//       Body: { mappings: [{ virtual_code: "B2BCustomerVnShopee", real_code: "XXXX", months: ["2026-04",...] }] }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // 1. Lấy virtual records từ Turso
    await ensureB2bCostTable()
    const virtualRecords = await tursoQuery<{
      id: string; month: string; customer_code: string; cost_type: string; cost_value: number; cost_lines: string
    }>(
      `SELECT id, month, customer_code, cost_type, cost_value, cost_lines
       FROM b2b_customer_cost_monthly
       WHERE customer_code LIKE 'B2BCustomer%'
       ORDER BY month, customer_code`
    )

    // 2. Search b2b_customers_cache (Supabase) cho Shopee/TikTok/Lazada/Ecom
    const patterns = ["shopee", "tiktok", "lazada", "ecom", "shopeepay"]
    const { data: cacheData } = await supabaseAdmin
      .from("b2b_customers_cache")
      .select("customer_code, customer_name, price_list_name, total_revenue")
      .or(patterns.map(p => `customer_name.ilike.%${p}%`).join(","))
      .order("total_revenue", { ascending: false })
      .limit(30)

    // 3. Cũng tìm trong dim_customer (gohub_dw) để có thêm option
    const dwCustomers = await queryAnalytics<{ code: string; name: string; price_list_name: string }>(
      `SELECT DISTINCT TRIM(code::text) as code, COALESCE(name,'') as name, COALESCE(price_list_name,'') as price_list_name
       FROM dim_customer
       WHERE LOWER(COALESCE(name,'')) SIMILAR TO '%(shopee|tiktok|lazada|ecom)%'
       ORDER BY name
       LIMIT 20`
    )

    return NextResponse.json({
      virtual_records: virtualRecords,
      cache_matches: cacheData || [],
      dw_matches: dwCustomers,
      instructions: [
        "1. Tìm real_code cho từng virtual customer (B2BCustomerVnShopee/TikTok/Lazada) trong cache_matches hoặc dw_matches",
        "2. Gọi POST với body: { mappings: [{ virtual_code, real_code, months }] }",
        "3. Hệ thống sẽ copy cost data sang real_code mới (không xóa virtual records)"
      ]
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { mappings } = await req.json() as {
    mappings: Array<{
      virtual_code: string   // e.g. "B2BCustomerVnShopee"
      real_code: string      // e.g. "wHWSYmE541" (từ dim_customer)
      months?: string[]      // nếu không có → copy tất cả months của virtual_code
    }>
  }
  if (!Array.isArray(mappings) || mappings.length === 0)
    return NextResponse.json({ error: "mappings required" }, { status: 400 })

  await ensureB2bCostTable()
  const now = new Date().toISOString()
  const updatedBy = session.user.email || session.user.name || "fix-script"
  const created: string[] = []
  const skipped: string[] = []

  for (const m of mappings) {
    // Lấy tất cả records của virtual_code
    const whereMonths = m.months && m.months.length > 0
      ? `AND month IN (${m.months.map(() => "?").join(",")})`
      : ""
    const params = m.months && m.months.length > 0 ? [m.virtual_code, ...m.months] : [m.virtual_code]
    const virtualRows = await tursoQuery<{
      id: string; month: string; customer_code: string; cost_type: string; cost_value: number; cost_lines: string
    }>(
      `SELECT id, month, customer_code, cost_type, cost_value, cost_lines
       FROM b2b_customer_cost_monthly
       WHERE customer_code = ? ${whereMonths}`,
      params
    )

    for (const row of virtualRows) {
      const newId = `${row.month}_${m.real_code}`
      // Kiểm tra đã tồn tại chưa
      const existing = await tursoQuery<{ id: string }>(
        "SELECT id FROM b2b_customer_cost_monthly WHERE id = ?",
        [newId]
      )
      if (existing.length > 0) {
        skipped.push(newId)
        continue
      }
      // Insert record mới với real_code
      await tursoQuery(
        `INSERT INTO b2b_customer_cost_monthly
           (id, month, customer_code, cost_type, cost_value, cost_lines, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, row.month, m.real_code, row.cost_type, row.cost_value, row.cost_lines, updatedBy, now]
      )
      created.push(newId)
    }
  }

  return NextResponse.json({
    created,
    skipped,
    note: "Virtual records (B2BCustomerVn*) được giữ nguyên. Records mới với real_code đã được tạo."
  })
}
