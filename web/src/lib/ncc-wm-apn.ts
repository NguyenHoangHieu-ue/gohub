import * as XLSX from "xlsx"

/**
 * File "APN" của WorldMove (apn_WM.xlsx): bảng khối — 1 dòng đầu khối có tên gói (VD "【Worldmove】中港澳A\nChina, Hong Kong, Macao A")
 * + các dòng kế tiếp bỏ trống tên là nhà mạng của từng nước trong gói đó. Dùng để điền APN/nhà mạng cho sản phẩm của file giá WM.
 */
export interface ApnBlock {
  /** Tên tiếng Anh của gói (phần sau dòng Hán) — rỗng nếu WM để trống tên */
  name: string
  prepaid: string | null
  localSource: string | null
  apn: string | null
  networkType: string | null
  onsiteCarrier: string | null
  /** "Nước: nhà mạng | Nước: nhà mạng" */
  providers: string | null
  coverage: string | null
  dataReset: string | null
  notification: string | null
}

const cell = (v: unknown) => (v == null ? "" : String(v).replace(/ /g, " ").trim())
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/g
/** Bỏ chữ Hán/ký tự toàn-rộng, gọn khoảng trắng — giữ phần tiếng Anh */
export const stripCjk = (s: string) => s.replace(/[、，]/g, ", ").replace(CJK, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim()

/** Nhà mạng 1 nước: "中國內地（Mainland China）China Unicom" → "Mainland China: China Unicom" */
function providerOf(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim()
  if (!t) return null
  const m = /[（(]\s*([^）)]+?)\s*[）)]\s*(.*)$/.exec(t)
  if (m) return m[2] ? `${m[1].trim()}: ${stripCjk(m[2])}` : m[1].trim()
  const s = stripCjk(t)
  return s || null
}

function resetOf(raw: string): string | null {
  const t = /(\d{1,2}:\d{2})[^\n]*?\(?\s*UTC\s*([+-]\s*\d+)/i.exec(raw)
  return t ? `${t[1]} UTC${t[2].replace(/\s+/g, "")}` : null
}

export function parseApnFile(buf: Buffer | ArrayBuffer): ApnBlock[] {
  const wb = XLSX.read(buf, { type: "buffer" })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, blankrows: false })
  const hi = rows.findIndex(r => cell(r[0]).includes("plan name"))
  if (hi < 0) throw new Error('Không thấy dòng tiêu đề "plan name" trong file APN')
  const blocks: ApnBlock[] = []
  const provs: string[][] = []
  let cur: ApnBlock | null = null
  for (const r of rows.slice(hi + 1)) {
    const name = cell(r[0]), apn = cell(r[5]), prov = cell(r[3])
    if (name || apn) {   // đầu khối; dòng tiếp theo của khối thì không tên, không APN
      // Tên gói: dòng Hán + dòng tiếng Anh → lấy dòng không có chữ Hán; ô 1 dòng thì bỏ chữ Hán
      const lines = name.replace(/【[^】]*】/g, "").split("\n").map(x => x.trim()).filter(Boolean)
      const en = (lines.filter(x => !/[⺀-鿿＀-￯]/.test(x)).join(" ") || stripCjk(lines.join(" "))).replace(/\s+/g, " ").trim()
      const cov = stripCjk(cell(r[7])).replace(/,?\s*\band\b\s*/gi, ", ").split(/\s*,\s*/).map(x => x.trim()).filter(x => x && !/^\d+$/.test(x)).join(", ")
      cur = {
        name: en, prepaid: cell(r[1]) || null, localSource: cell(r[2]) || null, apn: apn || null, networkType: cell(r[4]) || null,
        onsiteCarrier: cell(r[6]) || null, providers: null, coverage: cov || null, dataReset: resetOf(cell(r[9])), notification: stripCjk(cell(r[8])) || null,
      }
      blocks.push(cur); provs.push([])
    }
    if (cur && prov) { const p = providerOf(prov); if (p) provs[provs.length - 1].push(p) }
  }
  blocks.forEach((b, i) => { b.providers = provs[i].join(" | ") || null })
  return blocks
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bsouth korea\b/, "korea").trim()
/** Bộ từ chữ cái (bỏ số, bỏ thứ tự) — khớp mềm cho tên viết khác nhau: "Unitel Mongolia" ~ "Mongolia Unitel", "CTE（UK）-30GB" ~ "CTE UK -30/60/200 GB" */
const tokenKey = (s: string) => Array.from(new Set(norm(s).replace(/\d+/g, " ").split(" ").filter(w => /^[a-z]{2,}$/.test(w)))).sort().join(" ")

/** Phần "tên cơ sở" của sản phẩm: cắt trước đoạn đầu tiên nói về số ngày/dung lượng. "China, Hong Kong, Macao A, 10 Days, 5GB" → "China, Hong Kong, Macao A" */
export function productBase(name: string): string {
  const out: string[] = []
  for (const p of name.split(/[,，]/).map(s => s.trim())) {
    if (/^[\d/]+\s*(days?|d)\b/i.test(p) || /^\d+(\.\d+)?\s*(gb|mb)\b/i.test(p) || /^(total|unlimited|premium)\b/i.test(p)) break
    out.push(p)
  }
  return out.join(", ").replace(/\s+\d+\s*days?\b.*$/i, "").trim()
}

const isUnl = (s: string) => /unlimited|AYCE/i.test(s)
const isPremium = (s: string) => /premium/i.test(s)

/** Chọn khối APN cho 1 sản phẩm: ưu tiên khối "đặc thù" (tên có kèm ngày/Unlimited khớp), rồi khối cơ sở trùng tên. null nếu không có. */
export function findApnBlock(blocks: ApnBlock[], productName: string): ApnBlock | null {
  const baseRaw = productBase(productName)
  const base = norm(baseRaw)
  if (!base) return null
  const unl = isUnl(productName), prem = isPremium(productName)
  const days = Number(/(\d+)\s*days?/i.exec(productName)?.[1])
  let generic: ApnBlock | null = null
  let specific: ApnBlock | null = null
  for (const b of blocks) {
    if (!b.name) continue
    const bBase = productBase(b.name)
    if (norm(bBase) !== base) continue
    const rest = b.name.slice(bBase.length)
    const dayList = (/([\d/]+)\s*days?/i.exec(rest)?.[1] ?? "").split("/").map(Number).filter(Boolean)
    if (!dayList.length && !isUnl(rest)) { generic ??= b; continue }
    const okDays = !dayList.length || dayList.includes(days)
    const okUnl = isUnl(rest) ? unl && isPremium(rest) === prem : !unl
    if (okDays && okUnl) specific ??= b
  }
  if (specific ?? generic) return specific ?? generic
  // WM để trống tên gói "Mainland China CT" (khối China Telecom / CTExcel)
  if (base === "mainland china ct") return blocks.find(b => !b.name && b.apn === "CTExcel" && b.coverage === "Mainland China") ?? null
  // Khớp mềm theo bộ từ (chỉ khi duy nhất 1 khối)
  const tk = tokenKey(productName.split(/[,，]/)[0])
  if (tk.split(" ").length < 2) return null
  const soft = blocks.filter(b => b.name && tokenKey(productBase(b.name) || b.name) === tk)
  return soft.length === 1 ? soft[0] : null
}
