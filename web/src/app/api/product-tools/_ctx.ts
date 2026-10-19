// Dữ liệu nền cho tab Tính giá (dùng chung 2 route product-tools).
import { loadAssumptions, loadFx, loadPlanCatalog, loadPriceList, loadRefCountries, loadSupportCountries, loadWhiteSimVnd } from "@/lib/bc-datapool/server"
import { loadFrames, loadNcc3hk } from "@/lib/threehk-datapool/server"
import { memo } from "@/lib/memo"
import type { QuoteContext } from "@/lib/product-tools/quote"

// Nhiều người cùng tính giá → gom 9 lần đọc DB thành 1 lần mỗi 20 giây (bảng giá/tỷ giá vừa đổi có hiệu lực sau tối đa 20s)
export const loadQuoteContext = (): Promise<QuoteContext> => memo("product-tools:ctx", 20_000, loadFresh)

async function loadFresh(): Promise<QuoteContext> {
  const [list, catalog, ncc, groups, refs, fx, a, frames, whiteSimVnd] = await Promise.all([
    loadPriceList(), loadPlanCatalog(), loadNcc3hk(), loadSupportCountries(), loadRefCountries(), loadFx(), loadAssumptions(), loadFrames(), loadWhiteSimVnd(),
  ])
  return { list, catalog, ncc, groups, refs, fx, a, frames, whiteSimVnd }
}
