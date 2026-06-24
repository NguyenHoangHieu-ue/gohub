import { supabaseAdmin } from "@/lib/supabase"
import { AGENTS } from "@/lib/agents/agents"
import { runBIAnalyst } from "@/lib/agents/bi-analyst"
import { buildReportCard, sendLarkCardToChat } from "@/lib/lark"

// Lấy dữ liệu target tháng trước từ Supabase (target_planning KHÔNG nằm trong gohub_dw nên BI không query được)
// → inject vào prompt để báo cáo tính được completion / target 3HK.
async function fetchTargetContext(): Promise<string> {
  try {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`
    const { data } = await supabaseAdmin
      .from("analytics_target_planning")
      .select("channel,target_revenue,target_3hk_contribution,target_gpm2")
      .eq("month", ym)
    if (!data?.length) return `\n\n(Không có dữ liệu target cho tháng ${ym} trong hệ thống planning.)`
    const totalRev = data.reduce((s: number, r: any) => s + Number(r.target_revenue || 0), 0)
    const lines = data.map((r: any) =>
      `  - ${r.channel}: target_revenue=${Number(r.target_revenue || 0)} VND, target_3hk_contribution=${r.target_3hk_contribution}%, target_gpm2=${r.target_gpm2}%`)
    return `\n\n━━━ DỮ LIỆU TARGET tháng ${ym} (từ hệ thống planning — DÙNG cho phần target/completion) ━━━\n`
      + `Tổng target_revenue tất cả kênh: ${totalRev} VND\nTheo kênh:\n${lines.join("\n")}\n`
      + `(target_3hk_contribution = % đóng góp 3HK kỳ vọng trên doanh thu. Completion = actual / target * 100.)`
  } catch { return "" }
}

// Chạy 1 scheduled message: BI Analyst TỰ CHẠY SQL trên gohub_dw để ra BÁO CÁO THẬT (không phải hướng dẫn),
// render thành Lark interactive card (header + bảng) rồi gửi (webhook hoặc bot API) → cập nhật last_run_at.
// Dùng chung cho nút Test (admin/scheduled-messages/[id] POST) và cron runner (/api/cron/scheduled-messages).
export async function runScheduledMessage(msg: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const targetCtx = await fetchTargetContext()

  const directive = `

━━━ CHẾ ĐỘ BÁO CÁO TỰ ĐỘNG (BẮT BUỘC TUÂN THỦ) ━━━
Hôm nay: ${today} (giờ VN). "Tháng trước" / [X]/[YYYY] = tháng dương lịch liền TRƯỚC tháng hiện tại.
- PHẢI tự gọi executeSQL để lấy SỐ LIỆU THẬT từ gohub_dw rồi ĐIỀN vào một báo cáo HOÀN CHỈNH.
- TUYỆT ĐỐI KHÔNG trả về hướng dẫn, các bước, mẫu SQL, hay placeholder dạng [x] / [curr_total_rev]. KHÔNG in câu lệnh SQL.
- Mọi số liệu so sánh (theo kênh, MoM, B2B/B2C...) trình bày bằng BẢNG markdown chuẩn (| Cột | ... | với dòng phân cách |---|).
- Định dạng tiền: có phân cách hàng nghìn + " VND"; phần trăm làm tròn 1 chữ số (vd 12.3%).
- Phần target/completion: DÙNG khối "DỮ LIỆU TARGET" cung cấp bên dưới (target_planning KHÔNG có trong gohub_dw).
- Gộp truy vấn để giảm số lần gọi executeSQL (lý tưởng 1-2 câu). KHÔNG dùng khối \`\`\`chart (Lark không render được).
- Viết tiếng Việt, chuyên nghiệp, có nhận xét ngắn ở mỗi mục.`

  const systemInstruction = AGENTS["bi-analyst"].systemPrompt + directive + targetCtx
  const report = await runBIAnalyst(systemInstruction, [], msg.prompt, "admin")

  // Render card đẹp (header + bảng). Nếu có lark_keyword (bảo mật custom bot) → chèn vào đầu card.
  const title = msg.title || msg.name || "Báo cáo tự động"
  const card = buildReportCard(title, report, msg.lark_keyword || undefined)

  if (msg.lark_webhook_url) {
    const res = await fetch(msg.lark_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "interactive", card }),
    })
    if (!res.ok) throw new Error(`Lark webhook returned ${res.status}`)
  } else {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "lark_notify_chat_id").maybeSingle()
    if (!data?.value) throw new Error("Chưa có lark_notify_chat_id (bot chưa nhận message group nào) và không cấu hình lark_webhook_url")
    await sendLarkCardToChat(data.value, card)
  }

  await supabaseAdmin.from("lark_scheduled_messages").update({ last_run_at: new Date().toISOString() }).eq("id", msg.id)
  return report
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
