// Chặn lộ tên bảng/cột trong câu trả lời Bé Gấu (eval U1b: "(`staff_code`)", "(`ref_countries`)" lọt dù prompt cấm).
// Xoá đoạn code nội dòng dạng snake_case (kèm cặp ngoặc bao quanh nếu có). KHÔNG đụng khối ``` (khối export có SQL thật).

const IDENT_SPAN = /\s?\(?`[a-z][a-z0-9]*_[a-z0-9_]*(?:\.[a-z0-9_]+)?`\)?/g

export function scrubLeaks(text: string): string {
  return text.split(/(```[\s\S]*?(?:```|$))/).map(part => part.startsWith("```") ? part : part.replace(IDENT_SPAN, "")).join("")
}

/** Vị trí cắt an toàn: phần sau có thể còn là 1 đoạn `...` chưa đóng hoặc dấu ``` đang gõ dở. */
function stableEnd(raw: string): number {
  // Dấu ` cuối chuỗi: có thể là đóng đoạn code (chờ ")" theo sau) hoặc ``` đang gõ dở → giữ lại, xét phần trước nó.
  let end = raw.length - (raw.match(/`+$/)?.[0].length ?? 0)
  let inFence = false, open = -1
  for (let i = 0; i < end; i++) {
    if (raw.startsWith("```", i)) { inFence = !inFence; open = -1; i += 2; continue }
    if (!inFence && raw[i] === "`") open = open === -1 ? i : -1
  }
  if (open !== -1) end = open
  // " (" ngay trước chỗ cắt có thể bị xoá cùng đoạn code → giữ lại chờ.
  if (end > 0 && raw[end - 1] === "(") end--
  if (end > 0 && /\s/.test(raw[end - 1])) end--
  return end
}

/** Bọc onChunk: chỉ đẩy ra phần đã chắc chắn, đã lọc. flush() đẩy nốt phần còn lại khi xong. */
export function leakFilterStream(emit: (s: string) => void) {
  let raw = "", sent = 0
  const out = (upto: number) => {
    const clean = scrubLeaks(raw.slice(0, upto))
    if (clean.length > sent) { emit(clean.slice(sent)); sent = clean.length }
  }
  return {
    push(chunk: string) { raw += chunk; out(stableEnd(raw)) },
    flush() { out(raw.length) },
  }
}
