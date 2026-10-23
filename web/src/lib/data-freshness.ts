// Mốc "dữ liệu cập nhật lúc": lớn nhất giữa lần ETL job xong (app_settings etl_cache_sync_last_seen) và lần
// checksum phát hiện số đổi (app_settings data_checksum_state). Thuần để test.
export interface ChecksumState { checksum: string; changedAt: string }

export function checksumOf(parts: Array<string | number | null | undefined>): string {
  return parts.map(p => String(p ?? "")).join("|")
}

export function latestDataTime(etlJson: string | undefined | null, checksumJson: string | undefined | null): string | null {
  const times: number[] = []
  try {
    const jobs = etlJson ? (JSON.parse(etlJson) as Record<string, string>) : {}
    for (const v of Object.values(jobs)) { const t = Date.parse(v); if (!Number.isNaN(t)) times.push(t) }
  } catch { /* JSON hỏng → bỏ */ }
  try {
    const c = checksumJson ? (JSON.parse(checksumJson) as Partial<ChecksumState>) : {}
    const t = c.changedAt ? Date.parse(c.changedAt) : NaN
    if (!Number.isNaN(t)) times.push(t)
  } catch { /* bỏ */ }
  return times.length ? new Date(Math.max(...times)).toISOString() : null
}

/** Số đã đổi so với lần trước? Lần đầu (chưa có state) không tính là đổi — chỉ ghi nhận mốc. */
export function checksumChanged(prev: ChecksumState | null, next: string): boolean {
  return !!prev && prev.checksum !== next
}
