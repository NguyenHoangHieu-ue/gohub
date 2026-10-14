// Biến JSON của các endpoint analytics thành văn bản gọn cho Argon: giá trị đơn → "đường.dẫn: giá trị"; mảng object → bảng markdown (cột phẳng, giới hạn dòng/cột).
// Thuần (không I/O) để test.
export interface DigestOpts { maxRows?: number; maxCols?: number; skip?: string[]; sortBy?: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  return Math.abs(n) >= 1000 ? String(Math.round(n)) : String(Math.round(n * 100) / 100)
}

const fmtVal = (v: unknown): string => (v == null ? "" : typeof v === "number" ? fmtNum(v) : typeof v === "boolean" ? (v ? "có" : "không") : String(v).replace(/\|/g, "/").replace(/\n/g, " "))

/** Làm phẳng object lồng nhau thành {path: scalar}; mảng/object quá sâu bỏ qua (xử lý riêng). */
export function flatten(o: Record<string, unknown>, prefix = "", depth = 0, out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (isObj(v)) { if (depth < 3) flatten(v, key, depth + 1, out) }
    else if (!Array.isArray(v)) out[key] = v
  }
  return out
}

function table(rows: Record<string, unknown>[], opts: DigestOpts): string {
  const flat = rows.map(r => flatten(r))
  const cols: string[] = []
  for (const r of flat) for (const k of Object.keys(r)) if (!cols.includes(k) && !(opts.skip ?? []).includes(k)) cols.push(k)
  // Ít dòng nhưng nhiều cột (vd số liệu từng tháng): in từng dòng thành khối "đường.dẫn: giá trị" cho đủ cột, dễ đọc hơn bảng bị cắt.
  if (flat.length <= 6 && cols.length > 12) {
    return flat.map((r, i) => `#### ${fmtVal(r[cols[0]]) || i + 1}\n${cols.map(c => `${c}: ${fmtVal(r[c])}`).join("\n")}`).join("\n\n")
  }
  const shown = cols.slice(0, opts.maxCols ?? 30)
  let data = flat
  if (opts.sortBy && shown.includes(opts.sortBy)) data = [...flat].sort((a, b) => Number(b[opts.sortBy!] ?? 0) - Number(a[opts.sortBy!] ?? 0))
  const cap = opts.maxRows ?? 300
  const lines = [`| ${shown.join(" | ")} |`, `|${shown.map(() => "---").join("|")}|`, ...data.slice(0, cap).map(r => `| ${shown.map(c => fmtVal(r[c])).join(" | ")} |`)]
  if (data.length > cap) lines.push(`(… còn ${data.length - cap} dòng, đã cắt)`)
  if (cols.length > shown.length) lines.push(`(… còn ${cols.length - shown.length} cột, đã cắt)`)
  return lines.join("\n")
}

/** Văn bản hoá 1 giá trị JSON bất kỳ. */
export function digest(value: unknown, title: string, opts: DigestOpts = {}): string {
  const out: string[] = [`## ${title}`]
  const walk = (v: unknown, path: string, level: number) => {
    if (Array.isArray(v)) {
      if (!v.length) { out.push(`${path}: (rỗng)`); return }
      if (v.every(isObj)) { out.push(`\n### ${path} (${v.length} dòng)\n${table(v as Record<string, unknown>[], opts)}\n`); return }
      out.push(`${path}: ${v.slice(0, 60).map(fmtVal).join(", ")}`); return
    }
    if (isObj(v)) {
      const scalars = flatten(v)
      for (const [k, x] of Object.entries(scalars)) out.push(`${path ? `${path}.` : ""}${k}: ${fmtVal(x)}`)
      for (const [k, x] of Object.entries(v)) if (Array.isArray(x)) walk(x, `${path ? `${path}.` : ""}${k}`, level + 1)
        else if (isObj(x)) for (const [k2, y] of Object.entries(x)) if (Array.isArray(y)) walk(y, `${path ? `${path}.` : ""}${k}.${k2}`, level + 1)
      return
    }
    out.push(`${path}: ${fmtVal(v)}`)
  }
  walk(value, "", 0)
  return out.join("\n")
}
