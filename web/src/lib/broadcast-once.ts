// DM Lark hàng loạt MỘT LẦN theo giờ định sẵn (vd lời chúc 20/10), có cổng giờ chặt + chống gửi trùng.
//
// Vì sao riêng: scheduled-messages chạy theo scheduler ngoài (mỗi giờ phút :01 / GitHub Actions lệch 15-120 phút) nên không thể
// đảm bảo "đúng 9h30". Ở đây việc gọi do workflow GitHub Actions "ngủ tới đúng giờ rồi mới gọi" (và có thể thêm cron-job.org làm dự phòng);
// phía server tự bảo vệ:
//   · gọi SỚM hơn giờ hẹn  → TỪ CHỐI (không đổi trạng thái, bên gọi chờ rồi gọi lại)
//   · gọi TRỄ quá dung sai → KHÔNG gửi, đánh dấu "missed" và DM báo Creator
//   · gọi nhiều lần (nhiều trigger dự phòng, retry) → atomic claim, đúng 1 lần gửi
// Trạng thái lưu ở app_settings key `broadcast_once:<id>` (value JSON).
import { supabaseAdmin } from "@/lib/supabase"
import { getCreatorLarkOpenId, sendLarkMessage } from "@/lib/lark"

export interface BroadcastJob {
  id: string
  text: string
  /** Giờ gửi theo ICT, dạng "2026-10-20T09:30:00" */
  sendAtIct: string
  /** Trễ tối đa cho phép (giây) so với giờ hẹn; quá thì không gửi. Mặc định 90. */
  lateToleranceSec?: number
  /** Chỉ gửi cho các username này (dùng cho gửi thử); không có = mọi user có lark_open_id. */
  onlyUsernames?: string[]
  status: "pending" | "sending" | "done" | "missed"
  claimedAtMs?: number
  startedSendMs?: number
  finishedSendMs?: number
  summary?: { total: number; ok: number; failed: { username: string; error: string }[] }
}

export const jobKey = (id: string) => `broadcast_once:${id}`
export const parseIctMs = (s: string) => Date.parse(`${s}+07:00`)

export type RunResult =
  | { state: "early"; waitMs: number }
  | { state: "late"; lateMs: number }
  | { state: "skipped"; status: BroadcastJob["status"] }
  | { state: "dry"; recipients: { username: string; name: string | null }[] }
  | { state: "sent"; total: number; ok: number; failed: number; startedOffsetMs: number; finishedOffsetMs: number }
  | { state: "notfound" }

async function load(id: string): Promise<{ raw: string; job: BroadcastJob } | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", jobKey(id)).maybeSingle()
  if (!data?.value) return null
  try { return { raw: data.value, job: JSON.parse(data.value) as BroadcastJob } } catch { return null }
}

/** Ghi trạng thái mới CHỈ nếu bản ghi chưa bị ai đổi (so nguyên chuỗi cũ) → đúng 1 bên chiếm được. */
async function claim(id: string, oldRaw: string, next: BroadcastJob): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("app_settings").update({ value: JSON.stringify(next) }).eq("key", jobKey(id)).eq("value", oldRaw).select("key")
  return !error && !!data && data.length === 1
}

async function save(id: string, job: BroadcastJob) {
  await supabaseAdmin.from("app_settings").update({ value: JSON.stringify(job) }).eq("key", jobKey(id))
}

async function recipients(job: BroadcastJob) {
  let q = supabaseAdmin.from("users").select("username,name,lark_open_id").not("lark_open_id", "is", null)
  if (job.onlyUsernames?.length) q = q.in("username", job.onlyUsernames)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).filter(u => u.lark_open_id) as { username: string; name: string | null; lark_open_id: string }[]
}

async function alertCreator(text: string) {
  try {
    const id = await getCreatorLarkOpenId()
    if (id) await sendLarkMessage(id, "open_id", text)
  } catch (e) { console.error("[broadcast-once] alert:", (e as Error).message) }
}

/** Gửi song song có giới hạn (nhanh mà không dồn dập vào Lark). */
async function sendAll(list: { username: string; lark_open_id: string }[], text: string, concurrency = 6) {
  const failed: { username: string; error: string }[] = []
  let ok = 0, next = 0
  const worker = async () => {
    while (next < list.length) {
      const u = list[next++]
      try {
        const r = await sendLarkMessage(u.lark_open_id, "open_id", text)
        if (r) ok++; else failed.push({ username: u.username, error: "Lark không nhận tin" })
      } catch (e) { failed.push({ username: u.username, error: (e as Error).message.slice(0, 120) }) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))
  return { ok, failed }
}

export async function runBroadcastOnce(id: string, opts: { now?: number; dryRun?: boolean } = {}): Promise<RunResult> {
  const now = opts.now ?? Date.now()
  const cur = await load(id)
  if (!cur) return { state: "notfound" }
  const { raw, job } = cur
  const sendAt = parseIctMs(job.sendAtIct)
  if (!Number.isFinite(sendAt)) throw new Error(`sendAtIct không hợp lệ: ${job.sendAtIct}`)

  if (opts.dryRun) return { state: "dry", recipients: (await recipients(job)).map(u => ({ username: u.username, name: u.name })) }
  if (job.status !== "pending") return { state: "skipped", status: job.status }

  if (now < sendAt) return { state: "early", waitMs: sendAt - now }

  const lateMs = now - sendAt
  if (lateMs > (job.lateToleranceSec ?? 90) * 1000) {
    if (await claim(id, raw, { ...job, status: "missed", claimedAtMs: now })) {
      await alertCreator(`⚠️ Tin hẹn giờ "${id}" (${job.sendAtIct} ICT) KHÔNG được gửi: lệnh gọi tới trễ ${Math.round(lateMs / 1000)} giây (quá dung sai ${job.lateToleranceSec ?? 90} giây). Không gửi để tránh tới muộn — anh quyết có gửi bù không.`)
    }
    return { state: "late", lateMs }
  }

  const sending: BroadcastJob = { ...job, status: "sending", claimedAtMs: now, startedSendMs: Date.now() }
  if (!(await claim(id, raw, sending))) return { state: "skipped", status: "sending" }

  const list = await recipients(job)
  const { ok, failed } = await sendAll(list, job.text)
  const finished = Date.now()
  const done: BroadcastJob = { ...sending, status: "done", finishedSendMs: finished, summary: { total: list.length, ok, failed } }
  await save(id, done)
  await alertCreator(`✅ Tin hẹn giờ "${id}" đã gửi xong: ${ok}/${list.length} người nhận, bắt đầu lúc +${((sending.startedSendMs! - sendAt) / 1000).toFixed(1)} giây so với giờ hẹn${failed.length ? `; lỗi ${failed.length}: ${failed.map(f => f.username).join(", ")}` : ""}.`)
  return { state: "sent", total: list.length, ok, failed: failed.length, startedOffsetMs: sending.startedSendMs! - sendAt, finishedOffsetMs: finished - sendAt }
}
