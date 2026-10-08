// Chuyển câu trả lời markdown thành văn bản để đọc to (TTS): bỏ khối code/chart/export, thay bảng bằng 1 câu, bỏ ký hiệu markdown.
export const SPEECH_MAX_CHARS = 2500

export function toSpeechText(md: string): string {
  const out = md
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .split("\n")
    .reduce<string[]>((acc, line) => {
      const isTable = /^\s*\|/.test(line)
      if (isTable) { if (acc[acc.length - 1] !== "(Bảng số liệu xem trên màn hình.)") acc.push("(Bảng số liệu xem trên màn hình.)") }
      else acc.push(line)
      return acc
    }, [])
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim()
  return out.length > SPEECH_MAX_CHARS ? out.slice(0, SPEECH_MAX_CHARS).replace(/\s+\S*$/, "") + "… Phần còn lại xem trên màn hình." : out
}
