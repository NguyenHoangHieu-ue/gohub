import { supabaseAdmin } from "@/lib/supabase"
import { countTokens, sourceParts } from "./context"
import { sha256 } from "./extract"
import { ingestBuffer } from "./ingest"
import { larkToken } from "./lark"
import { ATTACH_EXT, MAX_ATTACH_BYTES, downloadAttachment, scanFolder, threadText, type MailMessage, type MailRule } from "./mail"
import type { ArgonSource } from "./server"

// Quy tắc nạp mail lưu ở app_settings (không cần migration): key `argon_mail_rules:<projectId>` = JSON mảng MailRule.
const rulesKey = (projectId: string) => `argon_mail_rules:${projectId}`
const MAX_ATTACH_PER_RUN = 15

export async function loadRules(projectId: string): Promise<MailRule[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", rulesKey(projectId)).maybeSingle()
  try { const v = JSON.parse(data?.value ?? "[]"); return Array.isArray(v) ? v : [] } catch { return [] }
}

export async function saveRules(projectId: string, rules: MailRule[]) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: rulesKey(projectId), value: JSON.stringify(rules), category: "argon", label: "Quy tắc nạp mail Phòng Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

export async function deleteRules(projectId: string) { await supabaseAdmin.from("app_settings").delete().eq("key", rulesKey(projectId)) }

export async function allProjectIdsWithRules(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("key").like("key", "argon_mail_rules:%")
  return (data ?? []).map(r => String(r.key).slice("argon_mail_rules:".length))
}

export function sanitizeRule(raw: Partial<MailRule>): MailRule {
  return {
    id: raw.id || crypto.randomUUID().slice(0, 8),
    name: String(raw.name || "Quy tắc mail").slice(0, 80),
    folder: String(raw.folder || "INBOX"),
    from: raw.from?.trim() || undefined,
    keywords: raw.keywords?.trim() || undefined,
    sinceDays: Math.min(365, Math.max(1, Number(raw.sinceDays) || 30)),
    maxThreads: Math.min(60, Math.max(1, Number(raw.maxThreads) || 30)),
    attachments: raw.attachments !== false,
  }
}

export interface MailSyncResult { rule: string; scanned: number; matched: number; threads: number; created: number; updated: number; attachments: number; errors: string[] }

export async function syncMailRule(projectId: string, username: string, rule: MailRule, token?: string): Promise<MailSyncResult> {
  const res: MailSyncResult = { rule: rule.name, scanned: 0, matched: 0, threads: 0, created: 0, updated: 0, attachments: 0, errors: [] }
  const t = token ?? (await larkToken())
  const { messages, scanned } = await scanFolder(t, rule)
  res.scanned = scanned; res.matched = messages.length

  const byThread = new Map<string, MailMessage[]>()
  for (const m of messages) (byThread.get(m.threadId) ?? byThread.set(m.threadId, []).get(m.threadId)!).push(m)
  const threads = [...byThread.entries()].map(([id, ms]) => ({ id, ms, last: Math.max(...ms.map(m => m.dateMs)) })).sort((a, b) => b.last - a.last).slice(0, rule.maxThreads)
  res.threads = threads.length

  const { data: existing } = await supabaseAdmin.from("argon_sources").select("*").eq("project_id", projectId).in("external_id", threads.flatMap(th => [th.id]))
  const byExt = new Map(((existing ?? []) as ArgonSource[]).map(s => [s.external_id, s]))
  let attachBudget = MAX_ATTACH_PER_RUN

  for (const th of threads) {
    try {
      const sorted = [...th.ms].sort((a, b) => a.dateMs - b.dateMs)
      const latest = sorted[sorted.length - 1]
      const text = `Tiêu đề: ${latest.subject}\n\n${threadText(sorted)}`
      const hash = sha256(text)
      const meta = { ruleId: rule.id, subject: latest.subject, mailFrom: latest.from, lastDate: new Date(latest.dateMs).toISOString(), messageIds: sorted.map(m => m.id) }
      const cur = byExt.get(th.id)
      if (!cur) {
        const { data: src, error } = await supabaseAdmin.from("argon_sources").insert({
          project_id: projectId, kind: "mail", name: `✉ ${latest.subject}`.slice(0, 160), mime: "text/plain", size_bytes: Buffer.byteLength(text), extracted_text: text,
          send_binary: false, content_hash: hash, tokens: 0, external_id: th.id, sync_mode: "snapshot", synced_at: new Date().toISOString(), meta,
        }).select("*").single()
        if (error || !src) throw new Error(error?.message ?? "lưu mail lỗi")
        const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: 0 }, []))
        await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
        await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Nạp từ mail Lark", author: "lark-mail" })
        res.created++
      } else if (cur.content_hash !== hash && !cur.meta?.edited) {
        const version = cur.version + 1
        const tokens = await countTokens(await sourceParts({ ...cur, extracted_text: text }, { left: 0 }, []))
        await supabaseAdmin.from("argon_source_versions").insert({ source_id: cur.id, version, extracted_text: text, note: "Có thư mới trong luồng", author: "lark-mail" })
        await supabaseAdmin.from("argon_sources").update({ extracted_text: text, content_hash: hash, version, tokens, size_bytes: Buffer.byteLength(text), synced_at: new Date().toISOString(), updated_at: new Date().toISOString(), name: `✉ ${latest.subject}`.slice(0, 160), meta: { ...cur.meta, ...meta } }).eq("id", cur.id)
        res.updated++
      }

      if (rule.attachments) {
        for (const m of sorted) for (const a of m.attachments) {
          if (a.inline || !ATTACH_EXT.test(a.filename) || attachBudget <= 0) continue
          const extId = `mailatt:${a.id}`
          const { data: dup } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", projectId).eq("external_id", extId).maybeSingle()
          if (dup) continue
          try {
            const buf = await downloadAttachment(t, m.id, a.id)
            if (buf.length > MAX_ATTACH_BYTES) { res.errors.push(`${a.filename}: quá lớn (${(buf.length / 1048576).toFixed(1)}MB)`); continue }
            await ingestBuffer(projectId, username, a.filename, "", buf, { external_id: extId, meta: { mailThread: th.id, mailSubject: latest.subject, ruleId: rule.id } })
            attachBudget--; res.attachments++
          } catch (e) { res.errors.push(`${a.filename}: ${(e as Error).message}`) }
        }
      }
    } catch (e) { res.errors.push(`${th.ms[0]?.subject ?? th.id}: ${(e as Error).message}`) }
  }
  await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId)
  return res
}

export async function syncAllRules(projectId: string, username: string): Promise<MailSyncResult[]> {
  const rules = await loadRules(projectId)
  if (!rules.length) return []
  const token = await larkToken()
  const out: MailSyncResult[] = []
  for (const r of rules) out.push(await syncMailRule(projectId, username, r, token))
  return out
}
