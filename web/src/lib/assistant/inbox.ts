import { describeAction } from "@/lib/agents/creator/tool-policy"
import { listPendingChanges } from "@/lib/argon/facts"
import { listMissions } from "@/lib/argon/missions-db"
import { listMailThreads } from "@/lib/argon/mail-status"
import { listTickets } from "@/lib/dev-tickets"
import { FACT_TYPES, factLine } from "@/lib/argon/facts-pure"
import { threadLine } from "@/lib/argon/mail-status-pure"
import { sortInbox, urgencyFor, type InboxItem } from "./inbox-pure"

export * from "./inbox-pure"
const sb = async () => (await import("@/lib/supabase")).supabaseAdmin
const ARGON = "/analytics/creator/argon"

// Mỗi nguồn việc đọc độc lập; lỗi một nguồn KHÔNG làm mất cả danh sách (trả phần còn lại + tên nguồn lỗi).
async function gpActions(username: string, now: number): Promise<InboxItem[]> {
  const since = new Date(now - 24 * 3_600_000).toISOString()
  const { data, error } = await (await sb()).from("gp_pending_actions").select("id,code,tool,args,reason,created_at").eq("username", username).eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    key: `gp_action:${r.id}`, kind: "gp_action" as const, id: String(r.id), title: describeAction({ name: String(r.tool), args: r.args }), detail: String(r.reason ?? ""),
    at: String(r.created_at), urgency: urgencyFor("gp_action", String(r.created_at), now), source: "Gấu Pro", actions: ["approve", "reject"] as InboxItem["actions"], href: "/analytics/creator/ai",
  }))
}

async function argonItems(username: string, now: number): Promise<InboxItem[]> {
  const missions = await listMissions(username)
  if (!missions.length) return []
  const keys = missions.flatMap(m => [`argon_ask:${m.id}`, `argon_patches:${m.id}`])
  const { data, error } = await (await sb()).from("app_settings").select("key,value").in("key", keys)
  if (error) throw new Error(error.message)
  const byKey = new Map((data ?? []).map(r => [String(r.key), r.value]))
  const parse = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : v } catch { return null } }
  const out: InboxItem[] = []
  for (const m of missions) {
    const ask = parse(byKey.get(`argon_ask:${m.id}`)) as { question?: string; options?: string[]; at?: string } | null
    if (ask?.question) {
      const at = ask.at ?? new Date(now).toISOString()
      out.push({ key: `argon_ask:${m.id}`, kind: "argon_ask", id: m.id, title: ask.question, detail: (ask.options ?? []).map((o, i) => `${i + 1}. ${o}`).join(" · "), at, urgency: urgencyFor("argon_ask", at, now), source: `Argon · ${m.name}`, actions: ["open"], missionId: m.id, href: `${ARGON}/tro-ly` })
    }
    const patches = (parse(byKey.get(`argon_patches:${m.id}`)) ?? []) as { id: string; title: string; request?: string; at: string; status: string }[]
    for (const p of patches) if (p.status === "pending") out.push({
      key: `argon_patch:${p.id}`, kind: "argon_patch", id: p.id, title: p.title, detail: (p.request ?? "").slice(0, 300), at: p.at, urgency: urgencyFor("argon_patch", p.at, now),
      source: `Argon · ${m.name}`, actions: ["approve", "reject"], missionId: m.id,
    })
  }
  return out
}

async function factReviews(username: string, now: number): Promise<InboxItem[]> {
  return (await listPendingChanges(username)).map(f => ({
    key: `fact_review:${f.id}`, kind: "fact_review" as const, id: f.id, title: `${FACT_TYPES[f.type] ?? "Sự việc"}: ${[f.vendor, f.subject].filter(Boolean).join(" · ")}`.slice(0, 160),
    detail: f.change_note ? `${factLine(f)} — đổi: ${f.change_note}` : factLine(f), at: f.recorded_at, urgency: urgencyFor("fact_review", f.recorded_at, now), source: "Sổ sự việc", actions: ["confirm", "reject"] as InboxItem["actions"], href: `${ARGON}/kho-nguon`,
  }))
}

async function mailItems(username: string, now: number): Promise<InboxItem[]> {
  return (await listMailThreads(username)).filter(t => t.status === "waiting_me").slice(0, 15).map(t => ({
    key: `mail:${t.id}`, kind: "mail" as const, id: t.id, title: t.subject || "(không tiêu đề)", detail: threadLine(t, now), at: t.last_at ?? t.created_at, urgency: urgencyFor("mail", t.last_at ?? t.created_at, now),
    source: "Mail", actions: ["done"] as InboxItem["actions"], href: ARGON,
  }))
}

async function ticketItems(now: number): Promise<InboxItem[]> {
  const r = await listTickets(30)
  if (r.error) throw new Error(r.error)
  return (r.tickets ?? []).filter(t => t.status === "question" && t.question).map(t => {
    const at = (t as { updated_at?: string }).updated_at ?? (t as { created_at?: string }).created_at ?? new Date(now).toISOString()
    return { key: `dev_ticket:${t.id}`, kind: "dev_ticket" as const, id: String(t.id), title: `#${t.id} ${t.title}`, detail: String(t.question), at, urgency: urgencyFor("dev_ticket", at, now), source: "Phiếu sửa code", actions: ["open"] as InboxItem["actions"], href: "/analytics/creator/ai" }
  })
}

export async function loadInbox(username: string, now = Date.now()): Promise<{ items: InboxItem[]; failed: string[] }> {
  const jobs: [string, Promise<InboxItem[]>][] = [
    ["Hành động Gấu Pro", gpActions(username, now)], ["Argon", argonItems(username, now)], ["Sổ sự việc", factReviews(username, now)], ["Mail", mailItems(username, now)], ["Phiếu sửa code", ticketItems(now)],
  ]
  const settled = await Promise.allSettled(jobs.map(j => j[1]))
  const items: InboxItem[] = [], failed: string[] = []
  settled.forEach((r, i) => { if (r.status === "fulfilled") items.push(...r.value); else failed.push(`${jobs[i][0]}: ${(r.reason as Error)?.message ?? "lỗi"}`.slice(0, 160)) })
  return { items: sortInbox(items), failed }
}
