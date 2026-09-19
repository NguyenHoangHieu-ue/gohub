// Tách nhà mạng theo nước từ cột products.onsite_carrier.
// Với gói nhiều nước, cột này là đoạn văn "Nước: Carrier" (có thể xuống dòng hoặc dính liền 1 dòng, VD
// "Australia: Telstra New Zealand: Spark"). Với gói 1 nước thường chỉ là tên nhà mạng ("Verizon").

export interface CarrierEntry { label: string; carriers: string }

/** Tên gọi khác thường gặp trong onsite_carrier → tên chuẩn để so khớp. */
const EXTRA_LABELS = [
  "US", "USA", "UK", "UAE", "Korea", "South Korea", "Czech Republic", "Czechia", "Russia", "Vatican City",
  "Hong Kong", "HongKong", "Macau", "Macao", "Taiwan", "Turkey", "Turkiye", "Vietnam", "Viet Nam", "Ivory Coast",
]

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Cắt chuỗi thành các mục {label, carriers}. `knownLabels` là danh sách tên nước hợp lệ (EN) để nhận diện
 * nhãn — cần vì nhãn nhiều từ ("New Zealand") và nhà mạng cũng nhiều từ nên không thể tách bằng dấu cách.
 * Trả null nếu không tìm thấy nhãn "Nước:" nào (⇒ chuỗi không theo dạng theo-nước).
 */
export function parseCarrierMap(raw: string | null | undefined, knownLabels: string[]): CarrierEntry[] | null {
  const text = (raw ?? "").replace(/\r/g, "").trim()
  if (!text || !text.includes(":")) return null
  const labels = Array.from(new Set([...knownLabels, ...EXTRA_LABELS].filter(Boolean)))
    .sort((a, b) => b.length - a.length)
  if (labels.length === 0) return null
  const re = new RegExp(`(?:^|[\\s,;/])(${labels.map(esc).join("|")})\\s*:\\s*`, "gi")
  const hits: { label: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const labelStart = m.index + m[0].indexOf(m[1])
    hits.push({ label: m[1], start: labelStart, end: m.index + m[0].length })
  }
  if (hits.length === 0) return null
  const out: CarrierEntry[] = []
  for (let i = 0; i < hits.length; i++) {
    const to = i + 1 < hits.length ? hits[i + 1].start : text.length
    const carriers = text.slice(hits[i].end, to).replace(/[\s,;/]+$/g, "").replace(/\s+/g, " ").trim()
    if (carriers) out.push({ label: hits[i].label, carriers })
  }
  return out.length ? out : null
}

export type CarrierResult =
  | { mode: "single"; text: string }                       // 1 nhà mạng cho mọi nước phủ
  | { mode: "country"; text: string }                       // tách được đúng nước đang xem
  | { mode: "other"; text: string; entries: CarrierEntry[] } // theo-nước nhưng KHÔNG có mục của nước này
  | { mode: "unparsed"; text: string }                      // có dấu ":" nhưng không nhận diện được → hiện nguyên văn
  | { mode: "none" }

/** Nhà mạng áp dụng cho nước đang xem. `countryAliases` = mọi cách gọi của nước đó (EN, VN, US/USA…). */
export function carrierForCountry(
  raw: string | null | undefined,
  countryAliases: string[],
  knownLabels: string[],
): CarrierResult {
  const text = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!text) return { mode: "none" }
  if (!text.includes(":")) {
    // "Various" = nhiều nhà mạng tuỳ khu vực (giá trị thô trong dữ liệu) — nói rõ hơn cho người dùng
    return { mode: "single", text: /^various$/i.test(text) ? "Nhiều nhà mạng (tuỳ khu vực)" : text }
  }
  const entries = parseCarrierMap(raw, [...knownLabels, ...countryAliases])
  if (!entries) return { mode: "unparsed", text }
  const norm = (s: string) => s.trim().toLowerCase()
  const want = new Set(countryAliases.map(norm))
  const hit = entries.find(e => want.has(norm(e.label)))
  if (hit) return { mode: "country", text: hit.carriers }
  return { mode: "other", text, entries }
}
