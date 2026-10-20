// Chạy code Python do Argon viết trong Vercel Sandbox (microVM cô lập). Lớp mỏng quanh SDK @vercel/sandbox, có thể thay backend để test.
// Bảo mật: lúc chạy code mạng ĐÓNG HẲN (deny-all) nên code không gửi dữ liệu ra ngoài được; chỉ lúc dựng snapshot (pip install) mới mở mạng.
// Hobby: 5 giờ CPU/tháng, 45 phút/phiên → có đồng hồ quota (usage) và chặn khi gần hết. Image mặc định không có pandas → dựng snapshot 1 lần.

export interface SbxHandle {
  writeFiles(files: { path: string; content: Uint8Array | string }[]): Promise<void>
  run(script: string, timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }>
  readFile(path: string): Promise<Buffer | null>
  snapshot(): Promise<string>                 // dừng sandbox + lưu snapshot, trả id
  stop(): Promise<number | undefined>         // dừng, trả CPU thật (ms) nếu biết
}
export interface SbxBackend { create(o: { snapshotId?: string; network: boolean; timeoutMs: number }): Promise<SbxHandle> }

export const WORK_DIR = "/tmp/argon"
export const SNAPSHOT_PACKAGES = ["pandas", "numpy", "openpyxl", "xlsxwriter", "matplotlib"]
export const RUN_TIMEOUT_MS = 150_000
const SANDBOX_TIMEOUT_MS = 5 * 60_000
const KEY_SNAPSHOT = "argon_sandbox_snapshot"
const usageKey = (d = new Date()) => `argon_sandbox_usage:${d.toISOString().slice(0, 7)}`
/** Hobby = 5 giờ CPU/tháng; chặn ở 90% để chừa lề cho việc khác (đổi bằng env ARGON_SANDBOX_CPU_HOURS). */
export const cpuLimitMs = () => Math.round((Number(process.env.ARGON_SANDBOX_CPU_HOURS) || 5) * 0.9 * 3_600_000)

const db = async () => (await import("@/lib/supabase")).supabaseAdmin
async function getSetting<T>(key: string): Promise<T | null> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", key).maybeSingle()
  if (!data?.value) return null
  try { return (typeof data.value === "string" ? JSON.parse(data.value) : data.value) as T } catch { return null }
}
async function putSetting(key: string, label: string, value: unknown) {
  await (await db()).from("app_settings").upsert({ key, value: JSON.stringify(value), category: "argon", label, updated_at: new Date().toISOString() }, { onConflict: "key" })
}

export interface SandboxUsage { cpuMs: number; runs: number }
export const getUsage = async (): Promise<SandboxUsage> => (await getSetting<SandboxUsage>(usageKey())) ?? { cpuMs: 0, runs: 0 }
export async function addUsage(cpuMs: number): Promise<SandboxUsage> {
  const u = await getUsage()
  const next = { cpuMs: u.cpuMs + Math.max(0, Math.round(cpuMs)), runs: u.runs + 1 }
  await putSetting(usageKey(), "Quota Sandbox Argon (tháng)", next)
  return next
}
/** Thuần: còn được chạy không? */
export function quotaState(usedMs: number, limitMs = cpuLimitMs()): { ok: boolean; message: string; fraction: number } {
  const fraction = limitMs ? usedMs / limitMs : 1
  return { ok: usedMs < limitMs, fraction, message: usedMs < limitMs ? "" : `Đã dùng ${(usedMs / 3_600_000).toFixed(2)} giờ CPU Sandbox tháng này (trần ${(limitMs / 3_600_000).toFixed(1)} giờ trên gói Hobby). Chờ sang tháng sau hoặc nâng gói Vercel.` }
}

/** Backend thật: SDK @vercel/sandbox. Chạy trên Vercel (env VERCEL=1) → để SDK tự dùng OIDC của request (KHÔNG truyền VERCEL_TOKEN: env này có thể là token cũ đã bị thu hồi → 403 "Not authorized", sự cố 2026-10-20).
 *  Chạy local: ARGON_SANDBOX_TOKEN hoặc VERCEL_TOKEN hợp lệ (+ VERCEL_TEAM_ID, VERCEL_PROJECT_ID). */
export async function realBackend(): Promise<SbxBackend> {
  const { Sandbox } = await import("@vercel/sandbox")
  const token = process.env.ARGON_SANDBOX_TOKEN || (process.env.VERCEL ? undefined : process.env.VERCEL_TOKEN)
  const creds = token ? { token, teamId: process.env.VERCEL_TEAM_ID || "team_lMxryomejKn2jwP8RGumsufl", projectId: process.env.VERCEL_PROJECT_ID || "prj_De4l9p8QAKIu2YMbofI01p6H040f" } : {}
  return {
    async create(o) {
      const params = {
        ...creds, persistent: false, timeout: o.timeoutMs, resources: { vcpus: 2 }, networkPolicy: o.network ? "allow-all" : "deny-all",
        ...(o.snapshotId ? { source: { type: "snapshot", snapshotId: o.snapshotId } } : {}),
      } as unknown as Parameters<typeof Sandbox.create>[0]
      const sbx = await Sandbox.create(params)
      return {
        writeFiles: async files => { await sbx.writeFiles(files.map(f => ({ path: f.path, content: typeof f.content === "string" ? Buffer.from(f.content, "utf8") : f.content }))) },
        run: async (script, timeoutMs) => {
          const r = await sbx.runCommand("bash", ["-lc", script], { timeoutMs })
          return { exitCode: r.exitCode ?? -1, stdout: await r.stdout(), stderr: await r.stderr() }
        },
        readFile: path => sbx.readFileToBuffer({ path }),
        snapshot: async () => (await sbx.snapshot({ expiration: 0 })).snapshotId,
        stop: async () => {
          const r = (await sbx.stop()) as unknown as { activeCpuDurationMs?: number; totalActiveCpuDurationMs?: number }
          return r?.activeCpuDurationMs ?? r?.totalActiveCpuDurationMs ?? sbx.totalActiveCpuDurationMs ?? sbx.activeCpuUsageMs
        },
      }
    },
  }
}

/** Dựng snapshot có sẵn pandas/openpyxl/matplotlib (mở mạng, chỉ lúc này). Trả id và lưu vào app_settings. */
export async function buildSnapshot(backend: SbxBackend): Promise<string> {
  const h = await backend.create({ network: true, timeoutMs: 8 * 60_000 })
  try {
    const r = await h.run(`pip install --quiet --no-input ${SNAPSHOT_PACKAGES.join(" ")} && python3 -c "import ${SNAPSHOT_PACKAGES.join(", ")}; print('ok')"`, 6 * 60_000)
    if (r.exitCode !== 0 || !r.stdout.includes("ok")) throw new Error(`Dựng snapshot lỗi: ${(r.stderr || r.stdout).slice(-400)}`)
    const id = await h.snapshot()
    await putSetting(KEY_SNAPSHOT, "Snapshot Sandbox Argon (python + pandas)", { id, at: new Date().toISOString(), packages: SNAPSHOT_PACKAGES })
    return id
  } catch (e) { await h.stop().catch(() => undefined); throw e }
}

export interface CodeFile { path: string; content: Uint8Array | string }
export interface RunResult { exitCode: number; stdout: string; stderr: string; outputs: { path: string; content: Buffer }[]; cpuMs: number; durationMs: number; skipped: string[] }
export const MAX_OUT_FILES = 20
export const MAX_OUT_BYTES = 15 * 1024 * 1024

/** Chạy 1 đoạn Python: nạp file đầu vào vào /tmp/argon, chạy main.py (mạng đóng), gom mọi file trong out/. Luôn dừng sandbox. */
export class NoSnapshotError extends Error { constructor(m = "Sandbox chưa có môi trường Python (pandas, openpyxl…). Hiếu bấm “Chuẩn bị Sandbox” ở Bàn làm việc một lần (khoảng 1–2 phút).") { super(m); this.name = "NoSnapshotError" } }
export const getSnapshotInfo = () => getSetting<{ id: string; at: string; packages: string[] }>(KEY_SNAPSHOT)

/** Chạy 1 đoạn Python: nạp file đầu vào vào /tmp/argon, chạy main.py (mạng đóng), gom mọi file trong out/. Luôn dừng sandbox.
 *  Không tự dựng snapshot (dựng mất vài phút, vượt thời gian một đoạn chat) → chưa có thì ném NoSnapshotError; dựng bằng buildSnapshot qua API riêng. */
export async function runPython(backend: SbxBackend, code: string, files: CodeFile[], timeoutMs = RUN_TIMEOUT_MS): Promise<RunResult> {
  const t0 = Date.now()
  const snap = (await getSnapshotInfo())?.id
  if (!snap) throw new NoSnapshotError()
  let h: SbxHandle
  try { h = await backend.create({ snapshotId: snap, network: false, timeoutMs: SANDBOX_TIMEOUT_MS }) }
  catch (e) { throw new NoSnapshotError(`Không mở được môi trường Sandbox (${(e as Error).message.slice(0, 200)}). Có thể snapshot đã hết hạn: bấm “Chuẩn bị Sandbox” để dựng lại.`) }
  let cpu: number | undefined
  let result: RunResult | null = null
  try {
    await h.run(`mkdir -p ${WORK_DIR}/out`, 20_000)
    await h.writeFiles([...files.map(f => ({ path: `${WORK_DIR}/${f.path}`, content: f.content })), { path: `${WORK_DIR}/main.py`, content: code }])
    const r = await h.run(`cd ${WORK_DIR} && MPLBACKEND=Agg PYTHONIOENCODING=utf-8 timeout ${Math.floor(timeoutMs / 1000)} python3 main.py`, timeoutMs + 15_000)
    const list = await h.run(`cd ${WORK_DIR} && find out -type f -size -${Math.floor(MAX_OUT_BYTES / 1024)}k | sort | head -${MAX_OUT_FILES + 1}`, 20_000)
    const paths = list.stdout.split("\n").map(s => s.trim()).filter(Boolean)
    const skipped = paths.length > MAX_OUT_FILES ? [`Quá ${MAX_OUT_FILES} file trong out/, chỉ lưu ${MAX_OUT_FILES} file đầu`] : []
    const outputs: { path: string; content: Buffer }[] = []
    let total = 0
    for (const p of paths.slice(0, MAX_OUT_FILES)) {
      const buf = await h.readFile(`${WORK_DIR}/${p}`)
      if (!buf) continue
      total += buf.length
      if (total > MAX_OUT_BYTES) { skipped.push(`Bỏ ${p}: tổng file đầu ra vượt ${MAX_OUT_BYTES / 1024 / 1024}MB`); break }
      outputs.push({ path: p, content: buf })
    }
    result = { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, outputs, cpuMs: 0, durationMs: Date.now() - t0, skipped }
  } finally {
    cpu = await h.stop().catch(() => undefined)
  }
  // CPU thật nếu SDK trả; không thì tính theo thời gian chạy (an toàn hơn cho quota).
  result.cpuMs = cpu ?? result.durationMs
  return result
}
