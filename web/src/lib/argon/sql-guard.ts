// Kiểm câu SQL do Argon tự viết (công cụ `sql`). Lớp 1 = file này (chỉ cho 1 câu SELECT/WITH, chặn ghi/DDL/hàm nguy hiểm); lớp 2 = chạy trong
// transaction READ ONLY có statement_timeout (sql-tool.ts); lớp 3 = tài khoản gohub_dw chỉ có quyền đọc. Thuần, có test.

const FORBIDDEN_WORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke", "copy", "call", "do", "execute", "prepare", "deallocate",
  "vacuum", "analyze", "reindex", "cluster", "lock", "listen", "notify", "unlisten", "refresh", "comment", "security", "reset", "set", "begin", "commit",
  "rollback", "savepoint", "start", "into", "explain",
]
const FORBIDDEN_FUNCS = [
  "pg_sleep", "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "lo_import", "lo_export", "lo_unlink", "dblink", "pg_terminate_backend",
  "pg_cancel_backend", "set_config", "pg_reload_conf", "pg_rotate_logfile", "pg_advisory_lock", "pg_notify", "nextval", "setval", "txid_current", "pg_switch_wal",
]

/** Gỡ comment (thay bằng 1 khoảng trắng) và tạo bản "trần" đã bỏ nội dung chuỗi/định danh trong ngoặc để quét từ khoá. Trả null nếu dấu nháy/comment không đóng. */
export function scanSql(q: string): { clean: string; bare: string } | null {
  let clean = "", bare = "", i = 0
  const n = q.length
  while (i < n) {
    const c = q[i], d = q[i + 1]
    if (c === "-" && d === "-") { while (i < n && q[i] !== "\n") i++; clean += " "; bare += " "; continue }
    if (c === "/" && d === "*") {
      const end = q.indexOf("*/", i + 2)
      if (end < 0) return null
      i = end + 2; clean += " "; bare += " "; continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      for (;;) {
        if (j >= n) return null
        if (q[j] === c) { if (q[j + 1] === c) { j += 2; continue } break }
        j++
      }
      clean += q.slice(i, j + 1); bare += c === "'" ? "''" : '""'; i = j + 1; continue
    }
    clean += c; bare += c; i++
  }
  return { clean, bare }
}

export interface SqlOk { ok: true; sql: string }
export interface SqlBad { ok: false; error: string }

/** Chỉ nhận đúng 1 câu SELECT/WITH (đã bỏ comment, bỏ dấu ';' cuối). */
export function validateSql(raw: string): SqlOk | SqlBad {
  const text = String(raw ?? "").trim()
  if (!text) return { ok: false, error: "Câu SQL trống" }
  if (text.length > 20_000) return { ok: false, error: "Câu SQL quá dài (tối đa 20.000 ký tự)" }
  const s = scanSql(text)
  if (!s) return { ok: false, error: "Dấu nháy hoặc comment không đóng" }
  const sql = s.clean.trim().replace(/;+\s*$/, "").trim()
  const bare = s.bare.trim().replace(/;+\s*$/, "").trim()
  if (!sql) return { ok: false, error: "Câu SQL trống sau khi bỏ comment" }
  if (bare.includes(";")) return { ok: false, error: "Chỉ được 1 câu lệnh (không dùng dấu ; ở giữa)" }
  if (bare.includes("$")) return { ok: false, error: "Không dùng dollar-quote ($$) hoặc tham số $n" }
  if (!/^(select|with)\b/i.test(bare)) return { ok: false, error: "Chỉ được câu SELECT hoặc WITH ... SELECT" }
  const words = new Set((bare.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []))
  for (const w of FORBIDDEN_WORDS) if (words.has(w)) return { ok: false, error: `Không được dùng "${w.toUpperCase()}" (chỉ đọc dữ liệu)` }
  for (const f of FORBIDDEN_FUNCS) if (words.has(f)) return { ok: false, error: `Không được gọi hàm ${f}` }
  return { ok: true, sql }
}
