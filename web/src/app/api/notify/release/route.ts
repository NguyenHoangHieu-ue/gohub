import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin }             from "@/lib/supabase"
import { sendLarkMessage }           from "@/lib/lark"
import { summarizeReleaseCommits, type ReleaseCommit } from "@/lib/release-notify"

// Gọi từ GitHub Actions (.github/workflows/notify-release.yml) mỗi khi có commit push lên `main`
// (production thật) — tóm tắt commit message bằng Gemini rồi gửi vào group Lark riêng cho thông báo
// tính năng mới, KHÁC group `lark_notify_chat_id` (đang dùng cho sync/SKU đổi giá).
// Group đích đặt qua lệnh "/set-release-channel" (chỉ admin/creator) — xem api/lark/events/route.ts.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== process.env.MCP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const commits: ReleaseCommit[] = Array.isArray(body?.commits)
    ? body.commits
        .filter((c: any) => typeof c?.message === "string" && c.message.trim())
        .map((c: any) => ({ sha: String(c.sha ?? "").slice(0, 12), message: String(c.message) }))
    : []

  if (commits.length === 0) {
    return NextResponse.json({ sent: false, reason: "no commits" })
  }

  const { data: setting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "lark_release_chat_id")
    .maybeSingle()

  if (!setting?.value) {
    return NextResponse.json(
      { error: "lark_release_chat_id chưa cấu hình — mention bot trong group đích, gõ /set-release-channel" },
      { status: 400 },
    )
  }

  const summary = await summarizeReleaseCommits(commits)
  if (!summary) {
    return NextResponse.json({ sent: false, reason: "nothing user-facing to announce" })
  }

  const text = `🚀 GoHub Intel vừa cập nhật:\n\n${summary}`

  try {
    await sendLarkMessage(setting.value as string, "chat_id", text)
  } catch (e: any) {
    return NextResponse.json({ sent: false, error: e?.message ?? "send failed" }, { status: 502 })
  }

  return NextResponse.json({ sent: true, summary })
}
