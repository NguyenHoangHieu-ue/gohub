export type NoticeKind = "Báo cáo" | "Cảnh báo" | "Xong việc" | "Cần duyệt" | "Cần trả lời" | "Nhắc việc" | "Tin"
export type NoticePriority = "high" | "normal" | "low"

export interface Notice {
  kind: NoticeKind
  /** Phần hệ thống gửi: "Gấu Pro", "Argon", "My Metrics"... */
  source: string
  title: string
  body?: string
  link?: { label: string; url: string }
  /** low = gom lại nếu rơi vào giờ yên lặng; high/normal gửi ngay. Mặc định normal. */
  priority?: NoticePriority
}

const ICON: Record<NoticeKind, string> = {
  "Báo cáo": "📊", "Cảnh báo": "⚠️", "Xong việc": "✅", "Cần duyệt": "📝", "Cần trả lời": "❓", "Nhắc việc": "⏰", "Tin": "🔔",
}

export const QUIET_FROM_HOUR = 22
export const QUIET_TO_HOUR = 7

const vn = (now: number) => new Date(now + 7 * 3_600_000)

/** "26/10" theo giờ VN. */
export const vnDay = (now: number) => { const d = vn(now); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}` }

/** 22:00–07:00 giờ VN. */
export function isQuietHour(now: number): boolean {
  const h = vn(now).getUTCHours()
  return h >= QUIET_FROM_HOUR || h < QUIET_TO_HOUR
}

/** Đầu tin chuẩn `{icon} [Loại · Nguồn] Tiêu đề — dd/MM`, rồi nội dung, rồi link. */
export function formatNotice(n: Notice, now = Date.now()): string {
  const head = `${ICON[n.kind]} [${n.kind} · ${n.source}] ${n.title.replace(/\s+/g, " ").trim()} — ${vnDay(now)}`
  const parts = [head]
  if (n.body?.trim()) parts.push(n.body.trim())
  if (n.link?.url) parts.push(`${n.link.label}: ${n.link.url}`)
  return parts.join("\n\n")
}

export interface QueuedNotice { to: string; text: string; at: number }

/** Gom hàng đợi theo người nhận: 1 tin giữ nguyên, nhiều tin → một tin "Tin gom". */
export function mergeQueued(queue: QueuedNotice[], now = Date.now()): { to: string; text: string }[] {
  const byTo = new Map<string, QueuedNotice[]>()
  for (const q of queue) byTo.set(q.to, [...(byTo.get(q.to) ?? []), q])
  return Array.from(byTo, ([to, items]) => {
    const sorted = [...items].sort((a, b) => a.at - b.at)
    if (sorted.length === 1) return { to, text: sorted[0].text }
    const head = `🔔 [Tin gom · Hệ thống] ${sorted.length} tin trong giờ yên lặng — ${vnDay(now)}`
    return { to, text: [head, ...sorted.map(s => s.text)].join("\n\n———\n\n") }
  })
}
