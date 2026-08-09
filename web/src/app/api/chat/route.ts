import { NextRequest, NextResponse }           from "next/server"
import { getServerSession }                    from "next-auth"
import { authOptions }                         from "@/lib/auth"
import { guardCheck, canViewCogs }             from "@/lib/agents/guardian"
import { getChannelFromRole }                  from "@/lib/agents/tools"
import { runBeGau }                            from "@/lib/agents/be-gau"
import type { Message, UserRole }              from "@/lib/agents/types"
import { supabaseAdmin }                       from "@/lib/supabase"

export const maxDuration = 60

// Bé Gấu (s131): mô phỏng cơ chế Gấu Pro — 1 agent function-calling lặp, tự chọn công cụ —
// NHƯNG giữ guardian pre-flight (chặn code/hệ thống/nội bộ) + lọc dữ liệu theo role + KHÔNG lộ
// cách hoạt động/SQL cho user. Thay pipeline route→context→per-agent cũ.

// Ghi 1 event chat cho Usage Analytics (cả câu hỏi + câu trả lời Bé Gấu).
async function logChat(
  identity: string | null | undefined,
  name: string | null,
  role: string,
  msg: string,
  aiResponse?: string | null,
) {
  try {
    await supabaseAdmin.from("app_usage_events").insert({
      event_type: "chat", user_email: identity || null, user_name: name || null, user_role: role,
      agent_id: "be-gau", user_message: msg.slice(0, 500),
      ai_response: aiResponse ? aiResponse.slice(0, 3000) : null,
    })
  } catch { /* tracking không được làm vỡ chat */ }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role       = (session.user.role || "staff") as UserRole
  const department = session.user.department || "all"
  const name    = userName || session.user.name || "bạn"
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  const encoder = new TextEncoder()

  try {
    const [guard, isCost] = await Promise.all([
      guardCheck(lastMsg, role, department),
      canViewCogs(role),
    ])

    // ── Guardian: câu hỏi code/hệ thống/nội bộ hoặc vượt quyền → từ chối, KHÔNG gọi agent ──
    if (!guard.allowed) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`__AGENT__:guardian:Hạn chế quyền\n`))
          controller.enqueue(encoder.encode(guard.reason))
          controller.close()
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    const identity = session.user.email || (session.user as any).username || null

    // Giá bán theo kênh của vai trò (b2c/saleb2c → B2C; b2b → B2B; còn lại xem tất cả).
    const channel = getChannelFromRole(role)
    const priceDirective = channel
      ? `\n\n(Nội bộ) Người dùng thuộc kênh ${channel}. Khi hỏi GIÁ BÁN sản phẩm, chỉ hiển thị giá thuộc kênh ${channel} (không lộ giá kênh khác).`
      : ""

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`__AGENT__:be-gau:Bé Gấu\n`))
          const { text, sources } = await runBeGau({
            geminiHistory, lastMsg, role, name,
            userId: identity || session.user.email || undefined,
            sessionId: (session as any)?.sessionId || undefined,
            isCost, extraDirective: priceDirective,
          })
          // Log cả câu hỏi + câu trả lời sau khi có đủ (fire-and-forget)
          logChat(identity, name, role, lastMsg, text).catch(() => {})
          controller.enqueue(encoder.encode(text))
          // Trích nguồn web (nếu có) — nối cuối, không lộ cơ chế.
          if (sources.length) {
            const uniq = Array.from(new Map(sources.map(s => [s.url, s])).values()).slice(0, 5)
            controller.enqueue(encoder.encode("\n\n**Nguồn tham khảo:**\n" + uniq.map(s => `- [${s.title}](${s.url})`).join("\n")))
          }
          controller.close()
        } catch (err: any) {
          const msg = (role === "admin" || role === "creator") ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
          logChat(identity, name, role, lastMsg, null).catch(() => {})
          controller.enqueue(encoder.encode(msg))
          controller.close()
        }
      },
    })
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
