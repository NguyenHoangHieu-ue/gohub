import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch tất cả SKU codes (10,957 rows) — dùng pagination tránh Supabase 1000-row cap
  const allCodes: string[] = []
  for (let off = 0; ; off += 1000) {
    const { data: batch, error } = await supabaseAdmin
      .from("skus")
      .select("sku_code")
      .not("sku_code", "is", null)
      .range(off, off + 999)
    if (error || !batch?.length) break
    allCodes.push(...batch.map((r: any) => r.sku_code as string).filter((c: string) => c?.length === 13))
    if (batch.length < 1000) break
  }

  const uniq = (arr: string[]) => [...new Set(arr)].filter(Boolean).sort()

  return NextResponse.json({
    purchaseTypes: uniq(allCodes.map(c => c[0])),
    productTypes:  uniq(allCodes.map(c => c[1])),
    countries:     uniq(allCodes.map(c => c.slice(2, 5))),
    vendors:       uniq(allCodes.map(c => c.slice(5, 7))),
    dataTypes:     uniq(allCodes.map(c => c[7])),
    dataAmounts:   uniq(allCodes.map(c => c.slice(8, 11))),
    dayAmounts:    uniq(allCodes.map(c => c.slice(11, 13))),
  })
}
