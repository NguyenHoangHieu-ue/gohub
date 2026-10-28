// Vết chạy của các trợ lý. Trước đây ghi sự kiện (tên bước + thời gian) vào Turso cho trang "Bản đồ vận hành"; trang đó đã bỏ (không còn nơi nào đọc sự kiện) nên bộ ghi này là NO-OP:
// giữ nguyên giao diện createRunTrace/RunTrace để các vòng lặp agent (Bé Gấu, Gấu Pro, Gấu Prime) không phải đổi, nhưng không còn ghi gì ra ngoài và không tốn lượt ghi Turso.
// Bảng cũ `agent_events` trong Turso `argon-hub` không còn được dùng (có thể xoá tay).
export type AgentId = "be-gau" | "gau-pro" | "argon"
export type AgentEventKind = "start" | "model" | "tool-start" | "tool" | "end"

export interface RunTrace { run: string; emit: (kind: AgentEventKind, name?: string, extra?: { ms?: number; ok?: boolean }) => void; flush: () => Promise<void> }

export function createRunTrace(_agent: AgentId, run: string = crypto.randomUUID()): RunTrace {
  return { run, emit() { /* không ghi */ }, async flush() { /* không có gì để ghi */ } }
}
