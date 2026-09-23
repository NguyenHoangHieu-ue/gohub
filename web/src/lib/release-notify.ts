// Tóm tắt commit message (đã viết chi tiết kỹ thuật theo rule CLAUDE.md) thành 1 thông báo ngắn,
// dễ đọc cho nhân viên không rành kỹ thuật — gửi vào group Lark "kênh thông báo tính năng mới"
// (app_settings.lark_release_chat_id) mỗi khi có commit merge lên `main`. Cùng pattern
// weekly-report/narrative.ts: Gemini CHỈ diễn giải lại nội dung đã có, không tự bịa thêm.
import { GoogleGenerativeAI } from "@google/generative-ai"
import { tabsForFiles } from "@/lib/release-tabs"
import { GEMINI_MODEL } from "@/lib/ai-models"

/** `files`: các file commit đã đổi (workflow gửi lên) — dùng để suy ra TAB bị ảnh hưởng, không nhờ Gemini đoán. */
export interface ReleaseCommit { sha: string; message: string; files?: string[] }

const SYSTEM_PROMPT = `Bạn viết thông báo ngắn gọn cho nhân viên công ty GoHub (dịch vụ SIM/eSIM du lịch) biết
hệ thống nội bộ GoHub Intel vừa có cập nhật mới lên production.
Đầu vào là danh sách commit message kỹ thuật (tiếng Việt, có thể dài, chứa mã session/số dòng/tên file/thuật ngữ code).
Nhiệm vụ: đọc hiểu Ý NGHĨA NGHIỆP VỤ của từng commit rồi viết lại thành thông báo ngắn cho người KHÔNG rành kỹ thuật:
- Bỏ hoàn toàn: mã session (s123, s198+11...), tên file/hàm/route, số dòng, thuật ngữ code (SQL/cache key/migration...).
- Gộp các commit cùng chủ đề thành 1 dòng, bỏ commit thuần dọn dẹp/refactor không ảnh hưởng người dùng.
- BỎ HẲN, không nhắc tới dù chỉ 1 chữ: cập nhật/đồng bộ wiki hoặc tài liệu nội bộ (CLAUDE.md, docs/wiki/*,
  session_summary...) — kể cả khi nằm CHUNG 1 commit với thay đổi khác, chỉ lấy phần code/tính năng thật.
- BỎ HẲN thay đổi nhỏ nhặt không ai cần biết: sửa chính tả/dịch thuật 1 chữ, đổi tên biến, format lại code,
  thêm/bớt 1 dòng comment, gộp code trùng lặp không đổi hành vi, bump version thư viện không đổi tính năng.
- Mỗi commit có thể có dòng đầu "[Tab: ...]" — đó là TÊN TAB trên web bị ảnh hưởng (do hệ thống xác định, chính xác).
  Khi viết dòng thông báo cho commit đó, NÊU TÊN TAB (giữ nguyên chữ, đặt ngay đầu dòng dạng "Tên tab: nội dung").
  Gộp nhiều commit cùng tab thành 1 dòng. Commit không có "[Tab: ...]" thì không cần nêu tab.
- Mỗi dòng bắt đầu bằng "• ", tối đa 6 dòng, mỗi dòng dưới 20 từ, tiếng Việt tự nhiên.
- Nếu SAU KHI lọc không còn gì đáng thông báo (toàn commit kỹ thuật thuần/docs/nhỏ nhặt) → trả đúng chuỗi
  rỗng "" — THÀ bỏ sót còn hơn báo phiền những thứ không ai cần biết.
- Đây là tin nhắn Lark dạng TEXT THUẦN — không dùng markdown (không **, không #, không link []()).
Trả về CHỈ nội dung thông báo (các dòng "• ..."), không thêm lời dẫn/kết luận nào khác.`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

/** Tên tab bị ảnh hưởng của cả nhóm commit (không trùng, giữ thứ tự). */
export function tabsOfCommits(commits: ReleaseCommit[], max = 6): string[] {
  return tabsForFiles(commits.flatMap(c => c.files ?? []), max)
}

/** Ghép dòng "📍 Tab: ..." (xác định bằng đường dẫn file) vào cuối bản tóm tắt — đảm bảo luôn có tên tab dù Gemini bỏ sót. */
export function withTabsFooter(summary: string, commits: ReleaseCommit[]): string {
  if (!summary.trim()) return summary
  const tabs = tabsOfCommits(commits)
  return tabs.length ? `${summary}\n📍 Tab: ${tabs.join(", ")}` : summary
}

function fallbackSummary(commits: ReleaseCommit[]): string {
  return commits.slice(0, 6).map(c => {
    const tabs = tabsForFiles(c.files, 3)
    return `• ${tabs.length ? `${tabs.join(", ")}: ` : ""}${c.message.split("\n")[0].slice(0, 100)}`
  }).join("\n")
}

export async function summarizeReleaseCommits(commits: ReleaseCommit[]): Promise<string> {
  if (commits.length === 0) return ""
  if (!process.env.GEMINI_KEY) return fallbackSummary(commits)

  try {
    const model = getAI().getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      // SDK v0.21.0 chưa có type cho thinkingConfig (ra đời sau SDK) → "as any" (cùng pattern be-gau.ts).
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: "low" },
      } as any,
    })
    const input = commits.slice(0, 30).map(c => {
      const tabs = tabsForFiles(c.files, 4)
      return tabs.length ? `[Tab: ${tabs.join(", ")}]\n${c.message}` : c.message
    }).join("\n---\n")
    const result = await model.generateContent(input)
    return result.response.text().trim()
  } catch {
    return fallbackSummary(commits)
  }
}
