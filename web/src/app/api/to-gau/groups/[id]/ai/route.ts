import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { supabaseAdmin }              from "@/lib/supabase"
import { GoogleGenerativeAI }         from "@google/generative-ai"
import { checkRateLimit }             from "@/lib/rate-limit"
import { detectAndLogLearning }       from "@/lib/agents/learning"
import { genWithRetryStream }         from "@/lib/agents/gemini-stream"
import { guardCheck }                 from "@/lib/agents/guardian"
import { estimateCostUsd }            from "@/lib/agents/gemini-pricing"
import { AI_EMAIL, AI_NAME, buildChatHistory, isSummaryRequest, searchKB } from "@/lib/to-gau-ai-helpers"
import { GEMINI_MODEL } from "@/lib/ai-models"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email lưu USERNAME, không phải email thật.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username   = session.user.username || ""
  const name       = session.user.name     || username
  const role       = session.user.role     || ""
  const privileged = isPrivileged(role)
  const { id }     = params

  if (!privileged && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit: 10 câu/phút/user (mỗi câu tốn 1 lần gọi Gemini — chặn spam trước khi chạm API cost)
  const rl = await checkRateLimit(`to-gau-ai:${username}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Bạn hỏi AI quá nhanh. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s rồi thử lại.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }

  const body = await req.json()
  const question = (body.question ?? "").trim()
  const attachments: { url: string; name: string; size: number; type: string }[] =
    Array.isArray(body.attachments) ? body.attachments : []
  if (!question && attachments.length === 0) {
    return NextResponse.json({ error: "question or attachments required" }, { status: 400 })
  }

  // Fetch group config
  const { data: group, error: groupErr } = await supabaseAdmin
    .from("chat_groups")
    .select("name, ai_enabled, ai_scope, ai_system_prompt_append")
    .eq("id", id)
    .single()

  if (groupErr || !group) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 })
  if (!group.ai_enabled)  return NextResponse.json({ error: "AI đã tắt trong nhóm này" }, { status: 403 })

  // s196+16, đề xuất C — stream token thật (SSE) thay 1 cục JSON chờ trọn vẹn. Mọi bước từ đây trở đi
  // (guard/history/KB/lưu câu hỏi/gọi Gemini/lưu câu trả lời) chạy TRONG ReadableStream — lỗi validate
  // phía trên (401/403/429/400/404/ai tắt) vẫn trả JSON thường vì xảy ra TRƯỚC khi bắt đầu stream.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: any) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch {} }
      try {
        // Guardian nhẹ (s196+15, đề xuất #1) — trước hoàn toàn dựa vào prompt tự nhắc "không tiết lộ
        // COGS/margin/chiến lược", không có lớp code chặn nào như Bé Gấu. Tái dùng guardCheck() có sẵn,
        // chỉ kiểm system_internal — mọi category dữ liệu khác vẫn "ai cũng như nhau" đúng chủ trương
        // chung (không ignoreRole vì web session đã xác thực role thật, khác Lark group).
        const guard = await guardCheck(question, role, undefined, { onlyCategories: ["system_internal"] })

        // Tóm tắt thảo luận theo yêu cầu (s196+15, ý tưởng #3) — nới giới hạn lịch sử khi phát hiện ý định.
        const summaryRequested = isSummaryRequest(question)
        const historyLimit = summaryRequested ? 60 : 20

        // Fetch last N messages (for history) + search KB — chạy song song. CHỈ cần khi guard cho qua.
        // PHẢI chạy TRƯỚC khi insert câu hỏi bên dưới, nếu không câu hỏi vừa lưu sẽ lẫn vào chính history.
        let history: { sender_email: string; sender_name: string | null; content: string; msg_type: string }[] = []
        let kbContext = ""
        if (guard.allowed) {
          const [{ data: recentMsgs }, kb] = await Promise.all([
            supabaseAdmin
              .from("chat_messages")
              .select("sender_email, sender_name, content, msg_type")
              .eq("group_id", id)
              .order("created_at", { ascending: false })
              .limit(historyLimit),
            searchKB(question, privileged, id),
          ])
          history = (recentMsgs ?? []).reverse()
          kbContext = kb
        }

        // Lưu câu hỏi thành 1 tin nhắn THẬT — trước đây câu hỏi chỉ dùng làm prompt gửi Gemini, KHÔNG
        // bao giờ insert vào chat_messages. Lưu TRƯỚC khi gọi Gemini để câu hỏi luôn hiện ngay cả khi lỗi.
        const questionMsgType = attachments.length > 0 && !question
          ? (attachments[0].type.startsWith("image/") ? "image" : "file")
          : "text"
        const { data: questionMsg, error: qErr } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            group_id: id, sender_email: username, sender_name: name, content: question,
            msg_type: questionMsgType, attachments: attachments.length > 0 ? attachments : [],
            is_ai_question: true, // s196+3: đánh dấu để FE phân biệt với chat thường (badge "Hỏi AI")
          })
          .select()
          .single()
        if (qErr || !questionMsg) {
          emit({ type: "error", message: qErr?.message ?? "Không lưu được câu hỏi" })
          controller.close()
          return
        }
        emit({ type: "question", data: questionMsg })

        let aiText: string
        let tokensIn = 0, tokensOut = 0

        if (!guard.allowed) {
          // Chặn TRƯỚC khi tốn tiền gọi Gemini/tải attachment — đúng tinh thần rate-limit đã có ở trên.
          aiText = guard.reason
        } else {
          // Ảnh/PDF đính kèm → tải lại từ Storage rồi build inlineData cho Gemini "nhìn" được.
          const imageParts: { inlineData: { mimeType: string; data: string } }[] = []
          for (const att of attachments) {
            if (!att.type.startsWith("image/") && att.type !== "application/pdf") continue
            try {
              const fileRes = await fetch(att.url)
              if (!fileRes.ok) continue
              const buf = Buffer.from(await fileRes.arrayBuffer())
              imageParts.push({ inlineData: { mimeType: att.type, data: buf.toString("base64") } })
            } catch (e) {
              console.error("[to-gau/ai] Không tải được attachment:", att.url, e)
            }
          }

          const basePrompt = `Bạn là Gấu Tổ — trợ lý AI nội bộ GoHub trong nhóm chat. Trả lời ngắn gọn, chính xác, thân thiện bằng tiếng Việt.

Khi trả lời:
- Ưu tiên dùng thông tin từ TÀI LIỆU THAM KHẢO NỘI BỘ nếu có
- Nếu dùng thông tin từ tài liệu tham khảo, LUÔN ghi rõ nguồn ở cuối câu trả lời theo dạng
  "(Nguồn: [Wiki] Tên trang)" hoặc "(Nguồn: [Tài liệu nhóm] Tên file)" hoặc "(Nguồn: [Ghi chú nhóm] người viết)"
  để người hỏi bấm vào tab Docs/Notes/Wiki kiểm chứng lại nguyên văn, không bịa nguồn nếu không có
- Không tiết lộ thông tin nhạy cảm (COGS, margin, chiến lược kinh doanh) trừ khi ai_scope cho phép
- Nếu không biết → nói thẳng "Em chưa có thông tin về việc này, anh/chị hỏi trực tiếp bộ phận phụ trách nhé"`

          const scopePrompt = group.ai_scope
            ? `\nGIỚI HẠN PHẠM VI: ${group.ai_scope}. Câu hỏi ngoài phạm vi → lịch sự từ chối và hướng dẫn hỏi trực tiếp.`
            : ""
          const appendPrompt = group.ai_system_prompt_append ? `\n${group.ai_system_prompt_append}` : ""
          const summaryDirective = summaryRequested
            ? "\n\nĐây là yêu cầu TÓM TẮT cuộc trò chuyện — dựa vào LỊCH SỬ CHAT ở trên (không phải tài liệu tham khảo), viết tóm tắt ngắn gọn: các chủ đề chính đã bàn, ai nói gì quan trọng, quyết định/việc cần làm nếu có. Không cần trích nguồn Wiki/Docs trừ khi thực sự liên quan."
            : ""
          const systemInstruction = basePrompt + scopePrompt + appendPrompt + summaryDirective + kbContext

          // Build Gemini chat history — prepend TÊN người nói (group nhiều người, Gemini chỉ có role
          // user/model nên không tự phân biệt được ai nói gì nếu để trần nội dung). buildChatHistory()
          // (lib/to-gau-ai-helpers.ts, s196+18) lo merge turn liên tiếp cùng role + cắt turn "model" đầu.
          const rawHistory: { role: "user" | "model"; text: string }[] = []
          for (const msg of history) {
            if (!msg.content) continue
            const isAI = msg.sender_email === AI_EMAIL
            rawHistory.push({
              role: isAI ? "model" : "user",
              text: isAI ? msg.content : `${msg.sender_name || "?"}: ${msg.content}`,
            })
          }
          const chatHistory = buildChatHistory(rawHistory)

          // thinkingLevel "low" (s196+14) — gemini-3.8-flash mặc định thinking=medium nếu không set.
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
          const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction,
            generationConfig: { thinkingConfig: { thinkingLevel: "low" } } as any,
          })

          const effectiveQuestion = question || (imageParts.length > 0 ? "Phân tích ảnh/file đính kèm" : "(không có nội dung)")
          const userParts = imageParts.length > 0
            ? [{ text: `${name}: ${effectiveQuestion}` }, ...imageParts]
            : [{ text: `${name}: ${effectiveQuestion}` }]

          try {
            // s196+14, đề xuất B — genWithRetryStream (retry 3× backoff cho lỗi tạm thời). s196+16 —
            // nay TRUYỀN onChunk để stream từng đoạn ra FE ngay khi Gemini sinh ra (trước chờ trọn vẹn
            // response mới trả, y hệt Bé Gấu/Gấu Pro trước s195+18).
            const contents = [...chatHistory, { role: "user" as const, parts: userParts }]
            const genResult = await genWithRetryStream(model, { contents }, delta => emit({ type: "delta", content: delta }))
            const u = genResult.response.usageMetadata
            if (u) { tokensIn = u.promptTokenCount || 0; tokensOut = u.candidatesTokenCount || 0 }
            aiText = genResult.response.text().trim()
          } catch (e: any) {
            console.error("[to-gau/ai] Gemini error:", e.message)
            aiText = "Hiếu đang fix, vui lòng đợi 😔"
          }
        }

        // Save AI response to chat_messages
        const { data: saved, error: saveErr } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            group_id: id, sender_email: AI_EMAIL, sender_name: AI_NAME,
            content: aiText, msg_type: "ai", attachments: [], reply_to: questionMsg.id,
          })
          .select()
          .single()

        // Self-learning (s196+4) — await, không fire-and-forget (đúng bài học Vercel đóng execution
        // context giữa chừng).
        if (username && role !== "creator") {
          await detectAndLogLearning({
            userMsg: question, role, userId: username, userName: name,
            sessionId: `togau:${id}`,
            sourceLabel: `Tổ Gấu${group.name ? ` (${group.name})` : ""}`,
          }).catch(() => {})
        }

        // Cost/token tracking theo group (s196+15, đề xuất D).
        try {
          await supabaseAdmin.from("app_usage_events").insert({
            event_type: "chat", user_email: username, user_name: name, user_role: role,
            agent_id: "to-gau", page_path: `/analytics/to-gau/${id}`,
            user_message: question.slice(0, 500), ai_response: aiText.slice(0, 3000),
            tokens_in: tokensIn, tokens_out: tokensOut,
            est_cost_usd: estimateCostUsd(tokensIn, tokensOut),
          })
        } catch (e) { console.error("[to-gau/ai] track usage:", e) }

        emit({ type: "done", data: { answer: saved }, error: saveErr?.message })
      } catch (e: any) {
        emit({ type: "error", message: e?.message || "Hiếu đang fix, vui lòng đợi" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  })
}
