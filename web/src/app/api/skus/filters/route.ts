import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("skus")
    .select("sku_code")
    .not("sku_code", "is", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const codes = (data ?? []).map((r: any) => r.sku_code as string).filter(c => c?.length === 13)

  const uniq = (arr: string[]) => [...new Set(arr)].filter(Boolean).sort()

  return NextResponse.json({
    purchaseTypes: uniq(codes.map(c => c[0])),
    productTypes:  uniq(codes.map(c => c[1])),
    countries:     uniq(codes.map(c => c.slice(2, 5))),
    vendors:       uniq(codes.map(c => c.slice(5, 7))),
    dataTypes:     uniq(codes.map(c => c[7])),
    dataAmounts:   uniq(codes.map(c => c.slice(8, 11))),
    dayAmounts:    uniq(codes.map(c => c.slice(11, 13))),
  })
}
