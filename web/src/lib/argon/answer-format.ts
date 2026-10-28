// Chỉnh lại CÁCH HIỂN THỊ câu trả lời của Argon cho dễ đọc (không đổi nội dung; lưu/xuất vẫn dùng bản gốc). Thuần.
// Vấn đề thật: model hay dồn nhiều ý vào MỘT đoạn dài, các nhãn "**Bất thường:**", "**Việc cần anh:**" nằm chung dòng. Ở đây tách các nhãn đó thành dòng/đoạn riêng.
const LABELS = ["Kết luận", "Bất thường", "Việc cần anh", "Việc cần làm", "Đề xuất", "Nguyên nhân", "Rủi ro", "Lưu ý", "Gợi ý", "Tác động", "Tiếp theo", "Bước tiếp theo", "Tóm lại", "Cảnh báo"]
const LABEL_RE = new RegExp(`\\s+(\\*\\*(?:${LABELS.join("|")})\\s*:\\*\\*)`, "g")
const LONG = 260

/** Đoạn văn (không phải bảng/danh sách/mã/tiêu đề) dài và có ≥2 nhãn đậm → tách trước mỗi nhãn (trừ nhãn đầu đoạn). */
export function tidyAnswer(text: string): string {
  let inFence = false
  return text.split(/\n{2,}/).map(block => {
    const fences = (block.match(/```/g) ?? []).length
    const wasIn = inFence
    if (fences % 2 === 1) inFence = !inFence   // khối mã có thể trải qua nhiều đoạn (dòng trống bên trong)
    if (wasIn || fences > 0) return block
    if (/^\s*([#>|]|[-*+]\s|\d+[.)]\s)/.test(block) || block.length < LONG) return block
    const labels = block.match(LABEL_RE)
    if (!labels || labels.length < 1) return block
    return block.replace(LABEL_RE, "\n\n$1")
  }).join("\n\n")
}

/** Đoạn có nhãn nhấn mạnh ở đầu (Kết luận/Lưu ý…) chỉ được đóng khung khi NGẮN; đoạn dài hiển thị như văn bản thường để không thành "cục" màu. */
export const CALLOUT_MAX_CHARS = 320
