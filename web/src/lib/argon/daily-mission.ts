import { supabaseAdmin } from "@/lib/supabase"
import { BRIEF_TEXT, BRIEFING_MARK, BRIEFING_SECTION, DAILY_GOAL, DAILY_MISSION_NAME } from "./context-pure"
import { createMission, readFile, setPhase, writeFile, type ArgonMission } from "./missions-db"

/** Sứ mệnh "Tham mưu hằng ngày" của người dùng: tạo lần đầu (brief mẫu), luôn ở pha chạy. Trang chủ Argon và trang Bối cảnh & Kế hoạch dùng chung (cùng brief.md). */
export async function ensureDailyMission(username: string): Promise<ArgonMission> {
  const { data } = await supabaseAdmin.from("argon_missions").select("*").eq("username", username).eq("name", DAILY_MISSION_NAME).eq("archived", false).limit(1).maybeSingle()
  let m = data as ArgonMission | null
  if (!m) {
    m = await createMission(username, DAILY_MISSION_NAME, DAILY_GOAL)
    await writeFile(m.id, "brief.md", BRIEF_TEXT + BRIEFING_SECTION, "user")
  } else {
    const brief = await readFile(m.id, "brief.md")
    if (brief && !(brief.content ?? "").includes(BRIEFING_MARK)) await writeFile(m.id, "brief.md", (brief.content ?? "") + BRIEFING_SECTION, "user")
  }
  for (const to of ["plan", "run"] as const) {
    if (m.phase === "run") break
    const r = await setPhase(m, to)
    if (r.mission) m = r.mission
  }
  if (m.phase === "paused" || m.phase === "done") { const r = await setPhase(m, "run"); if (r.mission) m = r.mission }
  return m
}
