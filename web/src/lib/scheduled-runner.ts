import { supabaseAdmin } from "@/lib/supabase"
import { AGENTS } from "@/lib/agents/agents"
import { runBIAnalyst } from "@/lib/agents/bi-analyst"
import { buildReportCard, sendLarkCardToChat } from "@/lib/lark"
import { buildReportData, inferPeriod } from "@/lib/scheduled-report-data"

// Chạy 1 scheduled message: số liệu TÍNH SẴN trong code (scheduled-report-data) → BI Analyst chỉ FORMAT,
// render thành Lark interactive card (header + bảng) rồi gửi (webhook hoặc bot API) → cập nhật last_run_at.
// Dùng chung cho nút Test (admin/scheduled-messages/[id] POST) và cron runner (/api/cron/scheduled-messages).
// slotMs: shifted ICT epoch của slot đã khớp (từ getMatchedSlotMs). Nếu truyền vào,
//   last_run_at được ghi là slot time (không phải execution time) → chặn double-fire.
// noUpdateLastRun: true khi gọi từ Test button — không cập nhật last_run_at để không
//   can thiệp vào lịch tự động.
export async function runScheduledMessage(
  msg: any,
  options?: { slotMs?: number; noUpdateLastRun?: boolean },
): Promise<string> {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

  // Số liệu được TÍNH SẴN trong code (SQL cố định, đúng định nghĩa Dashboard, tách thị trường VN/US/Tổng).
  // Gemini chỉ FORMAT khối này → 1 vòng gọi (nhanh, không timeout, số khớp Dashboard, không tự bịa SQL).
  const period = inferPeriod(msg.cron_expression, msg.name)
  let dataBlock = ""
  try {
    dataBlock = (await buildReportData(period)).block
  } catch (e: any) {
    dataBlock = `\n(LỖI lấy dữ liệu precompute: ${e?.message || e}. Báo "Hiếu đang fix" và KHÔNG bịa số.)`
  }

  const directive = `

━━━ CHẾ ĐỘ BÁO CÁO TỰ ĐỘNG (BẮT BUỘC TUÂN THỦ) ━━━
Hôm nay: ${today} (giờ VN). Loại báo cáo: ${period.toUpperCase()}. "Tháng trước" = tháng dương lịch liền TRƯỚC tháng hiện tại.
1. ⚠️ MỌI SỐ LIỆU ĐÃ ĐƯỢC TÍNH SẴN trong khối "DỮ LIỆU ĐÃ TÍNH SẴN" bên dưới. Nhiệm vụ của bạn CHỈ là TRÌNH BÀY/định dạng đúng các số đó theo bố cục prompt yêu cầu. TUYỆT ĐỐI KHÔNG gọi bất kỳ tool nào (executeSQL/GA4/GSC/product), KHÔNG tự tính lại, KHÔNG bịa, KHÔNG đổi số. Số nào không có trong khối → ghi "Chưa có dữ liệu".
2. VÀO THẲNG báo cáo — KHÔNG lời chào, KHÔNG giới thiệu bản thân (cấm "Chào bạn", "Gấu Bi-Ai...", "Dưới đây là..."). Bắt đầu bằng tiêu đề báo cáo.
3. ⚠️ TÁCH THỊ TRƯỜNG: mọi mục doanh thu PHẢI trình bày theo 3 cột VN | US | Tổng (đúng như khối dữ liệu cung cấp). Dùng BẢNG markdown chuẩn (| Cột | ... | + dòng |---|). Trong ô bảng chỉ ghi giá trị thuần, KHÔNG bọc **đậm**/\`code\`.
4. Giá trị thiếu NHẤT QUÁN: thực sự bằng 0 → "0 VND"; chưa nhập target → ghi ĐÚNG "Chưa nhập target tháng này". KHÔNG dùng lẫn "-", "N/A".
5. Tiền: phân cách hàng nghìn + " VND" (số trong khối đã đúng định dạng — giữ nguyên). Phần trăm 1 chữ số.
6. KHÔNG dùng khối \`\`\`chart (Lark không render được). Tiếng Việt, chuyên nghiệp, nhận xét NGẮN mỗi mục (1-2 câu, chỉ dựa trên số trong khối).
7. ⚠️ PRO-RATA & TARGET: nếu prompt có nhắc tới pro-rata / dự phóng / target / kế hoạch / KPI / tiến độ → BẮT BUỘC trình bày ĐẦY ĐỦ mục 【3】 (MTD/thực tế, dự phóng cả tháng nếu có, target cả tháng, target theo kênh, % đạt target) và Target CM1% ở 【4】 + Target 3HK% ở 【5】 (nếu khối có). TUYỆT ĐỐI KHÔNG bỏ qua/rút gọn các dòng target hay pro-rata. Nếu target = "Chưa nhập target tháng này" thì ghi đúng câu đó, KHÔNG bỏ mục.
8. Kỳ MONTHLY = tháng đã đóng → dùng số THỰC TẾ so target (khối đã bỏ pro-rata, đừng tự dựng lại). Kỳ DAILY/WEEKLY = đang trong tháng → có MTD + dự phóng pro-rata cả tháng.

${dataBlock}`

  const systemInstruction = AGENTS["bi-analyst"].systemPrompt + directive
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

  if (!options?.noUpdateLastRun) {
    // Ghi slot time (không phải execution time) để dedup chính xác cho lần quét tiếp theo.
    const slotMs = options?.slotMs
    const lastRunIso = slotMs != null
      ? new Date(slotMs - 7 * 3600_000).toISOString()  // convert ICT-shifted → UTC
      : new Date().toISOString()
    await supabaseAdmin.from("lark_scheduled_messages").update({ last_run_at: lastRunIso }).eq("id", msg.id)
  }
  return report
}

// Khớp lịch cron (isCronDue) + đến-hạn-kể-từ-last_run (isDueSince) tách ở scheduled-cron.ts (leaf, thuần).
// Re-export để các importer cũ (route cron) vẫn lấy được từ đây.
export { isCronDue, isDueSince, getMatchedSlotMs } from "./scheduled-cron"
