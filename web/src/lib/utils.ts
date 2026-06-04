export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ")
}

export function fmtVND(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return "—"
  return n.toLocaleString("vi-VN") + " ₫"
}

export function fmtUSD(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return "—"
  return "$" + n.toFixed(2)
}

export function fmtDate(v: unknown): string {
  if (!v) return "—"
  try {
    return new Date(String(v)).toLocaleDateString("vi-VN")
  } catch {
    return String(v)
  }
}

export function fmtNum(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return "—"
  return n.toLocaleString()
}
