import { supabaseAdmin } from "@/lib/supabase"
import { GoogleGenerativeAI } from "@google/generative-ai"

// Chạy 1 scheduled message: sinh nội dung bằng Gemini → gửi Lark (webhook hoặc /api/notify/lark) → cập nhật last_run_at.
// Dùng chung cho nút Test (admin/scheduled-messages/[id] POST) và cron runner (/api/cron/scheduled-messages).
export async function runScheduledMessage(msg: any): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "")
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })
  const result = await model.generateContent(msg.prompt)
  const text = result.response.text()
  const finalText = msg.lark_keyword ? `${msg.lark_keyword} ${text}` : text

  if (msg.lark_webhook_url) {
    const res = await fetch(msg.lark_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: finalText } }),
    })
    if (!res.ok) throw new Error(`Lark webhook returned ${res.status}`)
  } else {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/notify/lark`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.MCP_SECRET}` },
      body: JSON.stringify({ text: finalText }),
    })
    if (!res.ok) throw new Error("Lark notify failed")
  }

  await supabaseAdmin.from("lark_scheduled_messages").update({ last_run_at: new Date().toISOString() }).eq("id", msg.id)
  return finalText
}

// Khớp 1 biểu thức cron 5 trường với thời điểm `d`. Hỗ trợ *, danh sách (a,b), khoảng (a-b), step (*/n hoặc a-b/n).
// `d` nên là thời gian theo MÚI GIỜ MUỐN KHỚP (đọc qua getUTC* — caller tự shift sang ICT nếu cần).
export function isCronDue(expr: string, d: Date): boolean {
  const parts = (expr || "").trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hr, dom, mon, dow] = parts

  const matchField = (field: string, val: number, lo0: number, hi0: number): boolean =>
    field.split(",").some(part => {
      if (part === "*") return true
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/")
        const step = parseInt(stepStr, 10) || 1
        const [lo, hi] = range === "*" ? [lo0, hi0] : range.split("-").map(Number)
        if (val < lo || val > (hi ?? lo)) return false
        return (val - lo) % step === 0
      }
      if (part.includes("-")) { const [lo, hi] = part.split("-").map(Number); return val >= lo && val <= hi }
      return parseInt(part, 10) === val
    })

  return (
    matchField(min, d.getUTCMinutes(), 0, 59) &&
    matchField(hr,  d.getUTCHours(),   0, 23) &&
    matchField(dom, d.getUTCDate(),    1, 31) &&
    matchField(mon, d.getUTCMonth() + 1, 1, 12) &&
    matchField(dow, d.getUTCDay(),     0, 6)
  )
}
