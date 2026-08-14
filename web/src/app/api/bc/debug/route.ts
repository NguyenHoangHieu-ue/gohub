// Debug endpoint — kiểm tra MD5 signature computation mà KHÔNG gọi BC API
// Admin/creator only. Xóa sau khi debug xong.
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createHash } from "crypto"

function md5(s: string) { return createHash("md5").update(s, "utf8").digest("hex") }

function tradeTime(): string {
  const d = new Date()
  const utc8 = new Date(d.getTime() + 8 * 3600 * 1000)
  return utc8.toISOString().replace("T", " ").slice(0, 19)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ""
  if (!session || !["admin", "creator"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const appKey    = process.env.BC_DATAPOOL_CHANNEL_ID ?? "(NOT SET)"
  const appSecret = process.env.BC_DATAPOOL_APP_SECRET ?? "(NOT SET)"
  const url       = process.env.BC_DATAPOOL_BASE_API_URL ?? "(NOT SET)"

  // Thử F014 (không có tradeData)
  const tradeData = {}
  const tt = tradeTime()
  const body = JSON.stringify({ tradeType: "F014", tradeTime: tt, tradeData })
  const signInput = appSecret + body
  const sign = md5(signInput)

  // Cũng thử các variant khác phòng trường hợp spec khác
  const bodyOnly = md5(body + appSecret)            // reversed
  const dataOnly = md5(appSecret + JSON.stringify(tradeData))  // chỉ tradeData

  return NextResponse.json({
    env: { appKey, appSecretLength: appSecret.length, appSecretFirst4: appSecret.slice(0,4), url },
    body,
    signInput,
    computed: {
      standard:   sign,          // md5(appSecret + fullBody)  ← đang dùng
      reversed:   bodyOnly,      // md5(fullBody + appSecret)
      dataOnly:   dataOnly,      // md5(appSecret + tradeData)
    },
    hint: "Gọi thử BC bằng curl để xác nhận sign nào đúng",
    curl: `curl -X POST "${url}" -H "Content-Type: application/json;charset=UTF-8" -H "x-channel-id: ${appKey}" -H "x-sign-method: md5" -H "x-sign-value: ${sign}" -d '${body}'`,
  })
}
