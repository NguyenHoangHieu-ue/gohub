// Dữ liệu nền cho tab Tính giá (dùng chung 2 route product-tools).
import { loadAssumptions, loadFx, loadPlanCatalog, loadPriceList, loadRefCountries, loadSupportCountries, loadWhiteSimVnd } from "@/lib/bc-datapool/server"
import { loadFrames, loadNcc3hk } from "@/lib/threehk-datapool/server"
import type { QuoteContext } from "@/lib/product-tools/quote"

export async function loadQuoteContext(): Promise<QuoteContext> {
  const [list, catalog, ncc, groups, refs, fx, a, frames, whiteSimVnd] = await Promise.all([
    loadPriceList(), loadPlanCatalog(), loadNcc3hk(), loadSupportCountries(), loadRefCountries(), loadFx(), loadAssumptions(), loadFrames(), loadWhiteSimVnd(),
  ])
  return { list, catalog, ncc, groups, refs, fx, a, frames, whiteSimVnd }
}
