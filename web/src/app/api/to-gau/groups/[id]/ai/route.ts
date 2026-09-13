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

const AI_EMAIL = "ai@to-gau"
const AI_NAME  = "Gấu Tổ"

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

// Tìm tài liệu liên quan đến câu hỏi — gộp Wiki (toàn hệ thống) + Docs/Notes của CHÍNH group này
// (trước đây chỉ tìm Wiki, nên nội dung lưu vào Docs/Notes của nhóm không có tác dụng gì với AI —
// đây là gap s194+6 yêu cầu vá: lưu tài liệu mới → AI dùng được ngay, không cần bước re-index riêng
// vì search chạy trực tiếp trên bảng sống mỗi lần hỏi).
async function searchKB(question: string, privileged: boolean, groupId: string): Promise<string> {
  const keywords = question.slice(0, 200).replace(/[^a-zA-Z0-9À-ỹ ]/g, " ")
  const words = keywords.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 4)

  let wikiQuery = supabaseAdmin
    .from("kb_wiki_pages")
    .select("title, content, page_type, is_hidden")
    .eq("status", "active")
    .limit(4)

  // User thường không thấy system/tab_guide docs
  if (!privileged) {
    wikiQuery = wikiQuery.eq("is_hidden", false).neq("page_type", "tab_guide")
  }
  if (words.length > 0) {
    wikiQuery = wikiQuery.or(words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(","))
  }

  let docsQuery = supabaseAdmin
    .from("chat_docs")
    .select("title, description")
    .eq("group_id", groupId)
    .limit(4)
  if (words.length > 0) {
    docsQuery = docsQuery.or(words.map(w => `title.ilike.%${w}%,description.ilike.%${w}%`).join(","))
  }

  let notesQuery = supabaseAdmin
    .from("chat_notes")
    .select("content, creator_name, created_at")
    .eq("group_id", groupId)
    .limit(4)
  if (words.length > 0) {
    notesQuery = notesQuery.or(words.map(w => `content.ilike.%${w}%`).join(","))
  }

  const [{ data: wikiRows }, { data: docRows }, { data: noteRows }] = await Promise.all([
    words.length > 0 ? wikiQuery : Promise.resolve({ data: [] as { title: string; content: string }[] }),
    words.length > 0 ? docsQuery : Promise.resolve({ data: [] as { title: string; description: string | null }[] }),
    words.length > 0 ? notesQuery : Promise.resolve({ data: [] as { content: string; creator_name: string | null; created_at: string }[] }),
  ])

  const sections: string[] = []
  if (wikiRows?.length) {
    sections.push(...wikiRows.map(p => {
      const body = (p.content || "").replace(/^---[\s\S]*?---\n?/, "").slice(0, 600)
      return `### [Wiki] ${p.title}\n${body}`
    }))
  }
  if (docRows?.length) {
    sections.push(...docRows.map(d => `### [Tài liệu nhóm] ${d.title}\n${d.description || "(không có mô tả)"}`))
  }
  if (noteRows?.length) {
    sections.push(...noteRows.map(n => `### [Ghi chú nhóm — ${n.creator_name || "?"}]\n${n.content.slice(0, 600)}`))
  }

  if (!sections.length) return ""
  return `\n\n---\n**TÀI LIỆU THAM KHẢO NỘI BỘ (trích nguồn khi trả lời để người hỏi kiểm chứng lại):**\n${sections.join("\n\n")}\n---`
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

  // Guardian nhẹ (s196+15, đề xuất #1 roadmap audit Tổ Gấu) — trước hoàn toàn dựa vào prompt tự nhắc
  // "không tiết lộ COGS/margin/chiến lược", không có lớp code chặn nào như Bé Gấu. Tái dùng guardCheck()
  // có sẵn, chỉ kiểm system_internal (hỏi về chính bot/code/hệ thống) — mọi category dữ liệu khác vẫn
  // "ai cũng như nhau" đúng chủ trương chung (không ignoreRole vì đây là web session đã xác thực role
  // thật, khác Lark group không tin được role).
  const guard = await guardCheck(question, role, undefined, { onlyCategories: ["system_internal"] })

  // Tóm tắt thảo luận theo yêu cầu (s196+15, ý tưởng #3) — "tóm tắt hộ 50 tin gần nhất" cần nhìn xa hơn
  // 20 tin mặc định; tái dùng đúng hạ tầng AI hiện có, chỉ nới limit + thêm 1 directive trong prompt.
  const isSummaryRequest = /tóm tắt|tóm lược|summar/i.test(question)
  const historyLimit = isSummaryRequest ? 60 : 20

  // Fetch last N messages (for history) + search KB — chạy song song. CHỈ cần khi guard cho qua (đỡ tốn
  // DB/Gemini khi sẽ bị chặn ngay). PHẢI chạy TRƯỚC khi insert câu hỏi bên dưới, nếu không câu hỏi vừa
  // lưu sẽ lẫn vào chính history (trùng với message gửi riêng cho Gemini ngay sau đó).
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

  // Lưu câu hỏi thành 1 tin nhắn THẬT — trước đây câu hỏi chỉ dùng làm prompt gửi Gemini, KHÔNG bao giờ
  // insert vào chat_messages → không ai (kể cả người hỏi) thấy câu hỏi trong lịch sử chat, chỉ câu trả
  // lời AI hiện ra đột ngột không rõ ngữ cảnh. Lưu TRƯỚC khi gọi Gemini để câu hỏi luôn hiện ngay cả khi
  // Gemini lỗi.
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
  if (qErr || !questionMsg) return NextResponse.json({ error: qErr?.message ?? "Không lưu được câu hỏi" }, { status: 500 })

  let aiText: string
  let tokensIn = 0, tokensOut = 0

  if (!guard.allowed) {
    // Chặn TRƯỚC khi tốn tiền gọi Gemini/tải attachment — đúng tinh thần rate-limit đã có ở trên.
    aiText = guard.reason
  } else {
    // Ảnh/PDF đính kèm → tải lại từ Storage (bucket public, xem api/to-gau/upload) rồi build inlineData
    // cho Gemini "nhìn" được — trước đây "Hỏi AI" hoàn toàn bỏ qua file đính kèm, chỉ đọc chữ gõ.
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

    // Build system prompt
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

    const appendPrompt = group.ai_system_prompt_append
      ? `\n${group.ai_system_prompt_append}`
      : ""

    // s196+15, ý tưởng #3 — yêu cầu tóm tắt: đổi khung nhìn lịch sử chat từ "ngữ cảnh nền" thành
    // "nội dung chính cần tóm tắt", không ép trích nguồn Wiki/Docs (thường không liên quan tóm tắt chat).
    const summaryDirective = isSummaryRequest
      ? "\n\nĐây là yêu cầu TÓM TẮT cuộc trò chuyện — dựa vào LỊCH SỬ CHAT ở trên (không phải tài liệu tham khảo), viết tóm tắt ngắn gọn: các chủ đề chính đã bàn, ai nói gì quan trọng, quyết định/việc cần làm nếu có. Không cần trích nguồn Wiki/Docs trừ khi thực sự liên quan."
      : ""

    const systemInstruction = basePrompt + scopePrompt + appendPrompt + summaryDirective + kbContext

    // Build Gemini chat history — prepend TÊN người nói (group nhiều người, Gemini chỉ có role user/model
    // nên không tự phân biệt được ai nói gì nếu để trần nội dung — dễ lẫn ngữ cảnh khi nhiều người hỏi
    // liên tiếp trong cùng nhóm).
    const rawHistory: { role: "user" | "model"; text: string }[] = []
    for (const msg of history) {
      if (!msg.content) continue
      const isAI = msg.sender_email === AI_EMAIL
      rawHistory.push({
        role: isAI ? "model" : "user",
        text: isAI ? msg.content : `${msg.sender_name || "?"}: ${msg.content}`,
      })
    }

    // Gemini bắt buộc: (1) turn ĐẦU TIÊN của history phải là "user" — lỗi thật đã gặp trên staging
    // ("First content should be with role 'user', got model") khi tin nhắn cũ nhất trong 20 tin gần nhất
    // tình cờ là câu trả lời AI; (2) role phải luân phiên user/model — group chat thật có N người nói liền
    // nhau cùng role "user" không xen AI ở giữa, không tự alternate. Merge các turn liên tiếp CÙNG role
    // thành 1 rồi cắt bỏ turn "model" đứng đầu để luôn thoả cả 2 điều kiện.
    const chatHistory: { role: "user" | "model"; parts: { text: string }[] }[] = []
    for (const turn of rawHistory) {
      const last = chatHistory[chatHistory.length - 1]
      if (last && last.role === turn.role) {
        last.parts[0].text += `\n${turn.text}`
      } else {
        chatHistory.push({ role: turn.role, parts: [{ text: turn.text }] })
      }
    }
    while (chatHistory.length && chatHistory[0].role === "model") chatHistory.shift()

    // Call Gemini
    // thinkingLevel "low" (s196+14, đề xuất A roadmap audit Tổ Gấu s196+5) — gemini-3.8-flash mặc định
    // thinking=medium nếu không set (billable, latency ẩn); Gấu Tổ là nơi DUY NHẤT trong 3 agent từng bỏ
    // sót field này (đã set đúng cho be-gau.ts/creator-ai.ts từ trước).
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model: "gemini-3.8-flash",
      systemInstruction,
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } } as any,
    })

    const effectiveQuestion = question || (imageParts.length > 0 ? "Phân tích ảnh/file đính kèm" : "(không có nội dung)")
    const userParts = imageParts.length > 0
      ? [{ text: `${name}: ${effectiveQuestion}` }, ...imageParts]
      : [{ text: `${name}: ${effectiveQuestion}` }]

    try {
      // s196+14, đề xuất B — genWithRetryStream (retry 3× backoff cho lỗi tạm thời 429/5xx/timeout, dùng
      // chung Bé Gấu/Gấu Pro) thay model.startChat().sendMessage() KHÔNG retry gì trước đây — bất kỳ lỗi
      // tạm thời nào cũng rơi thẳng "Hiếu đang fix". Không truyền onChunk → vẫn trả 1 cục JSON như cũ,
      // KHÔNG đổi sang streaming (ngoài phạm vi đợt này).
      const contents = [...chatHistory, { role: "user" as const, parts: userParts }]
      const genResult = await genWithRetryStream(model, { contents })
      const u = genResult.response.usageMetadata
      if (u) { tokensIn = u.promptTokenCount || 0; tokensOut = u.candidatesTokenCount || 0 }
      aiText = genResult.response.text().trim()
    } catch (e: any) {
      console.error("[to-gau/ai] Gemini error:", e.message)
      // Lưu câu hỏi vẫn đã thành công ở trên — trả lỗi NGAY DƯỚI DẠNG 1 tin nhắn AI thay vì 500 câm, để
      // FE không cần xử lý riêng 1 nhánh lỗi khác hẳn luồng thành công (giữ nguyên rule "Hiếu đang fix").
      aiText = "Hiếu đang fix, vui lòng đợi 😔"
    }
  }

  // Save AI response to chat_messages
  const { data: saved, error: saveErr } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      group_id:     id,
      sender_email: AI_EMAIL,
      sender_name:  AI_NAME,
      content:      aiText,
      msg_type:     "ai",
      attachments:  [],
      reply_to:     questionMsg.id,
    })
    .select()
    .single()

  // Self-learning (s196+4) — dùng chung module với Bé Gấu (lib/agents/learning.ts). await (không fire-
  // and-forget) vì response JSON trả ngay sau đây — đúng bài học "Vercel đóng execution context giữa
  // chừng" đã áp cho notifyLarkMembers (s196+1); có cooldown 5 phút/user + trả về sớm nếu câu hỏi ngắn/
  // là câu hỏi thật (searchKB đằng nào cũng không match) nên đa số request KHÔNG tốn thêm gọi Gemini.
  if (username && role !== "creator") {
    await detectAndLogLearning({
      userMsg: question, role, userId: username, userName: name,
      sessionId: `togau:${id}`,
      sourceLabel: `Tổ Gấu${group.name ? ` (${group.name})` : ""}`,
    }).catch(() => {})
  }

  // Cost/token tracking theo group (s196+15, đề xuất #4/D roadmap audit Tổ Gấu) — trước hoàn toàn không
  // observable dù là hoạt động của MỌI group cùng lúc. page_path mượn đúng field đã dùng cho page_view
  // (route thật của group) để có thể lọc theo group sau này mà không cần thêm cột/migration mới.
  try {
    await supabaseAdmin.from("app_usage_events").insert({
      event_type: "chat", user_email: username, user_name: name, user_role: role,
      agent_id: "to-gau", page_path: `/analytics/to-gau/${id}`,
      user_message: question.slice(0, 500), ai_response: aiText.slice(0, 3000),
      tokens_in: tokensIn, tokens_out: tokensOut,
      est_cost_usd: estimateCostUsd(tokensIn, tokensOut),
    })
  } catch (e) { console.error("[to-gau/ai] track usage:", e) }

  // saveErr: câu hỏi đã lưu thành công ở trên dù lưu câu trả lời lỗi — vẫn trả question để FE hiện được
  if (saveErr) return NextResponse.json({ data: { question: questionMsg, answer: null }, error: saveErr.message }, { status: 500 })
  return NextResponse.json({ data: { question: questionMsg, answer: saved } })
}
