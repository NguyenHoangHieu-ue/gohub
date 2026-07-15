import { tursoConfigured, tursoQuery } from "@/lib/turso"

export interface TursoLeadsBreakdown {
  total: Record<string, number>
  channels: { label: string; byMonth: Record<string, number> }[]
}

const INCLUDED_STATUSES = [
  "1. New Lead",
  "1.1 New Lead EC",
  "2. Sales Consulting",
  "3. Waiting Payment",
  "Waiting Payment",
  "Need Sales Follow-up",
  "4a.Purchased",
]

const TRACKED_CHANNELS = ["Live Chat", "Whatsapp", "Zalo", "Facebook", "Instagram"]

export function tursoLeadsConfigured(): boolean {
  return tursoConfigured()
}

export async function tursoLeadsBreakdown(months: string[]): Promise<TursoLeadsBreakdown> {
  const total = Object.fromEntries(months.map(month => [month, 0])) as Record<string, number>
  const channelMap = Object.fromEntries(
    TRACKED_CHANNELS.map(label => [label, Object.fromEntries(months.map(month => [month, 0])) as Record<string, number>]),
  ) as Record<string, Record<string, number>>

  if (!tursoConfigured() || months.length === 0) return { total, channels: [] }

  const startAt = `${months[0]}-01T00:00:00.000Z`
  const placeholders = INCLUDED_STATUSES.map(() => "?").join(", ")

  const rows = await tursoQuery<{ month: string; channel: string; leads: number | string }>(
    `WITH first_inbound AS (
       SELECT identity_id, MIN(timestamp) AS first_message_at
       FROM messages
       WHERE timestamp >= ?
         AND direction = 'inbound'
       GROUP BY identity_id
     ),
     lead_rows AS (
       SELECT substr(f.first_message_at, 1, 7) AS month,
              CASE
                WHEN lower(coalesce(g.name, c.type, '')) LIKE '%whatsapp%' THEN 'Whatsapp'
                WHEN lower(coalesce(g.name, c.type, '')) LIKE '%zalo%' THEN 'Zalo'
                WHEN lower(coalesce(g.name, c.type, '')) LIKE '%instagram%' THEN 'Instagram'
                WHEN lower(coalesce(g.name, c.type, '')) LIKE '%facebook%'
                  OR lower(coalesce(g.name, c.type, '')) LIKE '%messenger%' THEN 'Facebook'
                WHEN lower(coalesce(g.name, c.type, '')) LIKE '%live chat%'
                  OR lower(coalesce(g.name, c.type, '')) LIKE '%web%' THEN 'Live Chat'
                ELSE coalesce(g.name, c.type, 'Unknown')
              END AS channel,
              i.id AS identity_id
       FROM first_inbound f
       JOIN identities i ON i.id = f.identity_id
       LEFT JOIN conversation_statuses s ON s.id = i.custom_status_id
       LEFT JOIN channels c ON c.id = i.channel_id
       LEFT JOIN channel_groups g ON g.id = c.group_id
       WHERE s.name IN (${placeholders})
     )
     SELECT month, channel, COUNT(DISTINCT identity_id) AS leads
     FROM lead_rows
     WHERE month IN (${months.map(() => "?").join(", ")})
       AND channel IN (${TRACKED_CHANNELS.map(() => "?").join(", ")})
     GROUP BY month, channel
     ORDER BY month, channel`,
    [startAt, ...INCLUDED_STATUSES, ...months, ...TRACKED_CHANNELS],
  )

  for (const row of rows) {
    if (!months.includes(row.month) || !TRACKED_CHANNELS.includes(row.channel)) continue
    const count = Number(row.leads) || 0
    total[row.month] = (total[row.month] ?? 0) + count
    channelMap[row.channel][row.month] = count
  }

  return {
    total,
    channels: TRACKED_CHANNELS.map(label => ({ label, byMonth: channelMap[label] })),
  }
}
