import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

// Lookup meta (data/speed/throttle_speed) từ Supabase `skus` cho 1 danh sách sku_code cụ thể — dùng để
// phân biệt sub-variant Unlimited cùng ký tự phân loại (VD mã B: 500MB·10mbps vs 1GB·10mbps, không phân
// biệt được chỉ bằng SKU — cần cột `data`/`speed` mới sync s202). Route riêng (không dùng /api/skus vì
// route đó phân trang 20/lần, không hợp cho tra cứu hàng loạt theo danh sách sku_code chính xác).
// Không có field nhạy cảm (không COGS) — chỉ cần session đăng nhập, không gate role riêng.

const CHUNK = 150 // khớp tiền lệ Product Catalogue (s198) — tránh query string PostgREST quá dài

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawCodes: unknown[] = Array.isArray(body?.codes) ? body.codes : []
  const codes: string[] = [...new Set(rawCodes.filter((c): c is string => typeof c === "string" && !!c))]
  if (codes.length === 0) return NextResponse.json({ data: [] })

  const rows: any[] = []
  for (let i = 0; i < codes.length; i += CHUNK) {
    const batch = codes.slice(i, i + CHUNK)
    const { data, error } = await supabaseAdmin
      .from("skus")
      .select("sku_code,data,speed,throttle_speed,data_plan")
      .in("sku_code", batch)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(data ?? []))
  }

  return NextResponse.json({ data: rows })
}
