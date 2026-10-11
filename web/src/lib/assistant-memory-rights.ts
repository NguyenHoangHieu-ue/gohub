// Quyền của người dùng với trí nhớ của mình (P2, plan personal-agent.md): tắt/bật, xuất, xoá hẳn. Mọi hàm chỉ chạm dữ liệu của CHÍNH username đó.
import { supabaseAdmin } from "@/lib/supabase"
import { saveAgentProfile, getAgentProfile } from "@/lib/agent-profile"

const offKey = (username: string) => `assistant_memory_off:${username}`

/** Người dùng đã tắt trí nhớ → không nạp, không rút, không tóm tắt. Lỗi đọc → coi như chưa tắt.
 *  KHÔNG cache: Vercel có nhiều instance, cache trong bộ nhớ làm nút "Tắt trí nhớ" chỉ có hiệu lực sau tới 60s ở instance khác (QA s230 gặp thật). */
export async function isMemoryOff(username: string | undefined | null): Promise<boolean> {
  if (!username) return false
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", offKey(username)).maybeSingle()
  return String(data?.value ?? "") === "1"
}

export async function setMemoryOff(username: string, off: boolean): Promise<void> {
  if (off) await supabaseAdmin.from("app_settings").upsert({ key: offKey(username), value: "1" })
  else await supabaseAdmin.from("app_settings").delete().eq("key", offKey(username))
}

/** Toàn bộ dữ liệu trí nhớ của người dùng (mục đang nhớ + đã quên, lịch sử giá trị cũ, tóm tắt hội thoại — không kèm vector). */
export async function exportMemory(username: string) {
  const [{ data: memories }, { data: summaries }, profile] = await Promise.all([
    supabaseAdmin.from("assistant_memory").select("id,kind,content,pinned,archived,source,history,created_at,updated_at").eq("username", username).order("id"),
    supabaseAdmin.from("gp_conversation_memory").select("conversation_id,title,summary,message_count,updated_at").eq("username", username).order("updated_at", { ascending: false }),
    getAgentProfile(username),
  ])
  return { username, exported_at: new Date().toISOString(), off: await isMemoryOff(username), agent_profile: profile, memories: memories ?? [], conversation_summaries: summaries ?? [] }
}

/** Xoá HẲN (không phải lưu trữ) mọi mục trí nhớ + tóm tắt hội thoại của người dùng. Không đụng nội dung hội thoại. */
export async function eraseMemory(username: string): Promise<{ memories: number; summaries: number }> {
  const [m, s] = await Promise.all([
    supabaseAdmin.from("assistant_memory").delete().eq("username", username).select("id"),
    supabaseAdmin.from("gp_conversation_memory").delete().eq("username", username).select("conversation_id"),
  ])
  await saveAgentProfile(username, {}).catch(() => null)   // hồ sơ trợ lý cũng là dữ liệu cá nhân → xoá cùng
  return { memories: m.data?.length ?? 0, summaries: s.data?.length ?? 0 }
}

/** Xoá hẳn 1 mục (người dùng bấm xoá trong panel) — khác `forget` của model chỉ lưu trữ. */
export async function deleteMemoryItem(username: string, id: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from("assistant_memory").delete().eq("id", id).eq("username", username).select("id")
  return !!data?.length
}
