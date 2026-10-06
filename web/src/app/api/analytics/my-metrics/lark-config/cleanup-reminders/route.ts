import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import { getLarkToken, getLarkUserOpenId, sendLarkDM } from "@/lib/lark"
import { larkThreadLink } from "@/lib/okr-lark-rules"

// TẠM (s225, 2026-10-06) — dùng 1 lần rồi xoá: lượt quét lại đầu tiên (bản cũ) đã trả lời nhắc vào 20 thread trong group
// Telecom Products → Hiếu yêu cầu thu hồi các tin đó và gửi Hiếu 1 DM liệt kê thread kèm link. Chỉ creator.
const LARK = "https://open.larksuite.com/open-apis"
const MARK = "chưa có câu trả lời nào của anh được đánh dấu Typing"

export const maxDuration = 120

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username || (await getDbRole(session.user.username)) !== "creator") return NextResponse.json({ error: "Creator only" }, { status: 403 })

  const { data: rows, error } = await supabaseAdmin.from("okr_lark_events")
    .select("chat_id,thread_id,message_id,request_sender,request_snippet").eq("reviewed_by", "auto:reminded").order("request_time")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const token = await getLarkToken()
  const call = async (path: string, method = "GET") => (await fetch(`${LARK}${path}`, { method, headers: { Authorization: `Bearer ${token}` } })).json()
  let recalled = 0
  const failed: { thread: string; message?: string; error: string }[] = []
  for (const r of rows ?? []) {
    const list = await call(`/im/v1/messages?container_id_type=thread&container_id=${encodeURIComponent(r.thread_id || r.message_id)}&page_size=50`)
    if (list.code !== 0) { failed.push({ thread: r.message_id, error: `đọc thread: ${list.msg}` }); continue }
    const mine = (list.data?.items ?? []).filter((m: any) => m.sender?.sender_type === "app" && String(m.body?.content ?? "").includes(MARK))
    if (!mine.length) { failed.push({ thread: r.message_id, error: "không thấy tin nhắc của bot" }); continue }
    for (const m of mine) {
      const del = await call(`/im/v1/messages/${m.message_id}`, "DELETE")
      if (del.code === 0) recalled++
      else failed.push({ thread: r.message_id, message: m.message_id, error: `${del.code} ${del.msg}` })
    }
  }

  const hieuId = await getLarkUserOpenId()
  if (hieuId && rows?.length) {
    const lines = rows.map((r, i) => `${i + 1}. ${r.request_sender ?? ""}: ${String(r.request_snippet ?? "").replace(/\s+/g, " ").slice(0, 70)} — ${larkThreadLink(r.chat_id, r.message_id)}`)
    await sendLarkDM(hieuId, `🔖 ${rows.length} thread đã YES nhưng chưa có câu trả lời nào của anh được đánh dấu Typing:\n${lines.join("\n")}\nAnh thả Typing vào câu trả lời giải quyết rồi tag em "Note đi" trong thread nhé.`)
  }
  return NextResponse.json({ threads: rows?.length ?? 0, recalled, failed, dm: !!hieuId })
}
