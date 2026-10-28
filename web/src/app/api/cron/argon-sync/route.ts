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
import { digestPending } from "@/lib/argon/kho-digest"
import { pruneGraph } from "@/lib/argon/graph"
import { loadPubState, publishProfiles } from "@/lib/argon/lark-publish"
import { argonUsernames, runFactsNightly } from "@/lib/argon/facts"
import { runKpiWatch } from "@/lib/argon/kpi-watch"
import { suggestSkill } from "@/lib/argon/skill-suggest"
import { ownerUsernames } from "@/lib/argon/access"
import { nudgeStaleThreads, syncMailStatus } from "@/lib/argon/mail-status"
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
    const ix = await ensureIndexed((all ?? []).map(r => r.id as string), { deadlineMs: Math.max(5_000, t0 + 190_000 - Date.now()), max: 400 })
    search = { ...ix, pruned: await pruneOrphans() }
    // Graph: dọn theo MỌI nguồn còn tồn tại (kể cả đang tắt), đọc đủ trang vì PostgREST chỉ trả tối đa 1.000 dòng/lần — thiếu id sẽ xoá nhầm graph của nguồn còn sống.
    const everyId: string[] = []
    for (let from = 0; from < 20_000; from += 1000) {
      const { data: page, error: pageErr } = await supabaseAdmin.from("argon_sources").select("id").order("id").range(from, from + 999)
      if (pageErr) throw new Error(pageErr.message)
      everyId.push(...(page ?? []).map(r => r.id as string))
      if ((page?.length ?? 0) < 1000) break
    }
    await pruneGraph(everyId).catch(e => search.errors.push(`graph: ${(e as Error).message}`))
  } catch (e) { search.errors.push((e as Error).message) }
  // Sổ sự việc: tóm tắt + trích sự việc có hạn từ nguồn mới (mail/thread/file chưa xử lý), rồi đánh dấu hết hạn, nhắc tới hạn và gửi 1 tin tóm tắt "đã ghi gì" cho Hiếu.
  const facts: { user: string; digested: number; remaining: number; added: number; due: number; expired: number; sent: boolean; errors: string[] }[] = []
  try {
    for (const user of await argonUsernames()) {
      const dg = await digestPending(user, 40, t0 + 250_000)
      const nf = await runFactsNightly(user, `${req.nextUrl.origin}/analytics/creator/argon/kho-nguon`)
      facts.push({ user, digested: dg.done, remaining: dg.remaining, ...nf, errors: dg.errors.slice(0, 5) })
    }
  } catch (e) { facts.push({ user: "?", digested: 0, remaining: 0, added: 0, due: 0, expired: 0, sent: false, errors: [(e as Error).message] }) }
  // Sổ trạng thái mail theo thread (chỉ đọc INBOX + SENT): luồng nào chờ mình / chờ đối tác; nhắc Lark MỘT tin gộp luồng chờ lâu.
  const mailStatus: { user: string; threads?: number; created?: number; changed?: number; classified?: number; ignored?: number; remaining?: number; nudged?: number; skipped?: string; errors?: string[] }[] = []
  for (const user of await argonUsernames().catch(() => [] as string[])) {
    if (Date.now() - t0 > 255_000) { mailStatus.push({ user, skipped: "hết giờ" }); continue }
    try {
      const r = await syncMailStatus(user, t0 + 275_000)
      const nudged = await nudgeStaleThreads(user, `${req.nextUrl.origin}/analytics/creator/argon`)
      mailStatus.push({ user, ...r, errors: r.errors.slice(0, 3), nudged })
    } catch (e) { mailStatus.push({ user, errors: [(e as Error).message] }) }
  }
  // Hồ sơ vendor ra Lark (một chiều, chỉ khi anh BẬT "Tự cập nhật mỗi đêm" ở Kho › Thực thể): sau khi sổ sự việc + mail đã mới.
  // ARGON-X P2: sự kiện "KPI lệch kế hoạch" → cảnh báo ở Việc cần duyệt (so số chiếu quý với target quý).
  const kpiWatch: { user: string; checked?: number; alerts?: number; note?: string; error?: string }[] = []
  for (const user of await ownerUsernames(await argonUsernames().catch(() => [] as string[]))) {
    if (Date.now() - t0 > 270_000) { kpiWatch.push({ user, note: "hết giờ" }); continue }
    try { kpiWatch.push({ user, ...(await runKpiWatch(user, req.nextUrl.origin)) }) } catch (e) { kpiWatch.push({ user, error: (e as Error).message.slice(0, 160) }) }
  }

  // ARGON-X P4: câu hỏi anh hỏi lặp ≥3 lần → Argon soạn nháp kỹ năng thành ỨNG VIÊN (chờ anh duyệt, qua cổng eval).
  const skillSuggest: { user: string; note?: string; created?: string; error?: string }[] = []
  for (const user of await ownerUsernames(await argonUsernames().catch(() => [] as string[]))) {
    if (Date.now() - t0 > 275_000) { skillSuggest.push({ user, note: "hết giờ" }); continue }
    try { skillSuggest.push({ user, ...(await suggestSkill(user, req.nextUrl.origin)) }) } catch (e) { skillSuggest.push({ user, error: (e as Error).message.slice(0, 160) }) }
  }

  const larkPublish: { user: string; skipped?: string; profiles?: number; created?: number; updated?: number; same?: number; errors?: string[] }[] = []
  for (const user of await argonUsernames().catch(() => [] as string[])) {
    try {
      if (!(await loadPubState(user)).enabled) { larkPublish.push({ user, skipped: "chưa bật" }); continue }
      if (Date.now() - t0 > 240_000) { larkPublish.push({ user, skipped: "hết giờ" }); continue }
      const r = await publishProfiles(user, { deadline: t0 + 285_000 })
      larkPublish.push({ user, profiles: r.profiles, created: r.created, updated: r.updated, same: r.same, errors: r.errors.slice(0, 3) })
    } catch (e) { larkPublish.push({ user, errors: [(e as Error).message] }) }
  }
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
    facts,
    mailStatus,
    kpiWatch,
    skillSuggest,
    larkPublish,
    autorun,
    patrol,
  })
}

export const GET = run
export const POST = run
