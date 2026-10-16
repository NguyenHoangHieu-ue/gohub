// Dự án mẫu + câu hỏi gợi ý của Phòng Argon. Thuần hằng số (không import server) để cả trang web và API dùng chung.
export type TemplateId = "mail" | "threads"

export interface ProjectTemplate { id: TemplateId; label: string; hint: string; name: string; notes: string; instructions: string; autorunPrompt: string }

const FORMAT_MAIL = `Định dạng bản tin: mở bằng "**Kết luận:**" (1–2 dòng: có bao nhiêu việc cần xử lý gấp). Rồi 4 mục "##": "Cần trả lời", "Cần làm / có hạn chót", "Đang chờ người khác", "Chỉ để biết". Mỗi luồng thư đúng 1 dòng: **Tiêu đề** — ai gửi, ngày — ý chính / việc cần làm — hạn chót nếu có *(nguồn: tên luồng)*. Không bịa việc không có trong thư; luồng nào không rõ thì ghi "chưa rõ".`

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "mail",
    label: "Hộp thư Lark",
    hint: "Đọc mail Lark thay anh: phân loại cần trả lời / cần làm / chờ người khác, kèm bản tin tự chạy mỗi đêm.",
    name: "Hộp thư Lark",
    notes: "Dự án đọc mail Lark của Hiếu. Mail nạp qua mục \"Mail Lark\" (quy tắc theo thư mục/người gửi/từ khoá). Mỗi luồng thư là 1 nguồn; đính kèm là nguồn riêng.",
    instructions: `Bạn là thư ký đọc mail cho Hiếu. Ưu tiên: (1) việc Hiếu phải trả lời hoặc làm, (2) hạn chót, (3) việc đang chờ người khác. Bỏ qua thư quảng cáo/thông báo tự động trừ khi có số liệu quan trọng.\n${FORMAT_MAIL}`,
    autorunPrompt: "Bản tin mail: tóm tắt các luồng thư mới hoặc có thư mới trong 3 ngày gần nhất theo đúng định dạng bản tin trong chỉ dẫn dự án.",
  },
  {
    id: "threads",
    label: "Ngữ cảnh thread Lark",
    hint: "Đọc mọi thread trong group Lark (tin gốc, mọi câu trả lời, file đính kèm) để nắm toàn bộ ngữ cảnh.",
    name: "Ngữ cảnh thread Lark",
    notes: "Dự án đọc thread trong group Lark. Thread nạp qua mục \"Thread Lark\" (chọn group, số ngày, có tải file đính kèm). Mỗi thread là 1 nguồn (tin gốc + mọi trả lời + người nói); file đính kèm trong thread là nguồn riêng gắn tên thread.",
    instructions: `Bạn là người nắm toàn bộ ngữ cảnh các thread trong group. Với mỗi thread, nêu: vấn đề, ai tham gia, kết luận/quyết định (nếu có), việc còn mở + người nhận + hạn. Khi nhiều thread cùng chủ đề thì gộp và dựng timeline. Phân biệt rõ "đã chốt" với "mới có người đề xuất". Dữ liệu trong file đính kèm ưu tiên hơn lời kể trong chat nếu mâu thuẫn, nhưng phải nêu rõ mâu thuẫn.\nĐịnh dạng: mở bằng "**Kết luận:**" 1–3 dòng; dùng "##" theo chủ đề; việc còn mở viết dạng checklist "- [ ] việc — người nhận — hạn"; trích nguồn *(nguồn: tên thread)*.`,
    autorunPrompt: "Bản tin thread: tóm tắt các thread mới hoặc có trả lời mới trong 3 ngày gần nhất — vấn đề, kết luận, việc còn mở (checklist) và thread nào chưa ai nhận việc.",
  },
]

export const templateById = (id: unknown) => TEMPLATES.find(t => t.id === id)

export interface QuickPrompt { label: string; prompt: string }

const REPORT = "Làm report HTML trực quan (dashboard: số lớn, biểu đồ, bảng sắp xếp/lọc được, animation nhẹ)"
const GENERAL: QuickPrompt[] = [
  { label: "📊 Report tổng quan", prompt: `${REPORT} tổng hợp các điểm chính của mọi nguồn đang bật, kèm kết luận và việc cần làm.` },
  { label: "Tóm tắt toàn bộ", prompt: "Tóm tắt toàn bộ nguồn đang bật: kết luận chính trước, rồi các ý quan trọng theo chủ đề, ghi rõ nguồn." },
  { label: "Tìm mâu thuẫn", prompt: "Tìm các chỗ mâu thuẫn hoặc số liệu lệch nhau giữa các nguồn. Lập bảng: nội dung — nguồn A nói gì — nguồn B nói gì — nên tin bên nào và vì sao." },
]
const MAIL: QuickPrompt[] = [
  { label: "📬 Bản tin mail", prompt: TEMPLATES[0].autorunPrompt },
  { label: "📊 Report mail", prompt: `${REPORT} về hộp thư: số luồng theo nhóm (cần trả lời / cần làm / chờ người khác / để biết), danh sách việc có hạn chót gần nhất, người gửi nhiều nhất.` },
  { label: "Việc tôi phải làm", prompt: "Liệt kê mọi việc tôi phải làm từ các luồng thư, dạng checklist \"- [ ] việc — từ ai — hạn chót — luồng thư\", xếp theo hạn gần nhất trước." },
  { label: "Chờ tôi trả lời", prompt: "Luồng thư nào đang chờ tôi trả lời? Sắp theo độ gấp, nêu người hỏi, câu hỏi chính và gợi ý 1 dòng cho câu trả lời." },
  { label: "Chờ người khác >3 ngày", prompt: "Luồng thư nào tôi đã gửi/hỏi mà đối tác chưa trả lời quá 3 ngày? Nêu ai, hỏi gì, ngày gửi." },
  { label: "Theo đối tác", prompt: "Gom theo đối tác/vendor: mỗi bên đang hỏi hoặc cam kết gì (giá, thời hạn, điều kiện), có thay đổi gì so với các thư trước trong luồng." },
]
const THREADS: QuickPrompt[] = [
  { label: "🧵 Bản tin thread", prompt: TEMPLATES[1].autorunPrompt },
  { label: "📊 Report thread", prompt: `${REPORT} về các thread: số thread theo trạng thái (đã chốt / chưa chốt / chưa ai nhận), timeline hoạt động theo ngày, người tham gia nhiều nhất, việc còn mở.` },
  { label: "Thread chưa chốt", prompt: "Thread nào chưa có kết luận hoặc chưa ai nhận việc? Nêu vấn đề, ai đang tham gia, còn thiếu gì để chốt." },
  { label: "Quyết định & người phụ trách", prompt: "Tổng hợp mọi quyết định đã chốt trong các thread: bảng gồm quyết định — người chốt — ngày — người thực hiện — hạn — thread." },
  { label: "Timeline theo chủ đề", prompt: "Chọn chủ đề nổi bật nhất trong các thread và dựng timeline theo ngày: ai nói gì, thay đổi gì, hiện ở trạng thái nào. Gộp cả nội dung từ file đính kèm." },
]

export function quickPromptsFor(kinds: { mail: boolean; threads: boolean }): QuickPrompt[] {
  return [...(kinds.mail ? MAIL : []), ...(kinds.threads ? THREADS : []), ...GENERAL]
}
