#!/usr/bin/env node
// GoHub local agent — "tay chân" trên máy người dùng cho Gấu Pro (tool localFiles).
// Poll hàng đợi Bridge (chỉ lệnh fs_*), thực thi trong thư mục được phép, gửi kết quả về.
// Không dependency ngoài Node >= 18. Config + backup nằm ở %USERPROFILE%\.gohub-agent (ngoài repo, giữ token khỏi git).
import fs from "node:fs/promises"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"

const VERSION = "local-agent-0.1.0"
const HOME = path.join(os.homedir(), ".gohub-agent")
const CONFIG_PATH = path.join(HOME, "config.json")
const BACKUP_DIR = path.join(HOME, "backups")
const LOG_PATH = path.join(HOME, "agent.log")

const IDLE_POLL_MS = 10_000
const ACTIVE_POLL_MS = 2_000
const ACTIVE_WINDOW_MS = 3 * 60_000
const MAX_READ_BYTES = 256 * 1024
const MAX_LIST_ENTRIES = 500

// File bí mật không bao giờ gửi lên cloud/LLM, kể cả khi nằm trong thư mục được phép.
const DENY_NAME = [/^\.env/i, /\.(pem|key|pfx|p12|kdbx)$/i, /^id_(rsa|ed25519|ecdsa)/i, /credentials/i, /secret/i]
const DENY_SEGMENT = new Set([".git", "node_modules", ".gohub-agent"])

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`
  console.log(line)
  fs.appendFile(LOG_PATH, line + "\n").catch(() => {})
}

function loadConfig() {
  mkdirSync(HOME, { recursive: true })
  if (!existsSync(CONFIG_PATH)) {
    const example = {
      baseUrl: "https://stg-intel-v2.gohub.cloud",
      token: "DÁN_TOKEN_BRIDGE_Ở_/analytics/creator/bridge",
      roots: ["D:\\gohub", "D:\\BaoCaoThucTap"],
      deviceId: crypto.randomUUID(),
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(example, null, 2))
    console.error(`Đã tạo ${CONFIG_PATH} — mở file, dán token Bridge + chỉnh roots rồi chạy lại.`)
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
  if (!cfg.token || cfg.token.startsWith("DÁN_")) {
    console.error(`Chưa có token trong ${CONFIG_PATH}.`)
    process.exit(1)
  }
  if (!cfg.deviceId) {
    cfg.deviceId = crypto.randomUUID()
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
  }
  cfg.baseUrl = cfg.baseUrl.replace(/\/$/, "")
  cfg.roots = (cfg.roots ?? []).map(r => path.resolve(r))
  if (!cfg.roots.length) {
    console.error("roots rỗng — cần ít nhất 1 thư mục được phép.")
    process.exit(1)
  }
  return cfg
}

const cfg = loadConfig()

const norm = p => (process.platform === "win32" ? p.toLowerCase() : p)

function insideRoots(abs) {
  return cfg.roots.some(root => norm(abs) === norm(root) || norm(abs).startsWith(norm(root) + path.sep))
}

// Chặn thoát khỏi roots qua "..", symlink/junction, và file bí mật.
async function resolveSafe(p) {
  if (typeof p !== "string" || !p.trim()) throw new Error("Thiếu path.")
  const abs = path.resolve(p)
  if (!insideRoots(abs)) throw new Error(`Ngoài thư mục được phép: ${abs}. Được phép: ${cfg.roots.join(", ")}`)
  let real = abs
  try { real = await fs.realpath(abs) } catch { /* file chưa tồn tại (write) — kiểm thư mục cha */
    try { real = path.join(await fs.realpath(path.dirname(abs)), path.basename(abs)) } catch { /* cha cũng chưa có */ }
  }
  if (!insideRoots(real)) throw new Error(`Đường dẫn trỏ ra ngoài thư mục được phép (symlink): ${real}`)
  const segments = path.relative(cfg.roots.find(r => norm(real).startsWith(norm(r))) ?? "", real).split(path.sep)
  if (segments.some(s => DENY_SEGMENT.has(s))) throw new Error(`Thư mục bị chặn: ${real}`)
  if (DENY_NAME.some(re => re.test(path.basename(real)))) throw new Error(`File bí mật, không được đọc/ghi: ${path.basename(real)}`)
  return real
}

async function backup(file) {
  if (!existsSync(file)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dest = path.join(BACKUP_DIR, stamp, file.replace(/^([A-Za-z]):/, "$1").replace(/^[\\/]+/, ""))
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(file, dest)
  return dest
}

const handlers = {
  async fs_list({ path: p }) {
    if (!p) return { roots: cfg.roots }
    const dir = await resolveSafe(p)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const visible = entries.filter(e => !DENY_SEGMENT.has(e.name) && !DENY_NAME.some(re => re.test(e.name)))
    const items = await Promise.all(visible.slice(0, MAX_LIST_ENTRIES).map(async e => {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) return { name: e.name, type: "dir" }
      const st = await fs.stat(full).catch(() => null)
      return { name: e.name, type: "file", size: st?.size ?? null, modified: st?.mtime?.toISOString() ?? null }
    }))
    return { path: dir, items, truncated: visible.length > MAX_LIST_ENTRIES }
  },

  async fs_read({ path: p }) {
    const file = await resolveSafe(p)
    const st = await fs.stat(file)
    if (!st.isFile()) throw new Error("Không phải file.")
    if (st.size > MAX_READ_BYTES) throw new Error(`File quá lớn (${st.size} bytes > ${MAX_READ_BYTES}).`)
    const buf = await fs.readFile(file)
    if (buf.includes(0)) throw new Error("File nhị phân (docx/xlsx/pdf/ảnh…) — chưa hỗ trợ đọc, chỉ đọc file text.")
    return { path: file, size: st.size, content: buf.toString("utf8") }
  },

  async fs_write({ path: p, content }) {
    if (typeof content !== "string") throw new Error("Thiếu content.")
    const file = await resolveSafe(p)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const backupPath = await backup(file)
    await fs.writeFile(file, content, "utf8")
    log("WRITE", file, backupPath ? `(backup ${backupPath})` : "(file mới)")
    return { path: file, bytes: Buffer.byteLength(content), backup: backupPath }
  },

  async fs_edit({ path: p, find, replace }) {
    if (!find || typeof replace !== "string") throw new Error("Thiếu find/replace.")
    const file = await resolveSafe(p)
    const text = await fs.readFile(file, "utf8")
    const count = text.split(find).length - 1
    if (count !== 1) throw new Error(`find khớp ${count} lần — cần khớp đúng 1 lần (thêm ngữ cảnh cho find).`)
    const backupPath = await backup(file)
    await fs.writeFile(file, text.replace(find, () => replace), "utf8")
    log("EDIT", file, `(backup ${backupPath})`)
    return { path: file, backup: backupPath }
  },
}

const deviceInfo = Buffer.from(JSON.stringify({
  os: `${os.type()} ${os.release()}`, arch: os.arch(), ext_version: VERSION,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, cpu_cores: os.cpus().length,
  memory_gb: Math.round(os.totalmem() / 1024 ** 3), user_agent: `${VERSION} node/${process.versions.node} host/${os.hostname()}`,
})).toString("base64")

const headers = {
  Authorization: `Bearer ${cfg.token}`,
  "X-Device-Id": cfg.deviceId,
  "X-Device-Info": deviceInfo,
  "X-Agent-Kind": "local",
  "Content-Type": "application/json",
}

async function api(route, init) {
  const res = await fetch(`${cfg.baseUrl}/api/creator-ai/bridge/${route}`, { ...init, headers })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${route} ${res.status}: ${body?.message ?? body?.error ?? "lỗi"}`)
  return body
}

let lastCommandAt = 0
let failures = 0

async function tick() {
  const { command } = await api("next", { method: "GET" })
  failures = 0
  if (!command) return
  lastCommandAt = Date.now()
  const handler = handlers[command.action]
  let payload
  try {
    if (!handler) throw new Error(`Action không hỗ trợ: ${command.action}`)
    log("RUN", command.action, command.payload?.path ?? "")
    payload = { id: command.id, result: await handler(command.payload ?? {}) }
  } catch (e) {
    log("ERR", command.action, e.message)
    payload = { id: command.id, error: e.message }
  }
  await api("result", { method: "POST", body: JSON.stringify(payload) })
}

async function loop() {
  log(`${VERSION} chạy — server ${cfg.baseUrl}, roots: ${cfg.roots.join(", ")}`)
  for (;;) {
    try {
      await tick()
    } catch (e) {
      failures++
      log("POLL ERR", e.message)
      if (/401|device_revoked|extension_outdated/.test(e.message)) {
        log("Token sai hoặc thiết bị bị thu hồi — dừng.")
        process.exit(2)
      }
    }
    const active = Date.now() - lastCommandAt < ACTIVE_WINDOW_MS
    const backoff = failures ? Math.min(60_000, IDLE_POLL_MS * 2 ** Math.min(failures, 3)) : 0
    await new Promise(r => setTimeout(r, backoff || (active ? ACTIVE_POLL_MS : IDLE_POLL_MS)))
  }
}

loop()
