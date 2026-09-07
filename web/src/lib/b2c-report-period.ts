/** Last completed business day in Vietnam, independent of server timezone. */
export function getReportAsOfDate(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now)
  const [year, month, day] = today.split("-").map(Number)
  return new Date(year, month - 1, day - 1)
}

export function isoDateLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
