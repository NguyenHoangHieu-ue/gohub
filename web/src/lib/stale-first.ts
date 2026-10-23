// "Số cũ trước, số mới sau" (s240): lưu kết quả lần tải gần nhất của một khối dữ liệu nặng vào sessionStorage; lần mở sau hiện ngay bản
// này (trang vốn đã làm mờ khi đang tải) rồi thay bằng số mới khi về. Mọi thao tác ghi xoá toàn bộ (xem client-fetch-cache.ts).
const PREFIX = "gohub:sf:"
const MAX_AGE_MS = 30 * 60_000
const MAX_BYTES = 1_200_000
const MAX_KEYS = 8

interface Stored<T> { at: number; data: T }

export function readStale<T>(key: string, maxAgeMs = MAX_AGE_MS): { data: T; at: number } | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const v = JSON.parse(raw) as Stored<T>
    if (!v || typeof v.at !== "number" || Date.now() - v.at > maxAgeMs) { sessionStorage.removeItem(PREFIX + key); return null }
    return v
  } catch { return null }
}

export function writeStale<T>(key: string, data: T): void {
  try {
    const raw = JSON.stringify({ at: Date.now(), data } satisfies Stored<T>)
    if (raw.length > MAX_BYTES) return
    sessionStorage.setItem(PREFIX + key, raw)
    // giữ tối đa MAX_KEYS khoá (xoá cũ nhất)
    const keys: { k: string; at: number }[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      try { keys.push({ k, at: (JSON.parse(sessionStorage.getItem(k) || "{}") as { at?: number }).at ?? 0 }) } catch { keys.push({ k, at: 0 }) }
    }
    keys.sort((a, b) => a.at - b.at)
    while (keys.length > MAX_KEYS) sessionStorage.removeItem(keys.shift()!.k)
  } catch { /* hết quota/bị chặn thì bỏ */ }
}
