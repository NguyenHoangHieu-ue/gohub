// Phòng Argon: đồng bộ ban đêm mọi nguồn Lark + gói dữ liệu (chế độ snapshot/live) + quy tắc mail — chỉ tạo phiên bản mới khi nội dung đổi (so hash).
// Gọi: GET/POST + `Authorization: Bearer $CRON_SECRET` (cron-job.org mỗi đêm). `?dryRun=1` chỉ đếm số nguồn. Trả SỐ LƯỢNG + lỗi, không trả nội dung.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { listBgRunIds } from "@/lib/argon/bg"
import { resumeStuckBackground } from "@/lib/argon/bg-worker"
import { syncFolders, syncMany } from "@/lib/argon/lark-sync"
import { allProjectIdsWithRules, syncAllRules } from "@/lib/argon/mail-sync"
import { allProjectIdsWithThreadRules, syncAllThreadRules } from "@/lib/argon/threads"
import { projectIdsWithAutorun, startAutorun } from "@/lib/argon/autorun"
import { MAX_PATROLS_PER_NIGHT, missionIdsWithPatrol, startPatrol, vnDate } from "@/lib/argon/patrol"
import { missionIdsWithDueForecasts } from "@/lib/argon/forecast-tool"
import { ensureIndexed, pruneOrphans } from "@/lib/argon/index-db"
import type { ArgonSource } from "@/lib/argon/server"

export const maxDuration = 300

async function run(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await supabaseAdmin.from("argon_sources").select("*").or("kind.eq.lark,external_id.like.datapack:%").eq("enabled", true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const sources = (data ?? []) as ArgonSource[]
  if (req.nextUrl.searchParams.get("dryRun") === "1") return NextResponse.json({ dryRun: true, sources: sources.length })
  const t0 = Date.now()
  // Việc nền kẹt (đoạn chết / chưa ai nhận) → gọi worker chạy lại.
  const resumed = await resumeStuckBackground(req.nextUrl.origin, listBgRunIds).catch(() => 0)
  const results: Awaited<ReturnType<typeof syncMany>> = []
  // Chia lô nhỏ để chắc chắn dừng trước trần thời gian; phần còn lại để đêm sau.
  for (let i = 0; i < sources.length && Date.now() - t0 < 240_000; i += 9) results.push(...(await syncMany(sources.slice(i, i + 9), req.nextUrl.origin)))
  // Thư mục Lark đã thêm: tìm file mới (kể cả thư mục con) rồi thêm thành nguồn.
  const folderAdds: { project: string; added: number; errors: string[] }[] = []
  const { data: folderProjects } = await supabaseAdmin.from("argon_sources").select("project_id,meta").eq("kind", "lark").not("meta->>rootFolder", "is", null)
  for (const pid of Array.from(new Set((folderProjects ?? []).map(r => r.project_id as string)))) {
    if (Date.now() - t0 > 245_000) break
    const r = await syncFolders(pid)
    folderAdds.push({ project: pid, added: r.added.length, errors: r.errors.slice(0, 3) })
  }
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
  // Thread trong group Lark: nạp lại theo quy tắc (bot đọc, chỉ đọc).
  const threads: { project: string; threads: number; created: number; updated: number; attachments: number; errors: string[] }[] = []
  for (const pid of await allProjectIdsWithThreadRules()) {
    if (Date.now() - t0 > 250_000) break
    const { data: proj } = await supabaseAdmin.from("argon_projects").select("username").eq("id", pid).maybeSingle()
    if (!proj) continue
    try {
      const r = await syncAllThreadRules(pid, proj.username, t0 + 255_000)
      threads.push({ project: pid, threads: r.reduce((n, x) => n + x.threads, 0), created: r.reduce((n, x) => n + x.created, 0), updated: r.reduce((n, x) => n + x.updated, 0), attachments: r.reduce((n, x) => n + x.attachments, 0), errors: r.flatMap(x => x.errors).slice(0, 3) })
    } catch (e) { threads.push({ project: pid, threads: 0, created: 0, updated: 0, attachments: 0, errors: [(e as Error).message] }) }
  }
  // Lập chỉ mục tìm kiếm cho nguồn mới/đổi (Turso riêng), dọn chỉ mục của nguồn đã xoá; làm trước autorun/tuần tra để chúng tìm được nội dung mới.
  let search: { indexed: number; pending: number; pruned: number; errors: string[] } = { indexed: 0, pending: 0, pruned: 0, errors: [] }
  try {
    const { data: all } = await supabaseAdmin.from("argon_sources").select("id").eq("enabled", true)
    const ix = await ensureIndexed((all ?? []).map(r => r.id as string), { deadlineMs: Math.max(5_000, t0 + 270_000 - Date.now()), max: 400 })
    search = { ...ix, pruned: await pruneOrphans() }
  } catch (e) { search.errors.push((e as Error).message) }
  // "Tự chạy hằng đêm": sau khi mail/thread đã nạp, giao worker chạy yêu cầu cố định (1 lần/ngày/dự án) rồi DM Lark.
  const autorun: { project: string; runId: string | null; error?: string }[] = []
  for (const pid of await projectIdsWithAutorun()) {
    try { autorun.push({ project: pid, runId: await startAutorun(pid, req.nextUrl.origin) }) } catch (e) { autorun.push({ project: pid, runId: null, error: (e as Error).message }) }
  }
  // "Tuần tra đêm" của sứ mệnh đang chạy: giao worker chạy nền (model Nhanh), tối đa MAX_PATROLS_PER_NIGHT lượt/đêm để không đốt quota Sandbox/DB.
  const patrol: { mission: string; runId?: string; skipped?: string; error?: string }[] = []
  let started = 0
  for (const mid of Array.from(new Set([...(await missionIdsWithPatrol()), ...(await missionIdsWithDueForecasts(vnDate()))]))) {
    if (started >= MAX_PATROLS_PER_NIGHT) { patrol.push({ mission: mid, skipped: "quá số lượt tuần tra mỗi đêm" }); continue }
    try { const r = await startPatrol(mid, req.nextUrl.origin); if (r.runId) started++; patrol.push({ mission: mid, ...r }) } catch (e) { patrol.push({ mission: mid, error: (e as Error).message }) }
  }
  const count = (s: string) => results.filter(r => r.status === s).length
  return NextResponse.json({
    total: sources.length, done: results.length, changed: count("changed"), same: count("same"), skipped: count("skipped"), error: count("error"),
    errors: results.filter(r => r.status === "error").slice(0, 10).map(r => `${r.name}: ${r.note}`),
    resumedBackground: resumed,
    folders: folderAdds,
    mail,
    threads,
    search,
    autorun,
    patrol,
  })
}

export const GET = run
export const POST = run
