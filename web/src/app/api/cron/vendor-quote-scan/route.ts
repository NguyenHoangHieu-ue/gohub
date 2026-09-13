import { NextRequest, NextResponse } from "next/server"
import { runCreatorAI }              from "@/lib/agents/creator-ai"
import { getCreatorLarkOpenId, sendLarkDM } from "@/lib/lark"
import { alertCronFailure }          from "@/lib/cron-alert"

// Quét vendor quote định kỳ (ý tưởng #8, roadmap audit s196+5) — "THỬ NGHIỆM GIỚI HẠN": browsePortal
// KHÔNG trả về dữ liệu có schema giá cố định (mỗi vendor 1 kiểu JSON khác nhau, không parse cứng được
// an toàn) — nên bước rút giá + so sánh giao HẲN cho model tự làm qua tool sẵn có (browsePortal +
// querySupabase), với rào chắn RÕ trong prompt: KHÔNG được đoán/bịa số nếu không nhận diện được cấu
// trúc giá thật. Chỉ nhắm 1 portal ổn định nhất (SunSpeedy/UHUIBAO — đã tự động hoá login tốt, xem
// system prompt "External Portal Access"), mở rộng vendor khác sau khi verify portal này ổn định.
export const dynamic    = "force-dynamic"
export const maxDuration = 120

const SCAN_PROMPT = `Kiểm tra giá vendor định kỳ — CHỈ portal ổn định đã tự động hoá login (SunSpeedy/
UHUIBAO/cardweb):
1. Gọi managePortalCredentials(action:"list"). Nếu KHÔNG có portal nào tên/URL chứa "sunspeedy"/
   "uhuibao"/"cardweb" → trả lời ĐÚNG câu "Chưa có portal ổn định nào để quét, bỏ qua." và DỪNG.
2. Nếu có, gọi browsePortal(portal_name:"<tên đó>", path:"/sim/simmanage/page?page=1&limit=50") lấy dữ
   liệu SIM/gói.
3. CHỈ khi nhận diện RÕ RÀNG cấu trúc giá/gói (tên gói + giá cụ thể, không mơ hồ) trong dữ liệu trả về —
   so sánh với COGS hiện tại qua querySupabase(table:"skus") cho SKU cùng vendor/nước tương ứng.
4. Nếu chênh lệch ≥5% (rẻ hơn hoặc đắt hơn) cho SKU nào — liệt kê cụ thể: SKU/gói, giá cũ, giá mới, % chênh.
5. Nếu KHÔNG nhận diện được cấu trúc giá rõ ràng từ dữ liệu portal (JSON lạ, không có field giá) — trả
   lời ĐÚNG câu "Dữ liệu portal lần này không đọc được cấu trúc giá rõ ràng, không so sánh được." TUYỆT
   ĐỐI KHÔNG bịa số hoặc đoán chênh lệch dù chỉ 1 con số.
Trả lời ngắn gọn, phù hợp gửi Lark (text + bullet, không bảng phức tạp).`

const SKIP_MARKERS = ["chưa có portal ổn định", "không đọc được cấu trúc giá"]

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { text } = await runCreatorAI([], SCAN_PROMPT, undefined, undefined, true, "cron")
    const skipped = SKIP_MARKERS.some(m => text.toLowerCase().includes(m))
    if (skipped) return NextResponse.json({ ok: true, skipped: true, at: new Date().toISOString() })

    const openId = await getCreatorLarkOpenId()
    if (!openId) return NextResponse.json({ ok: false, error: "Không tìm được Lark open_id của creator" }, { status: 500 })
    await sendLarkDM(openId, `📦 Quét giá vendor định kỳ\n\n${text}`)
    return NextResponse.json({ ok: true, at: new Date().toISOString() })
  } catch (err) {
    await alertCronFailure("vendor-quote-scan", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
