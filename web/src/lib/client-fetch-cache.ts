// Lớp fetch phía trình duyệt (s240): (1) dùng chung các request GET giống hệt đang chạy (vd quarterly-report bị 3 chỗ gọi cùng lúc),
// (2) giữ kết quả ngắn hạn trong bộ nhớ để quay lại tab/bộ lọc đã xem hiện ngay, (3) mọi thao tác GHI (POST/PUT/PATCH/DELETE) xoá sạch
// bộ nhớ này (và mọi tab khác của cùng trình duyệt) nên người vừa sửa target/chi phí không bao giờ thấy số cũ của chính mình.
// Chỉ áp cho GET /api/analytics/* và /api/config/* (trừ các đường dẫn cần luôn tươi). Không đụng stream/chat.

const TTL_MS = 60_000
const MAX_ENTRIES = 60
const MAX_BODY = 1_500_000
const SCOPE = /^\/api\/(analytics|config)\//
const NEVER = /^\/api\/analytics\/(my-metrics|track|usage-stats|db-status|health|data-health|data-freshness|perf-probe|perf-probe-report|perf-probe-sin|query)(\/|\?|$)/
const FRESH_PARAMS = /[?&](nocache|refresh|_t)=/

interface Entry { at: number; status: number; statusText: string; headers: [string, string][]; body: string }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<Entry>>()
let installed = false

export function cacheKeyFor(input: RequestInfo | URL, init?: RequestInit, origin = ""): string | null {
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase()
  if (method !== "GET") return null
  if (init?.headers || init?.cache === "no-store" || init?.cache === "reload") return null // header/cache riêng → không chia sẻ
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
  let path: string
  try { const u = new URL(raw, origin || "http://x"); if (origin && u.origin !== origin) return null; path = u.pathname + u.search } catch { return null }
  if (!SCOPE.test(path) || NEVER.test(path) || FRESH_PARAMS.test(path)) return null
  return path
}

const toResponse = (e: Entry) => new Response(e.body, { status: e.status, statusText: e.statusText, headers: e.headers })

function clearAll() {
  store.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith("gohub:sf:")) sessionStorage.removeItem(k)
    }
  } catch { /* sessionStorage chặn thì bỏ */ }
}

export function installFetchCache(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  const nativeFetch = window.fetch.bind(window)
  let bc: BroadcastChannel | null = null
  try { bc = new BroadcastChannel("gohub-fetch-cache"); bc.onmessage = () => clearAll() } catch { /* không hỗ trợ */ }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase()
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
    if (method !== "GET") {
      let path = ""
      try { path = new URL(raw, window.location.origin).pathname } catch { /* bỏ */ }
      const res = await nativeFetch(input, init)
      if (path.startsWith("/api/") && !/^\/api\/(auth|track|heartbeat)/.test(path)) { clearAll(); try { bc?.postMessage(1) } catch { /* bỏ */ } }
      return res
    }

    const key = cacheKeyFor(input, init, window.location.origin)
    if (!key) return nativeFetch(input, init)

    const hit = store.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return toResponse(hit)

    let p = inflight.get(key)
    if (!p) {
      // Request nền dùng chung KHÔNG gắn signal của người gọi (một người huỷ không được làm hỏng người khác)
      p = nativeFetch(input instanceof Request ? input.url : input).then(async (res) => {
        const body = await res.text()
        const e: Entry = { at: Date.now(), status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], body }
        if (res.ok && body.length <= MAX_BODY) {
          store.set(key, e)
          if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string)
        }
        return e
      }).finally(() => { inflight.delete(key) })
      inflight.set(key, p)
    }

    const signal = init?.signal
    if (!signal) return toResponse(await p)
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    return await new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"))
      signal.addEventListener("abort", onAbort, { once: true })
      p!.then(e => { signal.removeEventListener("abort", onAbort); resolve(toResponse(e)) }, err => { signal.removeEventListener("abort", onAbort); reject(err) })
    })
  }
}

/** Chỉ cho test: đặt lại trạng thái. */
export function _resetFetchCacheForTest() { store.clear(); inflight.clear(); installed = false }
