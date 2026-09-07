import { chromium } from "playwright-core"

const MAX_CONTENT_CHARS = 15000 // khớp cắt nội dung của browsePortal (portal.ts)
const MAX_ACTIONS = 8
const NAV_TIMEOUT_MS = 20000
const OVERALL_TIMEOUT_MS = 25000

export interface BrowserAction {
  type:      "click" | "fill" | "scroll" | "wait"
  selector?: string
  value?:    string
  ms?:       number
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms)),
  ])
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

export async function runBrowseWeb(args: {
  url: string
  actions?: BrowserAction[]
  wait_ms?: number
}): Promise<{ title?: string; content?: string; action_log?: string[]; error?: string }> {
  const wsUrl = process.env.BROWSERLESS_WS_URL
  const token = process.env.BROWSERLESS_TOKEN
  if (!wsUrl || !token) {
    return { error: "BROWSERLESS_WS_URL/BROWSERLESS_TOKEN chưa cấu hình. Hiếu cần dựng browserless container + set 2 env trên Vercel." }
  }
  if (!args.url) return { error: "Thiếu url." }

  const sep = wsUrl.includes("?") ? "&" : "?"
  const endpoint = `${wsUrl}${sep}token=${encodeURIComponent(token)}`

  let browser: any = null
  try {
    return await withTimeout((async () => {
      browser = await chromium.connectOverCDP(endpoint)
      const page = await browser.newPage()
      await page.goto(args.url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS })

      let action_log: string[] | undefined
      if (args.actions?.length) action_log = await runActions(page, args.actions)
      if (args.wait_ms) await page.waitForTimeout(Math.min(args.wait_ms, 5000))

      const title = await page.title()
      const text  = await page.innerText("body")
      return { title, content: text.slice(0, MAX_CONTENT_CHARS), action_log }
    })(), OVERALL_TIMEOUT_MS, "browseWeb")
  } catch (e: any) {
    return { error: e.message }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
