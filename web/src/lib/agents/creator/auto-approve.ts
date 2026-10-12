import { supabaseAdmin } from "@/lib/supabase"

// Tự động duyệt theo NGÀY (Hiếu yêu cầu 2026-10-12): duyệt 1 hành động Gấu Pro → mọi hành động cần duyệt còn lại trong ngày (giờ VN)
// chạy luôn, không hỏi lại. Sang ngày mới thì hỏi lại đúng 1 lần. Chỉ Creator. Lưu app_settings `gp_auto_approve` = { [username]: "YYYY-MM-DD" }.
// Không cache trong bộ nhớ (nhiều instance Vercel) — chỉ đọc khi có hành động cần duyệt nên ít tốn.
const KEY = "gp_auto_approve"

/** Ngày VN hiện tại dạng YYYY-MM-DD (UTC+7). */
export const vnToday = (now = Date.now()) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10)

async function readAll(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    const v = data?.value ? JSON.parse(data.value) : {}
    return v && typeof v === "object" ? v : {}
  } catch { return {} }
}

async function writeAll(v: Record<string, string>): Promise<void> {
  await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(v) }, { onConflict: "key" })
}

/** Hôm nay (giờ VN) người này đã duyệt-1-lần chưa → các hành động cần duyệt chạy luôn. */
export async function hasDailyAutoApprove(username: string): Promise<boolean> {
  if (!username) return false
  return (await readAll())[username] === vnToday()
}

export async function grantDailyAutoApprove(username: string): Promise<void> {
  const all = await readAll()
  // Dọn ngày cũ để bảng không phình.
  const today = vnToday()
  const next: Record<string, string> = {}
  for (const [u, d] of Object.entries(all)) if (d === today) next[u] = d
  next[username] = today
  await writeAll(next)
}

export async function revokeDailyAutoApprove(username: string): Promise<void> {
  const all = await readAll()
  if (!(username in all)) return
  delete all[username]
  await writeAll(all)
}
