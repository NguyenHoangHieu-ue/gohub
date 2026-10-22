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
- Nguồn: <tên nguồn, tên nguồn>
- Liên quan kế hoạch: <mục trong brief.md, hoặc "ngoài kế hoạch">
Không đủ căn cứ thì ghi "Chưa có đề xuất đủ căn cứ hôm nay." thay vì cố nghĩ ra. Không lặp lại đề xuất cũ nếu tình hình không đổi.
5) GHI ĐÈ notes/tin-hom-nay.md: bản tin tối đa 10 dòng rút từ hai file trên.
Quy tắc: không phóng đại, không đoán; mọi ý phải có nguồn thật trong Kho hoặc số liệu hệ thống; thiếu dữ liệu thì nói thẳng và đánh "Chưa đủ dữ liệu"; không hỏi lại (không ai trả lời lúc này).`

export interface ProposalAudit { total: number; ok: number; issues: string[]; empty: boolean }
const LABEL = /(Chắc chắn|Chắc|Có thể|Chưa đủ dữ liệu)\s*\**\s*$/i

/** Kiểm các đề xuất trong tac-dong.md: mỗi "### n." phải có nhãn chắc chắn, dòng "Nguồn:" có nội dung và dòng "Liên quan kế hoạch:". Thuần. */
export function auditProposals(md: string): ProposalAudit {
  const sec = /^##\s*Đề xuất[^\n]*\n([\s\S]*?)(?=^##\s[^#]|$(?![\s\S]))/m.exec(md)
  const body = sec?.[1] ?? ""
  const items = body.split(/^###\s+/m).slice(1)
  if (!items.length) return { total: 0, ok: 0, issues: [], empty: true }
  const issues: string[] = []
  let ok = 0
  items.forEach((it, i) => {
    const head = it.split("\n")[0].trim()
    const miss: string[] = []
    if (!LABEL.test(head)) miss.push("thiếu nhãn Chắc / Có thể / Chưa đủ dữ liệu")
    const src = /^\s*-?\s*Nguồn\s*:\s*(.+)$/im.exec(it)
    if (!src || src[1].trim().length < 3) miss.push("thiếu nguồn")
    if (!/Liên quan kế hoạch\s*:\s*\S+/i.test(it)) miss.push("thiếu mục kế hoạch liên quan")
    if (miss.length) issues.push(`Đề xuất ${i + 1}: ${miss.join(", ")}`); else ok++
  })
  return { total: items.length, ok, issues, empty: false }
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
