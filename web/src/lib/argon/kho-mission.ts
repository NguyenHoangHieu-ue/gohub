import { createMission, setPhase, writeFile } from "./missions-db"
import { supabaseAdmin } from "@/lib/supabase"
import { KHO_MISSION_NAME } from "./kho"
import type { ArgonMission } from "./missions-db"

const KHO_GOAL = "Giúp anh Hiếu đọc, tìm, so sánh, đánh giá và sắp xếp mọi tài liệu trong Kho (file, báo giá vendor, thread, mail, ghi chú)."
const KHO_BRIEF = `# ${KHO_MISSION_NAME}

## Vai trò
Thủ thư của Kho: tìm đúng tài liệu, tổng hợp, so sánh, đánh giá, định dạng lại và sắp xếp thư mục. Mọi câu trả lời dựa trên nội dung thật trong Kho và nêu tên nguồn.

## Quy tắc
- Không bịa. Không có trong Kho thì nói "Kho chưa có".
- Xếp thư mục thì làm luôn rồi báo lại, không xoá nguồn.
- Thông tin vendor/sản phẩm có hạn (khuyến mãi, ngừng bán, sản phẩm mới) phải nêu rõ ngày hiệu lực và hạn.
`

/** Sứ mệnh "Thủ thư Kho" của người dùng: tạo lần đầu, luôn ở pha chạy (không bắt người dùng đi qua làm rõ/kế hoạch/Chốt). */
export async function ensureKhoMission(username: string): Promise<ArgonMission> {
  const { data } = await supabaseAdmin.from("argon_missions").select("*").eq("username", username).eq("name", KHO_MISSION_NAME).maybeSingle()
  let m = data as ArgonMission | null
  if (!m) {
    m = await createMission(username, KHO_MISSION_NAME, KHO_GOAL)
    await writeFile(m.id, "brief.md", KHO_BRIEF, "user")
  }
  if (m.archived) { await supabaseAdmin.from("argon_missions").update({ archived: false }).eq("id", m.id); m = { ...m, archived: false } }
  for (const to of ["plan", "run"] as const) {
    if (m.phase === "run") break
    const r = await setPhase(m, to)
    if (r.mission) m = r.mission
  }
  if (m.phase === "paused" || m.phase === "done") { const r = await setPhase(m, "run"); if (r.mission) m = r.mission }
  return m
}
