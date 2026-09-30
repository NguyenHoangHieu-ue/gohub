import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { createNotification } from "@/lib/notifications"
import { diffPriceList, hasPriceChanges } from "@/lib/bc-datapool/diff"
import { parsePriceList } from "@/lib/bc-datapool/price-list"
import { PRICE_LIST_KEY, loadPriceList, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"

/** Upload file báo giá BC Datapool (sheet "cmhk" + "Singtel") → parse → lưu app_settings để dùng lại. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file" }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File quá lớn (tối đa 5MB)" }, { status: 400 })

  let priceList
  try {
    priceList = parsePriceList(Buffer.from(await file.arrayBuffer()), file.name)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }

  const old = await loadPriceList()
  priceList.lastDiff = diffPriceList(old, priceList)

  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: PRICE_LIST_KEY,
    value: JSON.stringify(priceList),
    label: "Bảng báo giá BC Datapool (CMHK + Singtel)",
    category: "bc_datapool",
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const d = priceList.lastDiff
  if (hasPriceChanges(d)) {
    await createNotification("price_change", `BC Datapool: bảng báo giá mới — ${d.counts.changed} nhà mạng đổi giá, ${d.counts.added} mới, ${d.counts.removed} bị bỏ`,
      `${priceList.fileName}${d.counts.fees ? ` · ${d.counts.fees} khoản phí đổi` : ""}. Xem chi tiết ở Admin › Tạo sản phẩm.`, { summary: d.counts }, "admin_manager")
  }
  return NextResponse.json({ priceList })
}
