// Memo ngắn hạn TRONG instance cho dữ liệu cấu hình nhỏ, đọc ở MỌI request (settings/quyền/partner tiers...).
// Vì sao: Supabase từ vùng chạy function (iad1) tốn ~300-450ms/lần đọc (đo s203) — route có 2-5 lần đọc
// cấu hình nối tiếp thì riêng phần này đã 1-2s dù data không hề đổi. TTL ngắn (giây) → cấu hình vừa sửa
// hiện ra trong tối đa TTL ở instance khác; instance vừa ghi gọi `memoInvalidate` để thấy ngay.
// Request đồng thời cùng key dùng chung 1 lần gọi (in-flight dedupe). Lỗi KHÔNG được cache.

const store = new Map<string, { v: unknown; exp: number }>()
const inflight = new Map<string, Promise<unknown>>()

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.v as T)
  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running
  const p = fn()
    .then(v => { store.set(key, { v, exp: Date.now() + ttlMs }); return v })
    .finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/** Xoá memo theo tiền tố key (hoặc toàn bộ nếu không truyền) — gọi ngay sau khi route ghi cấu hình. */
export function memoInvalidate(prefix = ""): void {
  for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k)
}
