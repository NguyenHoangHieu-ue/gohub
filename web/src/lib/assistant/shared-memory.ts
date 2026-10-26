import { buildMemoryBlock } from "@/lib/assistant-memory"
import { isMemoryOff } from "@/lib/assistant-memory-rights"

// P3c — MỘT trí nhớ: Argon đọc cùng trí nhớ dài hạn (`assistant_memory`) mà Gấu Pro/Bé Gấu dùng, nên hai chế độ biết cùng một người dùng
// (hồ sơ, sở thích, dự án, người liên quan, quyết định đã chốt). Argon CHỈ ĐỌC — không có công cụ ghi (đọc mail/thread của người ngoài nên
// không được tự ghi trí nhớ: chống tiêm chỉ dẫn). Người dùng tắt trí nhớ (quyền ở panel Trí nhớ) thì Argon cũng không đọc. Lỗi → "" (không chặn lượt chạy).
export async function sharedMemoryBlockFor(username: string, prompt?: string): Promise<string> {
  if (!username) return ""
  try {
    if (await isMemoryOff(username)) return ""
    return await buildMemoryBlock(username, prompt, { readOnly: true })
  } catch { return "" }
}
