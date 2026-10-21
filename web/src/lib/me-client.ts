// Dùng chung 1 lần gọi /api/user/me cho sidebar, top-bar, command-palette (trước đây mỗi nơi gọi riêng mỗi lần tải trang).
const TTL_MS = 30_000
let inflight: Promise<any> | null = null
let at = 0

export function fetchMe(): Promise<any> {
  if (inflight && Date.now() - at < TTL_MS) return inflight
  at = Date.now()
  inflight = fetch("/api/user/me", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
  return inflight
}
