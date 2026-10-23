// Chuẩn hoá tên route cache để gom mọi phiên bản khoá: "bod-summary5" / "qreport_raw_v12" → "bod-summary" / "qreport_raw".
export function normalizePerfRoute(name: string): string {
  const base = name.includes(":") ? name.slice(0, name.indexOf(":")) : name
  return base.replace(/[-_]?v?\d+$/i, "").slice(0, 60) || base.slice(0, 60)
}
