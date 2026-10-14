// So khác biệt theo dòng (LCS) cho bản nháp Argon đề xuất sửa. Đủ cho tài liệu vài nghìn dòng; quá lớn thì coi như thay toàn bộ.
export type DiffOp = { t: "eq" | "add" | "del"; line: string }

const MAX_CELLS = 6_000_000

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split(/\r?\n/), B = b.split(/\r?\n/)
  // cắt đầu/cuối giống nhau để bảng LCS nhỏ lại
  let s = 0
  while (s < A.length && s < B.length && A[s] === B[s]) s++
  let ea = A.length, eb = B.length
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb-- }
  const head: DiffOp[] = A.slice(0, s).map(line => ({ t: "eq" as const, line }))
  const tail: DiffOp[] = A.slice(ea).map(line => ({ t: "eq" as const, line }))
  const a2 = A.slice(s, ea), b2 = B.slice(s, eb)
  if (!a2.length && !b2.length) return [...head, ...tail]
  if ((a2.length + 1) * (b2.length + 1) > MAX_CELLS) {
    return [...head, ...a2.map(line => ({ t: "del" as const, line })), ...b2.map(line => ({ t: "add" as const, line })), ...tail]
  }
  const n = a2.length, m = b2.length
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * w + j] = a2[i] === b2[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
  }
  const mid: DiffOp[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a2[i] === b2[j]) { mid.push({ t: "eq", line: a2[i] }); i++; j++ }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) mid.push({ t: "del", line: a2[i++] })
    else mid.push({ t: "add", line: b2[j++] })
  }
  while (i < n) mid.push({ t: "del", line: a2[i++] })
  while (j < m) mid.push({ t: "add", line: b2[j++] })
  return [...head, ...mid, ...tail]
}

/** Thu gọn: chỉ giữ dòng đổi + `ctx` dòng ngữ cảnh quanh nó; đoạn giống nhau dài thay bằng 1 dòng "…". */
export function collapseDiff(ops: DiffOp[], ctx = 2): (DiffOp | { t: "skip"; n: number })[] {
  const keep = new Array(ops.length).fill(false)
  ops.forEach((o, i) => { if (o.t !== "eq") for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) keep[k] = true })
  const out: (DiffOp | { t: "skip"; n: number })[] = []
  let skipped = 0
  ops.forEach((o, i) => {
    if (keep[i]) { if (skipped) { out.push({ t: "skip", n: skipped }); skipped = 0 } out.push(o) } else skipped++
  })
  if (skipped) out.push({ t: "skip", n: skipped })
  return out
}

export const diffStats = (ops: DiffOp[]) => ({ added: ops.filter(o => o.t === "add").length, removed: ops.filter(o => o.t === "del").length })
