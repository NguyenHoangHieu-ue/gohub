// Phòng Argon: đồng bộ ban đêm mọi nguồn Lark + gói dữ liệu (chế độ snapshot/live) + quy tắc mail — chỉ tạo phiên bản mới khi nội dung đổi (so hash).
// Gọi: GET/POST + `Authorization: Bearer $CRON_SECRET` (cron-job.org mỗi đêm). `?dryRun=1` chỉ đếm số nguồn. Trả SỐ LƯỢNG + lỗi, không trả nội dung.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { syncMany } from "@/lib/argon/lark-sync"
import { allProjectIdsWithRules, syncAllRules } from "@/lib/argon/mail-sync"
import type { ArgonSource } from "@/lib/argon/server"

export const maxDuration = 300

async function run(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await supabaseAdmin.from("argon_sources").select("*").or("kind.eq.lark,external_id.like.datapack:%").eq("enabled", true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const sources = (data ?? []) as ArgonSource[]
  if (req.nextUrl.searchParams.get("dryRun") === "1") return NextResponse.json({ dryRun: true, sources: sources.length })
  const t0 = Date.now()
  const results: Awaited<ReturnType<typeof syncMany>> = []
  // Chia lô nhỏ để chắc chắn dừng trước trần thời gian; phần còn lại để đêm sau.
  for (let i = 0; i < sources.length && Date.now() - t0 < 240_000; i += 9) results.push(...(await syncMany(sources.slice(i, i + 9), req.nextUrl.origin)))
  // Quy tắc mail Lark: mỗi dự án có quy tắc → nạp lại (chỉ đọc), dừng trước trần thời gian.
  const mail: { project: string; threads: number; created: number; updated: number; attachments: number; errors: string[] }[] = []
  for (const pid of await allProjectIdsWithRules()) {
    if (Date.now() - t0 > 250_000) break
    const { data: proj } = await supabaseAdmin.from("argon_projects").select("username").eq("id", pid).maybeSingle()
    if (!proj) continue
    try {
      const r = await syncAllRules(pid, proj.username)
      mail.push({ project: pid, threads: r.reduce((n, x) => n + x.threads, 0), created: r.reduce((n, x) => n + x.created, 0), updated: r.reduce((n, x) => n + x.updated, 0), attachments: r.reduce((n, x) => n + x.attachments, 0), errors: r.flatMap(x => x.errors).slice(0, 3) })
    } catch (e) { mail.push({ project: pid, threads: 0, created: 0, updated: 0, attachments: 0, errors: [(e as Error).message] }) }
  }
  const count = (s: string) => results.filter(r => r.status === s).length
  return NextResponse.json({
    total: sources.length, done: results.length, changed: count("changed"), same: count("same"), skipped: count("skipped"), error: count("error"),
    errors: results.filter(r => r.status === "error").slice(0, 10).map(r => `${r.name}: ${r.note}`),
    mail,
  })
}

export const GET = run
export const POST = run
