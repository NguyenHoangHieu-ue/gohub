import { sendLarkMessage as _send, getLarkToken } from "@/lib/lark"

export async function runSendLarkMessage(args: {
  chat_id?: string
  lark_id?: string
  content: string
  title?: string
}): Promise<any> {
  try {
    if ((!args.chat_id && !args.lark_id) || !args.content) return { error: "Cần content và chat_id hoặc lark_id." }

    // Nếu có title → gửi dạng card đơn giản (bold title + content)
    const text = args.title
      ? `**${args.title}**\n\n${args.content}`
      : args.content

    if (args.lark_id) {
      if (!/^ou_[A-Za-z0-9]+$/.test(args.lark_id)) return { error: "lark_id phải là open_id dạng ou_..." }
      await _send(args.lark_id, "open_id", text)
      return { ok: true, sent_to: `DM ${args.lark_id}`, chars: text.length }
    }

    // Với "me" → gửi DM cho chính Hiếu (LARK_CREATOR_USER_ID)
    if (args.chat_id === "me") {
      const openId = process.env.LARK_CREATOR_USER_ID
      if (!openId) return { error: "LARK_CREATOR_USER_ID chưa set. Hiếu cần set ENV trên Vercel." }
      await _send(openId, "open_id", text)
      return { ok: true, sent_to: "Hiếu (DM)", chars: text.length }
    }

    // chat_id thông thường → gửi vào group
    await _send(args.chat_id!, "chat_id", text)
    return { ok: true, sent_to: args.chat_id, chars: text.length }
  } catch (e: any) {
    return { error: e.message }
  }
}
