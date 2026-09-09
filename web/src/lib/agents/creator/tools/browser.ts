import { chromium } from "playwright-core"

const SINGLE_PAGE_CHARS = 15000  // khớp cắt nội dung của browsePortal (portal.ts) — mode 1 trang, giữ như cũ
const MULTI_PAGE_CHARS  = 8000   // cắt mỗi trang khi gộp nhiều trang (urls[]/click_next/infinite_scroll)
const TOTAL_CONTENT_CHARS = 60000 // trần tổng toàn bộ nội dung gộp, tránh 1 lần gọi quá nặng
const MAX_ACTIONS = 8
const MAX_URLS = 20
const MAX_PAGES = 20
const MAX_SCROLLS = 20
const NAV_TIMEOUT_MS = 20000

export interface BrowserAction {
  type:      "click" | "fill" | "scroll" | "wait"
  selector?: string
  value?:    string
  ms?:       number
}

export interface PaginationOpts {
  mode:             "click_next" | "infinite_scroll"
  next_selector?:   string  // bắt buộc cho click_next
  max_pages?:       number  // click_next, mặc định 5, tối đa 20
  max_scrolls?:     number  // infinite_scroll, mặc định 6, tối đa 20
  scroll_pause_ms?: number  // infinite_scroll, mặc định 1500, tối đa 5000
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms)),
  ])
}

// Timeout tổng co giãn theo số bước dự kiến (urls/pages/scrolls) — 1 bước ~8s bù mạng+render, trần 180s
// để còn dư thời gian cho phần hội thoại còn lại trong ngân sách maxDuration=300s của route Gấu Pro.
function computeOverallTimeout(steps: number): number {
  return Math.min(180000, 20000 + steps * 8000)
}

async function runActions(page: import("playwright-core").Page, actions: BrowserAction[]): Promise<string[]> {
  const log: string[] = []
  for (const a of actions.slice(0, MAX_ACTIONS)) {
    try {
      if (a.type === "click" && a.selector) {
        await page.click(a.selector, { timeout: 5000 })
        log.push(`click "${a.selector}" ok`)
      } else if (a.type === "fill" && a.selector) {
        await page.fill(a.selector, a.value || "", { timeout: 5000 })
        log.push(`fill "${a.selector}" ok`)
      } else if (a.type === "scroll") {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight))
        log.push("scroll ok")
      } else if (a.type === "wait") {
        await page.waitForTimeout(Math.min(a.ms || 1000, 5000))
        log.push(`wait ${a.ms || 1000}ms ok`)
      } else {
        log.push(`bỏ qua action không hợp lệ: ${JSON.stringify(a)}`)
      }
    } catch (e: any) {
      log.push(`lỗi action ${a.type} "${a.selector || ""}": ${e.message}`)
    }
  }
  return log
}

async function readPage(page: import("playwright-core").Page): Promise<{ title: string; text: string }> {
  const title = await page.title()
  const text  = await page.innerText("body")
  return { title, text }
}

export async function runBrowseWeb(args: {
  url?: string
  urls?: string[]
  actions?: BrowserAction[]
  wait_ms?: number
  pagination?: PaginationOpts
}): Promise<{ title?: string; content?: string; pages_fetched?: number; action_log?: string[]; error?: string }> {
  const wsUrl = process.env.BROWSERLESS_WS_URL
  const token = process.env.BROWSERLESS_TOKEN
  if (!wsUrl || !token) {
    return { error: "BROWSERLESS_WS_URL/BROWSERLESS_TOKEN chưa cấu hình. Hiếu cần dựng browserless container + set 2 env trên Vercel." }
  }

  const hasUrls = !!args.urls?.length
  const hasPagination = !!args.pagination
  if (!args.url && !hasUrls) return { error: "Thiếu url hoặc urls." }
  if (hasPagination && args.pagination!.mode === "click_next" && !args.pagination!.next_selector) {
    return { error: "pagination.mode=click_next cần next_selector." }
  }

  const steps = hasUrls
    ? Math.min(args.urls!.length, MAX_URLS)
    : hasPagination
      ? (args.pagination!.mode === "infinite_scroll"
          ? Math.min(args.pagination!.max_scrolls || 6, MAX_SCROLLS)
          : Math.min(args.pagination!.max_pages || 5, MAX_PAGES))
      : 1

  const sep = wsUrl.includes("?") ? "&" : "?"
  const endpoint = `${wsUrl}${sep}token=${encodeURIComponent(token)}`

  let browser: any = null
  try {
    return await withTimeout((async () => {
      browser = await chromium.connectOverCDP(endpoint)
      const page = await browser.newPage()

      // ── Mode: danh sách URL biết trước — mỗi URL độc lập, không áp actions ──────
      if (hasUrls) {
        const urls = args.urls!.slice(0, MAX_URLS)
        const parts: string[] = []
        let total = 0, fetched = 0
        for (const u of urls) {
          try {
            await page.goto(u, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS })
            const { title, text } = await readPage(page)
            const chunk = text.slice(0, MULTI_PAGE_CHARS)
            parts.push(`--- Trang ${fetched + 1}: ${u} (${title}) ---\n${chunk}`)
            total += chunk.length
          } catch (e: any) {
            parts.push(`--- Trang ${fetched + 1}: ${u} — LỖI: ${e.message} ---`)
          }
          fetched++
          if (total >= TOTAL_CONTENT_CHARS) break
        }
        return { content: parts.join("\n\n").slice(0, TOTAL_CONTENT_CHARS), pages_fetched: fetched }
      }

      // Điều hướng đầu tiên (dùng chung cho pagination + mode 1-trang cũ)
      await page.goto(args.url!, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS })
      let action_log: string[] | undefined
      if (args.actions?.length) action_log = await runActions(page, args.actions)
      if (args.wait_ms) await page.waitForTimeout(Math.min(args.wait_ms, 5000))

      // ── Mode: phân trang số — bấm Next lặp lại tới khi hết hoặc đủ max_pages ────
      if (hasPagination && args.pagination!.mode === "click_next") {
        const maxPages = Math.min(args.pagination!.max_pages || 5, MAX_PAGES)
        const selector = args.pagination!.next_selector!
        const parts: string[] = []
        let total = 0, fetched = 0
        for (let i = 0; i < maxPages; i++) {
          const { title, text } = await readPage(page)
          const chunk = text.slice(0, MULTI_PAGE_CHARS)
          parts.push(`--- Trang ${i + 1} (${title}) ---\n${chunk}`)
          total += chunk.length
          fetched++
          if (total >= TOTAL_CONTENT_CHARS || i === maxPages - 1) break
          try {
            await page.click(selector, { timeout: 5000 })
            await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {})
            await page.waitForTimeout(500)
          } catch {
            break // không còn nút/link Next (hoặc đã disabled) → coi như hết trang, không phải lỗi
          }
        }
        return { content: parts.join("\n\n").slice(0, TOTAL_CONTENT_CHARS), pages_fetched: fetched, action_log }
      }

      // ── Mode: cuộn vô hạn — cuộn tới đáy lặp lại tới khi nội dung hết phát triển ─
      if (hasPagination && args.pagination!.mode === "infinite_scroll") {
        const maxScrolls = Math.min(args.pagination!.max_scrolls || 6, MAX_SCROLLS)
        const pause = Math.min(args.pagination!.scroll_pause_ms || 1500, 5000)
        let lastLen = 0, scrolls = 0
        for (let i = 0; i < maxScrolls; i++) {
          const { text } = await readPage(page)
          if (i > 0 && text.length <= lastLen) break // cuộn thêm không ra nội dung mới → đã hết
          lastLen = text.length
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await page.waitForTimeout(pause)
          scrolls++
        }
        const { title, text } = await readPage(page)
        return { title, content: text.slice(0, TOTAL_CONTENT_CHARS), pages_fetched: scrolls || 1, action_log }
      }

      // ── Mode cũ: 1 trang (giữ nguyên hành vi/tương thích ngược) ─────────────────
      const { title, text } = await readPage(page)
      return { title, content: text.slice(0, SINGLE_PAGE_CHARS), action_log }
    })(), computeOverallTimeout(steps), "browseWeb")
  } catch (e: any) {
    return { error: e.message }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
