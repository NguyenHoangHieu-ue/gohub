// Dịch giá trị kỹ thuật của product/sku sang tiếng thường cho người không rành kỹ thuật.
// Nguyên tắc: không dùng thuật ngữ nội bộ ở mặt ngoài (Fixed/Daily Data, throttle, KYC…) mà không giải thích.
import type { CatalogueProductLite, DataKind, SkuAggregate } from "./types"

/** Tên hiển thị vendor. ref_vendors đôi khi viết hoa/lệch ("3HK DATAPOOL", "WORLDMOVE") nên có bảng chuẩn. */
const VENDOR_NAMES: Record<string, string> = {
  "3D": "3HK Datapool", "3H": "3HK", "3U": "3UK", BC: "BillionConnect", WD: "BillionConnect Datapool",
  CB: "Commbitz", CT: "China Telecom", CU: "China Unicom", DT: "DTAC", EL: "Elite", GB: "Gighub",
  JY: "Joytel", KD: "KDDI", MB: "Mobifone", SF: "Skyfi", SI: "SimStore", SS: "SimStore", TB: "T-Mobile",
  TM: "Truemove", UB: "Uhuibao", VM: "Vietnamobile", WM: "WorldMove",
}

export function hasVendorTableName(code: string): boolean { return code in VENDOR_NAMES }

export function vendorDisplayName(code: string, refName?: string | null): string {
  if (VENDOR_NAMES[code]) return VENDOR_NAMES[code]
  if (refName) return titleCaseIfShouting(refName)
  return code
}

export function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "")
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
  }
  return s
}

export const CONTINENT_VN: Record<string, string> = {
  Asia: "Châu Á", Europe: "Châu Âu", Americas: "Châu Mỹ", Africa: "Châu Phi",
  Oceania: "Châu Đại Dương", "Middle East": "Trung Đông",
}
export const CONTINENT_ORDER = ["Asia", "Europe", "Americas", "Oceania", "Middle East", "Africa"]

export function continentLabel(c: string | null | undefined): string {
  if (!c) return "Khác"
  return CONTINENT_VN[c] ?? c
}

/** Loại đã biết có tên tiếng Việt; loại MỚI xuất hiện trong dữ liệu sau này được hiện nguyên tên gốc (không bị nhầm thành "SIM vật lý"). */
export const KNOWN_SIMS = ["eSIM", "SIM"]
export function simLabel(sim: string): string {
  if (sim === "eSIM") return "eSIM"
  if (sim === "SIM") return "SIM vật lý"
  return sim
}
export function simExplain(sim: string): string {
  if (sim === "eSIM") return "eSIM: không có thẻ nhựa, khách quét mã QR để cài vào điện thoại."
  if (sim === "SIM") return "SIM vật lý: thẻ nhựa, khách lắp vào điện thoại."
  return `Loại: ${sim}.`
}
export function simRank(sim: string): number {
  const i = KNOWN_SIMS.indexOf(sim)
  return i >= 0 ? i : KNOWN_SIMS.length
}
/** "65 eSIM, 73 SIM vật lý" — đếm theo từng loại, loại mới tự có mặt. */
export function simBreakdown(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => simRank(a) - simRank(b) || a.localeCompare(b))
    .map(([k, n]) => `${n} ${simLabel(k)}`)
    .join(", ")
}

export function dataKindLabel(k: DataKind): string {
  if (k === "fixed") return "Trọn gói"
  if (k === "daily") return "Theo ngày"
  return k || "Chưa rõ"
}
export const KNOWN_DATA_KINDS = ["fixed", "daily"]
export function dataKindExplain(k: DataKind): string {
  if (k === "fixed") return "Trọn gói: một lượng dữ liệu dùng chung cho cả thời gian sử dụng, không cấp lại theo ngày."
  if (k === "daily") return "Theo ngày: mỗi ngày được một lượng dữ liệu, sang ngày mới được cấp lại."
  if (k) return `Kiểu tính dung lượng: ${k}.`
  return "Chưa có thông tin cách tính dung lượng."
}

export function statusLabel(s: string): string {
  switch (s) {
    case "Active": return "Đang bán"
    case "Preparing": return "Sắp có"
    case "Temporary": return "Tạm thời"
    case "Inactive": return "Ngưng bán"
    case "Deleted": return "Đã xoá"
    default: return s
  }
}
export const SELLABLE_STATUSES = new Set(["Active", "Temporary"])

export function tenantLabel(t: string): string {
  if (t === "VN") return "Bán từ pháp nhân Việt Nam"
  if (t === "US") return "Bán từ pháp nhân Mỹ"
  return t
}

// ── Dung lượng / số ngày ─────────────────────────────────────────────────────
export const UNLIMITED_GB = 9999

/** Quy về GB. MB → /1000 (đủ để so sánh, không dùng để hiển thị). */
export function toGb(amount: number | null | undefined, unit: string | null | undefined): number | null {
  if (amount == null || Number.isNaN(Number(amount))) return null
  const n = Number(amount)
  switch ((unit ?? "GB").toUpperCase()) {
    case "KB": return n / 1_000_000
    case "MB": return n / 1000
    case "TB": return n * 1000
    default: return n            // GB (hoặc đơn vị lạ: coi như GB để vẫn so sánh được)
  }
}

export function formatGb(gb: number): string {
  if (gb >= UNLIMITED_GB) return "Không giới hạn"
  if (gb < 1) return `${Math.round(gb * 1000)} MB`
  return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(1))} GB`
}

export function dataAmountLabel(amount: number | null | undefined, unit: string | null | undefined): string {
  const gb = toGb(amount, unit)
  if (gb == null) return "—"
  if (gb >= UNLIMITED_GB) return "Không giới hạn"
  const u = (unit ?? "GB").toUpperCase()
  if (u === "MB" || u === "KB" || u === "TB") return `${Number(amount)} ${u}`
  return formatGb(gb)
}

export function daysLabel(d: number | null | undefined): string {
  if (d == null) return "—"
  return `${d} ngày`
}

/** "1–30 GB · 3–30 ngày" cho thẻ gói. gbMin/gbMax chỉ tính các SKU có giới hạn; SKU không giới hạn đi kèm cờ hasUnlimited. */
export function rangeLabel(a: SkuAggregate, kind: DataKind): string | null {
  if (a.count === 0) return null
  const parts: string[] = []
  const dataBits: string[] = []
  if (a.gbMin != null && a.gbMax != null) {
    const lo = formatGb(a.gbMin), hi = formatGb(a.gbMax)
    dataBits.push((lo === hi ? lo : `${lo} – ${hi}`) + (kind === "daily" ? "/ngày" : ""))
  }
  if (a.hasUnlimited) dataBits.push("không giới hạn")
  if (dataBits.length) parts.push(dataBits.join(" hoặc "))
  if (a.daysMin != null && a.daysMax != null) {
    parts.push(a.daysMin === a.daysMax ? `${a.daysMin} ngày` : `${a.daysMin} – ${a.daysMax} ngày`)
  }
  return parts.join(" · ") || null
}

// ── Tốc độ sau khi hết dung lượng ────────────────────────────────────────────
/** Diễn giải cột skus.throttle_speed (giá trị thô rất lộn xộn) thành câu tiếng Việt. Không hiểu thì trả nguyên văn. */
export function throttleSentence(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (/^stop$/i.test(s)) return "Hết dung lượng là ngừng dùng (cần mua thêm nếu muốn tiếp tục)."
  let m = s.match(/^(\d+)\s*kbps$/i)
  if (m) {
    const n = Number(m[1])
    return `Hết dung lượng vẫn dùng được nhưng rất chậm (${n} kbps): chỉ đủ nhắn tin, khó lướt web.`
  }
  m = s.match(/^([\d.]+)\s*(MB|GB)\s*high\s*speed\s*then\s*(?:drop|throttle)\s*(?:to)?\s*([\d.]+)\s*mbps$/i)
  if (m) return `Dùng tốc độ cao ${m[1]} ${m[2].toUpperCase()}, sau đó giảm còn ${m[3]} Mbps.`
  m = s.match(/^unlimited(?:\s+([\d.]+)\s*mbps)?$/i)
  if (m) return m[1] ? `Không giới hạn dung lượng, tốc độ tối đa ${m[1]} Mbps.` : "Không giới hạn dung lượng."
  return s
}

/** Bản ngắn của throttleSentence cho thẻ gói. */
export function throttleShort(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (/^stop$/i.test(s)) return "ngừng dùng"
  let m = s.match(/^(\d+)\s*kbps$/i)
  if (m) return `rất chậm (${m[1]} kbps)`
  m = s.match(/^([\d.]+)\s*(MB|GB)\s*high\s*speed\s*then\s*(?:drop|throttle)\s*(?:to)?\s*([\d.]+)\s*mbps$/i)
  if (m) return `${m[1]} ${m[2].toUpperCase()} đầu chạy nhanh, sau đó còn ${m[3]} Mbps`
  m = s.match(/^unlimited(?:\s+([\d.]+)\s*mbps)?$/i)
  if (m) return m[1] ? `không giới hạn (tối đa ${m[1]} Mbps)` : "không giới hạn"
  return s
}

export function throttleSummary(list: string[]): string | null {
  const parts = Array.from(new Set(list.map(throttleShort).filter((x): x is string => !!x)))
  return parts.length ? parts.join(" / ") : null
}

/** Giờ cấp lại data mỗi ngày: dữ liệu thô có "Count 24h", "Local time", "GMT+8"… */
export function dailyResetSentence(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (/^count\s*24\s*h$/i.test(s)) return "Tính theo chu kỳ 24 giờ kể từ lúc bắt đầu dùng"
  if (/^local\s*time$/i.test(s)) return "Theo giờ địa phương của nước đang dùng"
  if (/^(gmt|utc)\s*[+-]\s*\d+/i.test(s)) return `Theo múi giờ ${s.replace(/\s+/g, "")}`
  return s
}

// ── Nghe gọi / SĐT ────────────────────────────────────────────────────────────
export function yesNo(v: string | boolean | null | undefined): boolean | null {
  if (typeof v === "boolean") return v
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (!s) return null
  if (s === "no" || s === "không" || s === "false") return false
  return true
}

// ── Tên gọn + câu tóm tắt ────────────────────────────────────────────────────
export function productTitle(p: Pick<CatalogueProductLite, "sim" | "dataKind">, vendorName: string): string {
  return `${vendorName} · ${simLabel(p.sim)} · ${dataKindLabel(p.dataKind).toLowerCase()}`
}

/** Vài câu mô tả gói bằng tiếng thường, dùng đầu ngăn chi tiết. */
export function summarySentences(
  p: CatalogueProductLite,
  o: { vendorName: string; countryNames: string[]; carrierText?: string | null },
): string[] {
  const out: string[] = []
  const where = o.countryNames.length === 1 ? o.countryNames[0]
    : o.countryNames.length <= 4 ? o.countryNames.join(", ")
    : `${o.countryNames.length} nước`
  out.push(`${simLabel(p.sim)} của ${o.vendorName}, dùng ở ${where}${p.network ? `, mạng ${p.network}` : ""}.`)
  if (o.carrierText) out.push(`Dùng sóng của nhà mạng: ${o.carrierText}.`)
  out.push(dataKindExplain(p.dataKind))
  const range = rangeLabel(p.sku, p.dataKind)
  if (range) out.push(`Các gói có sẵn: ${range}.`)
  if (p.localNumber) out.push(`Có số điện thoại tại chỗ${p.localNumberCountry ? ` (${p.localNumberCountry})` : ""}, nhận được cuộc gọi/OTP.`)
  if (p.hotspot === true) out.push("Có thể phát WiFi cho máy khác (hotspot).")
  if (p.hotspot === false) out.push("Không hỗ trợ phát WiFi cho máy khác.")
  if (p.kycNeeded === true) out.push("Khách phải xác minh danh tính (KYC) trước khi dùng.")
  if (p.kycNeeded === false) out.push("Không cần xác minh danh tính.")
  return out
}
