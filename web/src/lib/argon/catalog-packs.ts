// Gói dữ liệu "thông tin sản phẩm" cho Phòng Argon: Product / SKU đã sync từ GoHub API về Supabase (bảng products, skus, ref_vendors) → văn bản gọn, để Argon đọc và so sánh
// (giá vốn giữa vendor, SKU thiếu/thừa, cấu hình gói…). Chỉ ĐỌC. Dạng dòng phân cách "|" (rẻ token hơn bảng markdown, có dòng tiêu đề giải thích cột).
export const SKU_SCOPES: { id: string; label: string; vendors: string[] }[] = [
  { id: "3D", label: "3HK Datapool", vendors: ["3D"] },
  { id: "WD", label: "BC Datapool (CMHK)", vendors: ["WD"] },
  { id: "W1", label: "BC Datapool (Singtel)", vendors: ["W1"] },
  { id: "BC", label: "Billion Connect", vendors: ["BC"] },
  { id: "WM", label: "WorldMove", vendors: ["WM"] },
  { id: "JY", label: "Joytel", vendors: ["JY"] },
  { id: "OTHER", label: "Vendor còn lại (Elite, Simstore, Truemove, KDDI, Gighub…)", vendors: [] },
]
const MAIN_VENDORS = new Set(SKU_SCOPES.flatMap(s => s.vendors))
const PAGE = 1000

interface ProductRow {
  product_code: string; tenant: string; status: string; type_of_sim: string | null; product_type: string | null; vendor_code: string | null; purchase_type: string | null
  source_type: string | null; data_type: string | null; supported_countries: string | null; onsite_carrier: string | null; local_phone_number: string | null
  hotspot: string | null; kyc_needed: string | null; note: string | null; apn: string | null
}
interface SkuRow {
  sku_code: string; product_code: string; tenant: string; status: string; sim_esim: string | null; product_type: string | null; throttle_speed: string | null
  day_amount: number | null; day_amount_unit: string | null; data_amount: number | null; data_amount_unit: string | null; latest_cogs: number | null; latest_cogs_currency: string | null
  vendor_sku: string | null; vendor_sku_sim: string | null; data_plan: string | null; frame: string | null; datapack: string | null
}

/** Giá trị người đọc được của cột kiểu JSON `{"key":"A","value":"SIM/eSIM data"}` (hoặc chữ thường). */
export function jsonValue(v: string | null | undefined): string {
  if (!v) return ""
  try { const j = JSON.parse(v) as { value?: string }; return String(j?.value ?? "") } catch { return String(v) }
}
const clean = (v: unknown, max = 60) => String(v ?? "").replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
const num = (n: number | null | undefined) => (n == null ? "" : String(Number(n)))

/** Dòng tiêu đề + 1 dòng/SKU. Thuần (có test). */
export function skuLine(s: SkuRow): string {
  const data = s.data_amount != null ? `${num(s.data_amount)}${s.data_amount_unit ?? ""}` : ""
  const days = s.day_amount != null ? `${num(s.day_amount)}${/month/i.test(s.day_amount_unit ?? "") ? "th" : "d"}` : ""
  return [s.sku_code, s.product_code, s.tenant, s.sim_esim ?? "", jsonValue(s.product_type) || (s.product_type ?? ""), data, days, clean(s.throttle_speed, 14), s.latest_cogs == null ? "" : `${num(s.latest_cogs)} ${s.latest_cogs_currency ?? ""}`.trim(),
    clean(s.vendor_sku, 24), clean(s.vendor_sku_sim, 24), clean(s.data_plan, 24)].join("|")
}
export const SKU_HEADER = "sku|product|tenant|SIM/eSIM|loại|data|thời hạn (d=ngày, th=tháng)|throttle|giá vốn hiện tại (latest_cogs)|vendorSku|vendorSku SIM|gói (data_plan)"

async function fetchAll<T>(table: string, select: string, apply: (q: any) => any, order: string): Promise<T[]> {
  const { supabaseAdmin } = await import("@/lib/supabase")   // nạp muộn: hàm thuần của file này test được không cần env Supabase
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(supabaseAdmin.from(table).select(select)).order(order, { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`Đọc ${table} lỗi: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function vendorNames(): Promise<Map<string, string>> {
  const { supabaseAdmin } = await import("@/lib/supabase")
  const { data } = await supabaseAdmin.from("ref_vendors").select("vendor_code,name")
  return new Map((data ?? []).map(v => [String(v.vendor_code), String(v.name)]))
}

const stamp = () => `Lấy lúc ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`

/** Danh mục Product (mọi trạng thái trừ Deleted) kèm số SKU và khoảng giá vốn hiện tại. */
export async function buildProductCatalog(): Promise<{ title: string; text: string }> {
  const [prods, skus, vn] = await Promise.all([
    fetchAll<ProductRow>("products", "product_code,tenant,status,type_of_sim,product_type,vendor_code,purchase_type,source_type,data_type,supported_countries,onsite_carrier,local_phone_number,hotspot,kyc_needed,note,apn", q => q.neq("status", "Deleted"), "product_code"),
    fetchAll<Pick<SkuRow, "product_code" | "status" | "latest_cogs" | "latest_cogs_currency">>("skus", "product_code,status,latest_cogs,latest_cogs_currency", q => q.neq("status", "Deleted"), "sku_code"),
    vendorNames(),
  ])
  const agg = new Map<string, { active: number; other: number; min: number; max: number; cur: string }>()
  for (const s of skus) {
    const a = agg.get(s.product_code) ?? { active: 0, other: 0, min: Infinity, max: -Infinity, cur: "" }
    if (s.status === "Active") {
      a.active++
      if (s.latest_cogs != null) { a.min = Math.min(a.min, Number(s.latest_cogs)); a.max = Math.max(a.max, Number(s.latest_cogs)); a.cur = s.latest_cogs_currency ?? a.cur }
    } else a.other++
    agg.set(s.product_code, a)
  }
  const header = "product|tenant|trạng thái|vendor|SIM/eSIM|loại|kiểu data|quốc gia (ISO)|nhà mạng tại điểm đến|số local|hotspot|KYC|mua hàng|nguồn|SKU Active|SKU khác (Inactive/Preparing/Temporary)|giá vốn Active thấp nhất–cao nhất|ghi chú"
  const lines = prods.map(p => {
    const a = agg.get(p.product_code)
    return [p.product_code, p.tenant, p.status, vn.get(p.vendor_code ?? "") ?? p.vendor_code ?? "", p.type_of_sim ?? "", jsonValue(p.product_type), p.data_type ?? "", clean(p.supported_countries, 40), clean(p.onsite_carrier, 50),
      clean(p.local_phone_number, 6), clean(p.hotspot, 10), clean(p.kyc_needed, 10), clean(p.purchase_type, 20), jsonValue(p.source_type), a?.active ?? 0, a?.other ?? 0,
      a && a.min !== Infinity ? `${a.min}–${a.max} ${a.cur}` : "", clean(p.note, 80)].join("|")
  })
  const byVendor = new Map<string, number>()
  for (const p of prods) { const n = vn.get(p.vendor_code ?? "") ?? p.vendor_code ?? "?"; byVendor.set(n, (byVendor.get(n) ?? 0) + 1) }
  const note = `${stamp()} · ${prods.length} Product (bỏ trạng thái Deleted), dữ liệu sync từ GoHub API về Supabase (bảng products + skus).\nTheo vendor: ${Array.from(byVendor, ([n, c]) => `${n} ${c}`).join(", ")}.\nCột "giá vốn" lấy từ latest_cogs của SKU Active (cùng tiền tệ của tenant: US=USD, VN=VND). Chi tiết từng SKU: dùng các gói "SKU theo vendor".`
  return { title: "📦 Danh mục Product (sync từ database)", text: `${note}\n\n${header}\n${lines.join("\n")}` }
}

/** Danh sách SKU ĐANG ACTIVE của 1 nhóm vendor (scope = id trong SKU_SCOPES). */
export async function buildSkuPack(scope: string): Promise<{ title: string; text: string }> {
  const sc = SKU_SCOPES.find(s => s.id === scope)
  if (!sc) throw new Error(`Nhóm vendor không có: "${scope}" (chọn: ${SKU_SCOPES.map(s => s.id).join(", ")})`)
  const [prods, vn] = await Promise.all([
    fetchAll<Pick<ProductRow, "product_code" | "vendor_code">>("products", "product_code,vendor_code", q => q.neq("status", "Deleted"), "product_code"),
    vendorNames(),
  ])
  const codes = prods.filter(p => (sc.vendors.length ? sc.vendors.includes(p.vendor_code ?? "") : !MAIN_VENDORS.has(p.vendor_code ?? ""))).map(p => p.product_code)
  if (!codes.length) throw new Error(`Nhóm "${sc.label}" không có Product nào`)
  const skus: SkuRow[] = []
  for (let i = 0; i < codes.length; i += 150) {   // theo lô mã Product (không truy vấn từng SKU)
    const chunk = codes.slice(i, i + 150)
    skus.push(...await fetchAll<SkuRow>("skus", "sku_code,product_code,tenant,status,sim_esim,product_type,throttle_speed,day_amount,day_amount_unit,data_amount,data_amount_unit,latest_cogs,latest_cogs_currency,vendor_sku,vendor_sku_sim,data_plan,frame,datapack", q => q.in("product_code", chunk).eq("status", "Active"), "sku_code"))
  }
  skus.sort((a, b) => a.sku_code.localeCompare(b.sku_code))
  const names = sc.vendors.length ? sc.vendors.map(v => vn.get(v) ?? v).join(", ") : "các vendor còn lại"
  const note = `${stamp()} · ${skus.length} SKU Active của ${names} (${codes.length} Product). SKU Inactive/Preparing/Temporary/Deleted KHÔNG có trong gói này. Sync từ GoHub API về Supabase (bảng skus).\nGiá vốn: US = USD, VN = VND; mỗi SKU có thể xuất hiện 2 lần (tenant US và VN).`
  return { title: `📦 SKU ${sc.label}`, text: `${note}\n\n${SKU_HEADER}\n${skus.map(skuLine).join("\n")}` }
}
