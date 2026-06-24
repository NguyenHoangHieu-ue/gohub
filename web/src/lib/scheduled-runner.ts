import { supabaseAdmin } from "@/lib/supabase"
import { AGENTS } from "@/lib/agents/agents"
import { runBIAnalyst } from "@/lib/agents/bi-analyst"
import { buildReportCard, sendLarkCardToChat } from "@/lib/lark"

// Lấy dữ liệu target 6 THÁNG gần nhất từ Supabase (target_planning KHÔNG nằm trong gohub_dw nên BI không query được)
// → inject vào prompt để báo cáo nào cũng có target tương ứng (tránh điền thiếu/không nhất quán).
async function fetchTargetContext(): Promise<string> {
  try {
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const { data } = await supabaseAdmin
      .from("analytics_target_planning")
      .select("month,channel,target_revenue,target_3hk_contribution,target_gpm2")
      .in("month", months)
    if (!data?.length) return `\n\n(Không có dữ liệu target trong 6 tháng gần nhất → mọi mục target ghi "Chưa có target".)`
    const byMonth: Record<string, any[]> = {}
    for (const r of data as any[]) (byMonth[r.month] = byMonth[r.month] || []).push(r)
    const blocks = Object.keys(byMonth).sort().map(m => {
      const rows = byMonth[m]
      const total = rows.reduce((s: number, r: any) => s + Number(r.target_revenue || 0), 0)
      const per = rows.map((r: any) =>
        `${r.channel}: target_revenue=${Number(r.target_revenue || 0)} VND, target_3hk_contribution=${r.target_3hk_contribution}%, target_gpm2=${r.target_gpm2}%`).join(" · ")
      return `  ${m}: tổng target_revenue=${total} VND | ${per}`
    })
    return `\n\n━━━ DỮ LIỆU TARGET (hệ thống planning — DÙNG cho mọi mục target/completion) ━━━\n${blocks.join("\n")}\n`
      + `(target_3hk_contribution = % đóng góp 3HK kỳ vọng. Completion = actual / target * 100. `
      + `Tháng KHÔNG có trong danh sách trên = chưa thiết lập target → ghi "Chưa có target", KHÔNG bịa số.)`
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
1. PHẢI tự gọi executeSQL lấy SỐ LIỆU THẬT từ gohub_dw rồi ĐIỀN vào báo cáo HOÀN CHỈNH. KHÔNG trả hướng dẫn/các bước/mẫu SQL/placeholder [x]. KHÔNG in câu lệnh SQL.
2. ⚠️ ĐÂY LÀ BÁO CÁO TÀI CHÍNH: chỉ được dùng ĐÚNG con số do executeSQL trả về (và khối DỮ LIỆU TARGET). TUYỆT ĐỐI KHÔNG bịa, KHÔNG ước lượng, KHÔNG suy diễn hay tự thay đổi/làm tròn sai số. Nếu một số liệu KHÔNG có dữ liệu → ghi rõ, KHÔNG tự điền số.
3. VÀO THẲNG báo cáo — KHÔNG lời chào, KHÔNG giới thiệu bản thân (cấm các câu kiểu "Chào bạn", "Gấu Bi-Ai đã hoàn thành...", "Dưới đây là..."). Bắt đầu bằng tiêu đề báo cáo.
4. Giá trị thiếu phải NHẤT QUÁN trong toàn báo cáo: nếu thực sự bằng 0 → "0 VND"; nếu KHÔNG có dữ liệu/target → ghi "Chưa có dữ liệu" (target thì "Chưa có target"). TUYỆT ĐỐI không dùng lẫn lộn "-", "N/A", "0", "0 VND" cho cùng ý "không có".
5. Số liệu so sánh (theo kênh, MoM, B2B/B2C...) trình bày bằng BẢNG markdown chuẩn (| Cột | ... | + dòng |---|). TRONG Ô BẢNG chỉ ghi giá trị thuần, KHÔNG bọc **đậm** hay \`code\`.
6. Định dạng tiền: phân cách hàng nghìn + " VND"; phần trăm làm tròn 1 chữ số (vd 12,3%).
7. Phần target/completion: DÙNG khối "DỮ LIỆU TARGET" bên dưới (target_planning KHÔNG có trong gohub_dw).
8. Gộp truy vấn để giảm số lần gọi executeSQL (lý tưởng 1-2 câu). KHÔNG dùng khối \`\`\`chart (Lark không render được).
9. Tiếng Việt, chuyên nghiệp, nhận xét NGẮN ở mỗi mục (1-2 câu, chỉ dựa trên số thật).

━━━ ĐỊNH NGHĨA CHUẨN (BẮT BUỘC dùng đúng để số liệu nhất quán giữa các lần chạy) ━━━
- Doanh thu = SUM(fulfilled_revenue_amount_vnd) của fact_fulfillment_revenue; lọc thời gian theo fulfiled_date::date.
- Lợi nhuận gộp = SUM(gross_profit_vnd). GPM/GPM2 (%) = SUM(gross_profit_vnd) / SUM(fulfilled_revenue_amount_vnd) * 100.
- Kênh: JOIN dim_order_source s ON f.order_source_code = s.code; B2B = UPPER(s.group_name)='B2B'; B2C = UPPER(s.group_name)='B2C'.
- Vendor 3HK: JOIN dim_sku d ON f.sku = d.sku; điều kiện REPLACE(UPPER(d.vendor),' ','') = '3HKDATAPOOL'
  (vendor trong DB có 2 cách ghi '3HKDATAPOOL' và '3HK DATAPOOL' — PHẢI bắt cả hai, nếu không sẽ thiếu phần lớn doanh thu 3HK).`

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
