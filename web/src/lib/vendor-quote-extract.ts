// AI đọc báo giá vendor (ảnh / PDF / Word / Excel / text) → danh sách gói chuẩn hoá để Hiếu duyệt rồi lưu `vendor_quotes`.
// Mẫu thật đã dùng để viết prompt (2026-10-06): VNPT (PDF, VND, giá SIM + eSIM riêng, gói RU dùng ở từng nước trong 16 nước liệt kê
// trang 2) và Roam Communication (ảnh email, GBP, gói UK kèm gọi/SMS, gói Orange "Europe + UK Switzerland"/"World 194 countries").
import { GEMINI_MODEL } from "@/lib/ai-models"
import { genai } from "@/lib/agents/genai-stream"
import { ThinkingLevel } from "@google/genai"
import type { FileContext } from "@/lib/agents/file-parser"

export type QuotePlan = "Daily" | "Fixed" | "Unlimited"

export interface QuoteItem {
  name: string
  countries: string[]          // ISO2 các nước dùng được (rỗng nếu chỉ có tên vùng → market_code)
  market_code: string | null   // mã nhóm nước GoHub (ref_support_countries) cho vùng không liệt kê nước
  region_label: string         // nguyên văn vùng/nước trong báo giá
  plan: QuotePlan
  data_gb: number              // Daily: GB/ngày · Fixed: tổng GB · Unlimited: 0
  days: number
  price_esim: number | null    // theo tiền tệ báo giá
  price_sim: number | null
  has_call: boolean
  note: string
}

export interface ExtractedQuote {
  vendor: string; currency: string; quote_date: string | null; moq: string; note: string
  items: QuoteItem[]
  warnings: string[]
}

export interface MarketGroupLite { code: string; en: string; iso: string }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Chuẩn hoá + kiểm tra kết quả model (không tin model): bỏ dòng không giá/không thời hạn, mã nước/mã nhóm phải tồn tại. */
export function normalizeExtracted(raw: any, validIso: Set<string>, groups: MarketGroupLite[]): ExtractedQuote {
  const warnings: string[] = Array.isArray(raw?.warnings) ? raw.warnings.map(String) : []
  const groupCodes = new Set(groups.map(g => g.code))
  const items: QuoteItem[] = []
  for (const [i, r] of (Array.isArray(raw?.items) ? raw.items : []).entries()) {
    const label = String(r?.name ?? `Dòng ${i + 1}`)
    const plan = (["Daily", "Fixed", "Unlimited"] as const).find(p => p.toLowerCase() === String(r?.plan ?? "").toLowerCase())
    const days = Math.round(Number(r?.days) || 0)
    const esim = num(r?.price_esim), sim = num(r?.price_sim)
    if (!plan || days <= 0 || (!esim && !sim)) { warnings.push(`Bỏ "${label}": thiếu loại gói, số ngày hoặc giá`); continue }
    const countries = Array.from(new Set((Array.isArray(r?.countries) ? r.countries : []).map((c: unknown) => String(c).trim().toUpperCase())))
      .filter((c): c is string => /^[A-Z]{2}$/.test(c as string))
    const unknown = countries.filter(c => !validIso.has(c))
    if (unknown.length) warnings.push(`"${label}": bỏ mã nước không nhận ra ${unknown.join(", ")}`)
    const market = r?.market_code && groupCodes.has(String(r.market_code).toUpperCase()) ? String(r.market_code).toUpperCase() : null
    const okCountries = countries.filter(c => validIso.has(c))
    if (!okCountries.length && !market) warnings.push(`"${label}": chưa gán được nước/nhóm nước — chọn tay trước khi lưu`)
    items.push({
      name: label, countries: okCountries, market_code: market, region_label: String(r?.region_label ?? ""),
      plan, data_gb: plan === "Unlimited" ? 0 : (num(r?.data_gb) ?? 0), days,
      price_esim: esim, price_sim: sim, has_call: !!r?.has_call, note: String(r?.note ?? ""),
    })
  }
  return {
    vendor: String(raw?.vendor ?? "").trim(), currency: String(raw?.currency ?? "USD").trim().toUpperCase().slice(0, 3) || "USD",
    quote_date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.quote_date ?? "")) ? String(raw.quote_date) : null,
    moq: String(raw?.moq ?? ""), note: String(raw?.note ?? ""), items, warnings,
  }
}

function prompt(vendorHint: string, groups: MarketGroupLite[]): string {
  const groupList = groups.map(g => `${g.code}: ${g.en} [${g.iso}]`).join("\n")
  return `Bạn đọc BÁO GIÁ của 1 nhà cung cấp SIM/eSIM du lịch gửi cho GoHub (có thể là ảnh chụp email, PDF, Word, Excel, text).
Trả về DUY NHẤT 1 JSON đúng dạng:
{"vendor": string, "currency": "VND"|"USD"|"GBP"|"EUR"|"HKD"|"CNY"|"TWD"|..., "quote_date": "YYYY-MM-DD"|null, "moq": string, "note": string,
 "items": [{"name": string, "countries": ["ISO2",...], "market_code": string|null, "region_label": string,
            "plan": "Daily"|"Fixed"|"Unlimited", "data_gb": number, "days": number,
            "price_esim": number|null, "price_sim": number|null, "has_call": boolean, "note": string}],
 "warnings": [string]}

Quy tắc:
- Mỗi gói cước = 1 item. Nếu giá SIM vật lý và giá eSIM nằm 2 cột thì cùng 1 item (price_sim, price_esim). Ô trống/không bán = null.
- Giá là SỐ theo tiền tệ báo giá, bỏ ký hiệu và dấu nghìn: "65.000" (VND) → 65000; "£4.50" → 4.5. KHÔNG tự đổi tiền, KHÔNG bịa giá.
- "X GB/1 ngày", "X GB/day" → plan "Daily", data_gb = X. Tổng dung lượng cả kỳ → "Fixed", data_gb = tổng GB. "Không giới hạn dung lượng
  tốc độ cao", "Unlimited data" → "Unlimited", data_gb = 0. 500MB = 0.5.
- days = số ngày sử dụng ("30 days", "Thời hạn 7").
- countries = mã ISO2 các nước gói dùng được, khi báo giá LIỆT KÊ nước (kể cả danh sách ở trang khác áp cho nhiều gói — áp cho đúng các gói đó).
  Gói cho khách đến Việt Nam → ["VN"]. Vương quốc Anh = "GB". Hồng Kông "HK", Đài Loan "TW", Hàn Quốc "KR", UAE "AE".
- Vùng KHÔNG liệt kê nước ("Europe + UK Switzerland", "World 194 countries", "Asia"...) → countries = [] và chọn market_code là mã nhóm
  GoHub khớp nhất trong danh sách dưới (không chắc thì null và ghi vào warnings). region_label luôn ghi nguyên văn vùng/nước.
- Gói nội địa 1 nước có phần "roaming" riêng (vd "In UK allowance 40GB, Roaming 6GB"): data_gb = dung lượng trong nước đó, ghi phần roaming vào note.
- has_call = true nếu gói kèm gọi/SMS ("Unlimited calls & Text", "Sim thoại").
- MOQ, điều kiện đặt hàng, hiệu lực → "moq"/"note". Thông tin không chắc → "warnings".
${vendorHint ? `- Tên vendor người dùng nhập: "${vendorHint}".` : ""}

Mã nhóm nước GoHub (code: tên [ISO2 các nước]):
${groupList}`
}

/** Gọi Gemini đọc mọi file + text dán vào. Lỗi model → ném lỗi để route trả 500 rõ ràng. */
export async function extractVendorQuote(files: FileContext[], text: string, vendorHint: string, groups: MarketGroupLite[], validIso: Set<string>): Promise<ExtractedQuote> {
  const parts: any[] = [{ text: prompt(vendorHint, groups) }]
  for (const f of files) {
    if (f.type === "text") parts.push({ text: `=== File: ${f.name} ===\n${f.content.slice(0, 60_000)}` })
    else parts.push({ text: `=== File: ${f.name} ===` }, { inlineData: { mimeType: f.mimeType ?? "application/octet-stream", data: f.content } })
  }
  if (text.trim()) parts.push({ text: `=== Nội dung dán vào ===\n${text.slice(0, 60_000)}` })
  const r = await genai().models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  })
  let raw: unknown
  try { raw = JSON.parse(r.text ?? "") } catch { throw new Error("AI trả về không phải JSON — thử lại hoặc dán text") }
  return normalizeExtracted(raw, validIso, groups)
}
