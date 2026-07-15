// Omni API — source for B2C leads when a Clerk/API bearer token is available.
// OMNI_WEBHOOK_SECRET verifies incoming webhook pushes only; it is not enough to
// read historical conversations. For reads, set OMNI_API_TOKEN to a Clerk JWT or
// service token accepted by omni.gohub.cloud API.

const BASE = (process.env.OMNI_API_BASE_URL || "https://omni.gohub.cloud").replace(/\/$/, "")
const TOKEN = process.env.OMNI_API_TOKEN || ""

const INCLUDED_STATUS = [
  "newlead",
  "newleadec",
  "salesconsulting",
  "waitingpayment",
  "needsalesfollowup",
  "purchased",
]

const EXCLUDED_STATUS = [
  "noneed",
  "handovertocs",
  "internalchecking",
  "orderissue",
  "resolved",
  "troubleshoot",
]

const CHANNEL_ORDER = ["Live Chat", "Zalo", "Facebook", "Instagram", "Whatsapp"]

export interface OmniLeadsBreakdown {
  total: Record<string, number>
  channels: { label: string; byMonth: Record<string, number> }[]
}

interface OmniConversation {
  id?: string
  identity_id?: string
  created_at?: string | number
  updated_at?: string | number
  last_message_at?: string | number
  status?: string
  custom_status_id?: string | null
  customStatus?: { id?: string; name?: string; color?: string } | null
  status_name?: string
  statusName?: string
  identity_status?: string
  source?: string
  channel_id?: string
  channel?: string
  channel_name?: string
  channelName?: string
  channel_group?: string
  channelGroup?: string
}

interface OmniStatus {
  id: string
  name: string
}

interface OmniChannelGroup {
  id: string
  name: string
}

interface OmniChannel {
  id: string
  name?: string
  type?: string
  group_id?: string | null
}

export function omniConfigured(): boolean {
  return !!TOKEN
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function statusName(row: OmniConversation, statusById: Map<string, string>): string {
  return String(
    row.customStatus?.name ??
    row.status_name ??
    row.statusName ??
    row.identity_status ??
    (row.custom_status_id ? statusById.get(row.custom_status_id) : "") ??
    row.status ??
    ""
  )
}

function isIncludedLead(row: OmniConversation, statusById: Map<string, string>): boolean {
  const key = normalize(statusName(row, statusById))
  if (!key) return false
  if (EXCLUDED_STATUS.some(s => key.includes(s))) return false
  return INCLUDED_STATUS.some(s => key.includes(s))
}

function channelName(row: OmniConversation, channelById: Map<string, string>): string | null {
  const raw = String(
    row.channel_group ??
    row.channelGroup ??
    (row.channel_id ? channelById.get(row.channel_id) : "") ??
    row.channel_name ??
    row.channelName ??
    row.source ??
    row.channel ??
    ""
  )
  const key = normalize(raw)
  if (key.includes("zalo")) return "Zalo"
  if (key.includes("facebook") || key.includes("messenger")) return "Facebook"
  if (key.includes("instagram")) return "Instagram"
  if (key.includes("whatsapp")) return "Whatsapp"
  if (key.includes("livechat") || key.includes("web")) return "Live Chat"
  return null
}

function toMonth(value: string | number | undefined): string | null {
  if (!value) return null
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

async function omniFetch<T>(path: string, authenticated = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authenticated ? { authorization: `Bearer ${TOKEN}` } : {},
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Omni ${path} ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchStatuses(): Promise<Map<string, string>> {
  const rows = await omniFetch<OmniStatus[]>("/api/statuses", false)
  return new Map(rows.map(row => [row.id, row.name]))
}

async function fetchChannelMap(): Promise<Map<string, string>> {
  const [channels, groups] = await Promise.all([
    omniFetch<OmniChannel[]>("/api/channels", true),
    omniFetch<OmniChannelGroup[]>("/api/channel_groups", false),
  ])
  const groupById = new Map(groups.map(group => [group.id, group.name]))
  return new Map(channels.map(channel => {
    const groupName = channel.group_id ? groupById.get(channel.group_id) : ""
    return [channel.id, groupName || channel.name || channel.type || ""]
  }))
}

async function fetchConversations(month: string, limit = 5000): Promise<OmniConversation[]> {
  const [year, monthNum] = month.split("-").map(Number)
  const since = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0)).toISOString()
  const until = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0) - 1).toISOString()
  const url = new URL(`${BASE}/api/conversations`)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("filter", "all")
  url.searchParams.set("label", "all")
  url.searchParams.set("status", "all")
  url.searchParams.set("channel", "all")
  url.searchParams.set("searchBy", "both")
  url.searchParams.set("since", since)
  url.searchParams.set("until", until)

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${TOKEN}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Omni conversations ${res.status}`)
  const body = await res.json()
  const rows = Array.isArray(body) ? body : body.data ?? body.items ?? body.conversations ?? []
  return rows as OmniConversation[]
}

export async function omniLeadsBreakdown(months: string[]): Promise<OmniLeadsBreakdown> {
  const total = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>
  const byChannel: Record<string, Record<string, number>> = {}
  for (const label of CHANNEL_ORDER) byChannel[label] = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>
  if (!omniConfigured() || months.length === 0) {
    return { total, channels: CHANNEL_ORDER.map(label => ({ label, byMonth: byChannel[label] })) }
  }

  const [statusById, channelById] = await Promise.all([fetchStatuses(), fetchChannelMap()])
  for (const month of months) {
    const rows = await fetchConversations(month)
    for (const row of rows) {
      const month = toMonth(row.created_at ?? row.last_message_at ?? row.updated_at)
      if (!month) continue
      if (total[month] === undefined || !isIncludedLead(row, statusById)) continue
      const channel = channelName(row, channelById)
      if (!channel || !byChannel[channel]) continue
      total[month] += 1
      byChannel[channel][month] += 1
    }
  }

  return {
    total,
    channels: CHANNEL_ORDER.map(label => ({ label, byMonth: byChannel[label] })),
  }
}
