import { KHO_MISSION_NAME } from "./kho-pure"

// "Bối cảnh & Kế hoạch": sứ mệnh "Tham mưu hằng ngày" đọc MỌI nguồn trong Kho (thread, mail, file, sổ sự việc) để hiểu công ty đang ở đâu, đọc kế hoạch/metric
// Hiếu tự viết bằng văn bản (brief.md) để biết việc của Hiếu, rồi mỗi đêm ghi: notes/boi-canh.md, notes/tac-dong.md (+ notes/tin-hom-nay.md cho trang chủ Argon).
// Phần THUẦN (không I/O): hằng số, câu lệnh đêm, bộ kiểm đề xuất.
export const DAILY_MISSION_NAME = "Tham mưu hằng ngày"
export const DAILY_GOAL = "Theo dõi số liệu và tin mới của công ty mỗi ngày, đối chiếu với kế hoạch và metric của Hiếu, rồi đề xuất tối đa 3 việc nên làm. Viết ngắn gọn, thực tế, có nguồn."
export const BOI_CANH_PATH = "notes/boi-canh.md"
export const TAC_DONG_PATH = "notes/tac-dong.md"
export const TIN_PATH = "notes/tin-hom-nay.md"

/** Sứ mệnh nào đọc mọi nguồn trong Kho (tìm bằng chỉ mục, chỉ nạp sẵn nguồn ghim) thay vì chỉ nguồn gắn tay. */
export const usesKhoScope = (name: string) => name === KHO_MISSION_NAME || name === DAILY_MISSION_NAME

export const BRIEF_TEXT = `# Tham mưu hằng ngày

## Kế hoạch và metric của anh
(Anh viết bằng văn bản: mục tiêu quý, metric theo dõi — tên, mục tiêu, hiện tại —, việc đang làm, điều cần ưu tiên. Argon chỉ coi những gì ghi ở đây là kế hoạch của anh, không tự thêm mục tiêu hay số.)

## Cách viết (bắt buộc)
- Câu ngắn, từ thường. Không dùng thuật ngữ khi chưa giải thích.
- Mỗi đề xuất có: việc cần làm, lý do bằng số liệu cụ thể kèm nguồn, mức chắc chắn (Chắc / Có thể / Chưa đủ dữ liệu).
- Tối đa 3 đề xuất. Không suy đoán ngoài dữ liệu. Thiếu dữ liệu thì nói thẳng là thiếu, không điền số ước lượng.
- Không đưa ra kỳ vọng vượt khả năng thực tế của số liệu hiện có.
`
export const BRIEFING_MARK = "## Khi anh bảo \"Cập nhật bản tin hôm nay\""
export const BRIEFING_SECTION = `
${BRIEFING_MARK}
Ghi vào notes/tin-hom-nay.md (ghi đè). Làm theo các bước:
1) Lấy số liệu 7 ngày gần nhất và quý hiện tại (doanh thu, GP, CM1) bằng công cụ lấy số liệu hệ thống, so với kỳ trước và với target.
2) Nếu có nguồn Lark đã gắn (thread, mail, file), tìm tin mới đáng chú ý trong đó.
3) Viết bản tin ngắn: "Đáng chú ý" (tối đa 3 ý, mỗi ý kèm số hoặc nguồn) rồi "Nên làm" (tối đa 3 việc, mỗi việc có lý do và mức chắc chắn).
Không hỏi lại. Chỗ nào thiếu dữ liệu thì ghi rõ là thiếu.
`

/** Câu lệnh chạy mỗi đêm (và nút "Cập nhật ngay"): dựng bối cảnh, đối chiếu kế hoạch, đề xuất có nguồn. */
export const NIGHTLY_PROMPT = `Cập nhật bối cảnh công ty và đối chiếu với kế hoạch của anh Hiếu. Làm lần lượt:
LUẬT BẮT BUỘC (đã có lần bỏ qua): các khối <boi_canh_hien_tai> và <tac_dong_de_xuat_hien_tai> trong ngữ cảnh chỉ là BẢN CŨ để so sánh — KHÔNG chép lại số liệu, [#N] hay nhận định từ đó; mọi số phải lấy lại bằng công cụ trong lượt này. Lượt chỉ được coi là xong khi đã GỌI công cụ ghi đè đủ ba file notes/boi-canh.md, notes/tac-dong.md, notes/tin-hom-nay.md. Không được chỉ trả lời bằng chữ.
1) Đọc brief.md: phần kế hoạch và metric là văn bản anh Hiếu tự viết. CHỈ coi những gì ghi ở đó là kế hoạch; tuyệt đối không tự bịa mục tiêu, metric hay con số. Nếu chưa có kế hoạch/metric thật thì ghi rõ điều đó ở đầu notes/tac-dong.md, nhắc anh điền, và chỉ làm bước 2.
2) Bối cảnh: tra traSuViec (sự việc có hạn còn hiệu lực), rồi lietKeNguon để thấy nguồn mới, timTrongNguon / docNguon để đọc các thread và mail mới nhất (ưu tiên 14 ngày gần đây). GHI ĐÈ notes/boi-canh.md (tối đa 60 dòng) gồm các mục: "Đối tác và vendor" (mỗi vendor: tình hình mới nhất, việc đang chờ ai), "Khách hàng và kênh", "Sản phẩm và thị trường" (đổi giá, ngừng bán, mới), "Việc đang chờ và quyết định cần anh", "Rủi ro và điểm nghẽn". Mỗi ý kèm (nguồn: tên nguồn, ngày). Điều cũ hơn 30 ngày chỉ nhắc nếu còn hiệu lực.
3) Số liệu: nếu brief.md có metric cần so thì lấy số 7 ngày gần nhất và quý hiện tại bằng layDuLieuHeThong (hoặc sql), so với mục tiêu anh ghi. Với mỗi sự việc còn hiệu lực loại ngung_ban, doi_gia, doi_mang, khuyen_mai trong sổ: dùng sql kiểm tra sản phẩm/nước liên quan trong hệ thống (dim_sku: còn Active không, vendor nào; doanh thu 30 ngày gần nhất) để biết mức ảnh hưởng thật và phát hiện chỗ hệ thống không khớp tin vendor.
4) GHI ĐÈ notes/tac-dong.md gồm ba phần:
## Tác động tới kế hoạch
Mỗi tin/sự việc mới thật sự ảnh hưởng tới một mục trong brief.md: "- <mục trong brief.md>: <điều gì đổi> (nguồn: …) → ảnh hưởng tốt / xấu / chưa rõ". Chỉ nêu khi có liên hệ thật. Không có thì ghi đúng một dòng: "Chưa có tin nào ảnh hưởng tới kế hoạch."
## Mâu thuẫn và mức ảnh hưởng
Mỗi sự việc đã kiểm ở bước 3: "- <sự việc> (nguồn: …): hệ thống cho thấy <số liệu cụ thể kèm [#N]> → khớp / MÂU THUẪN / không đủ dữ liệu". Chỉ ghi mục có số liệu thật; không có gì đáng nói thì ghi đúng một dòng: "Chưa phát hiện mâu thuẫn." Mâu thuẫn là điều anh cần xử lý nên nêu rõ vì sao và hậu quả (vd tin vendor nói ngừng bán nhưng SKU vẫn Active và còn doanh thu 30 ngày).
## Đề xuất hôm nay
Tối đa 3 đề xuất, đúng khuôn sau cho từng cái:
### 1. <việc cần làm> — <Chắc|Có thể|Chưa đủ dữ liệu>
- Vì sao: <lý do ngắn, có số liệu cụ thể>
- Ảnh hưởng: <số tiền VND mỗi tháng hoặc mỗi quý, nêu cách tính; hoặc "chưa lượng hoá được">
- Nguồn: <tên nguồn, tên nguồn>
- Liên quan kế hoạch: <mục trong brief.md, hoặc "ngoài kế hoạch">
XẾP THỨ TỰ: việc có Ảnh hưởng tiền lớn nhất đứng đầu. Việc dưới khoảng 5 triệu VND mỗi tháng chỉ được nêu khi là rủi ro an toàn/pháp lý/mất dịch vụ, và không được đứng trên việc lớn hơn.
NHÃN CHẮC CHẮN: "Chắc" chỉ khi MỌI con số trong đề xuất đã đo bằng công cụ trong lượt này và việc không phụ thuộc giả định. Có phép chiếu hay kịch bản ("nếu chuyển X thì Y", "sẽ vượt", "ước tính") thì nhãn tối đa là "Có thể", phần dự phóng ghi rõ là ước tính kèm giả định.
Không đủ căn cứ thì ghi "Chưa có đề xuất đủ căn cứ hôm nay." thay vì cố nghĩ ra. Không lặp lại đề xuất cũ nếu tình hình không đổi.
5) GHI ĐÈ notes/tin-hom-nay.md: bản tin tối đa 10 dòng rút từ hai file trên.
Quy tắc: không phóng đại, không đoán; mọi ý phải có nguồn thật trong Kho hoặc số liệu hệ thống; thiếu dữ liệu thì nói thẳng và đánh "Chưa đủ dữ liệu"; không hỏi lại (không ai trả lời lúc này).`

export interface ProposalAudit { total: number; ok: number; issues: string[]; empty: boolean; missingSection?: boolean }
const LABEL = /(Chắc chắn|Chắc|Có thể|Chưa đủ dữ liệu)\s*\**\s*$/i

/** Kiểm các đề xuất trong tac-dong.md: mỗi "### n." phải có nhãn chắc chắn, dòng "Nguồn:" có nội dung và dòng "Liên quan kế hoạch:". Thuần. */
export function auditProposals(md: string): ProposalAudit {
  const sec = /^##\s*Đề xuất[^\n]*\n([\s\S]*?)(?=^##\s[^#]|$(?![\s\S]))/m.exec(md)
  const body = sec?.[1] ?? ""
  const items = body.split(/^###\s+/m).slice(1)
  // Không có mục "## Đề xuất" nào (model bỏ hẳn) khác với có mục nhưng ghi "Chưa có đề xuất đủ căn cứ hôm nay."
  if (!items.length) return { total: 0, ok: 0, issues: [], empty: true, missingSection: !sec }
  const issues: string[] = []
  let ok = 0
  let prevImpact: number | null = null
  items.forEach((it, i) => {
    const head = it.split("\n")[0].trim()
    const miss: string[] = []
    const label = LABEL.exec(head)
    if (!label) miss.push("thiếu nhãn Chắc / Có thể / Chưa đủ dữ liệu")
    const src = /^\s*-?\s*Nguồn\s*:\s*(.+)$/im.exec(it)
    if (!src || src[1].trim().length < 3) miss.push("thiếu nguồn")
    if (!/Liên quan kế hoạch\s*:\s*\S+/i.test(it)) miss.push("thiếu mục kế hoạch liên quan")
    const imp = /^\s*-?\s*Ảnh hưởng\s*:\s*(.+)$/im.exec(it)
    if (!imp || imp[1].trim().length < 3) miss.push("thiếu mức ảnh hưởng")
    // "Chắc" chỉ cho số đã đo; có phép chiếu/kịch bản trong lý do thì phải là "Có thể"
    const why = /^\s*-?\s*Vì sao\s*:\s*(.+)$/im.exec(it)?.[1] ?? ""
    if (label && /^chắc/i.test(label[1]) && PROJECTION.test(why)) miss.push('nhãn "Chắc" nhưng lý do có phần dự phóng (nếu/ước tính/sẽ) — nên là "Có thể"')
    const amount = imp ? impactVnd(imp[1]) : null
    if (amount !== null) {
      if (prevImpact !== null && amount > prevImpact) miss.push("chưa xếp theo mức ảnh hưởng (việc này lớn hơn việc đứng trước)")
      prevImpact = amount
    }
    if (miss.length) issues.push(`Đề xuất ${i + 1}: ${miss.join(", ")}`); else ok++
  })
  return { total: items.length, ok, issues, empty: false }
}

const PROJECTION = /\b(nếu|giả sử|ước tính|dự kiến|kỳ vọng|sẽ vượt|có thể đạt)\b/i

/** Đổi chuỗi tiền ("~100 triệu VND/tháng", "1,5 tỷ", "793.000", "120M") thành VND; không có số → null. Thuần. */
export function impactVnd(text: string): number | null {
  const m = /(\d[\d.,]*)\s*(tỷ|ty|triệu|tr|m|nghìn|ngàn|k)?/i.exec(text)
  if (!m) return null
  let raw = m[1].replace(/[.,]+$/, "")
  const hasDot = raw.includes("."), hasComma = raw.includes(",")
  if (hasDot && hasComma) raw = raw.replace(/[.]/g, "").replace(",", ".")
  else if (hasComma) raw = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "")
  else if (hasDot) raw = /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/[.]/g, "") : raw
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return null
  const unit = (m[2] ?? "").toLowerCase()
  const mult = unit === "tỷ" || unit === "ty" ? 1e9 : unit === "triệu" || unit === "tr" || unit === "m" ? 1e6 : unit === "nghìn" || unit === "ngàn" || unit === "k" ? 1e3 : 1
  return Math.round(n * mult)
}

/** Lấy một mục "## <tiêu đề>" (không gồm dòng tiêu đề) của file markdown, tới mục "##" kế tiếp. Không thấy → "". Thuần. */
export function sectionOf(md: string, heading: string): string {
  const lines = md.split("\n"), want = heading.trim().toLowerCase()
  const isH2 = (l: string) => /^##\s/.test(l)
  const i = lines.findIndex(l => isH2(l) && l.replace(/^##\s*/, "").trim().toLowerCase().startsWith(want))
  if (i < 0) return ""
  const out: string[] = []
  for (let j = i + 1; j < lines.length && !isH2(lines[j]); j++) out.push(lines[j])
  return out.join("\n").trim()
}

/** Lượt tuần tra đầy đủ (câu lệnh đêm) — phải ghi lại notes/*. Thuần. */
export function isNightlyPatrolPrompt(prompt: string): boolean {
  return prompt.includes("GHI ĐÈ notes/tac-dong.md")
}

const NL = "\n"
export const REPAIR_PREFIX = "🔧 Sửa đề xuất"
export const isRepairPrompt = (prompt: string) => prompt.startsWith(REPAIR_PREFIX)

export function buildRepairPrompt(issues: string[], date: string): string {
  return `${REPAIR_PREFIX} ${date}: Mục "## Đề xuất hôm nay" trong notes/tac-dong.md chưa đạt bộ kiểm (hoặc thiếu hẳn mục này):
${issues.map(i => `- ${i}`).join(NL)}

Đọc notes/tac-dong.md rồi GHI ĐÈ lại chính file đó, giữ nguyên hai mục "Tác động tới kế hoạch" và "Mâu thuẫn và mức ảnh hưởng", chỉ sửa mục Đề xuất cho đạt: (1) mỗi đề xuất có dòng "- Ảnh hưởng: <số tiền VND mỗi tháng hoặc quý, nêu cách tính, hoặc chưa lượng hoá được>" — cần số thì lấy bằng sql/layDuLieuHeThong, không bịa; (2) xếp việc có ảnh hưởng tiền lớn nhất lên đầu, bỏ việc dưới khoảng 5 triệu VND mỗi tháng trừ khi là rủi ro an toàn/pháp lý/mất dịch vụ; (3) nhãn "Chắc" chỉ khi mọi số đã đo; câu có "nếu/sẽ/ước tính" thì đổi nhãn thành "Có thể" và ghi rõ giả định. Sau đó GHI ĐÈ notes/tin-hom-nay.md (tối đa 10 dòng) cho khớp. Không hỏi lại.`
}
