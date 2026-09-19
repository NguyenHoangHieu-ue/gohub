import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin }             from "@/lib/supabase"
import { sendLarkMessage }           from "@/lib/lark"
import { summarizeReleaseCommits, withTabsFooter, type ReleaseCommit } from "@/lib/release-notify"

// Gọi từ GitHub Actions (.github/workflows/notify-release.yml) mỗi khi có commit push lên `staging`
// (test) hoặc `main` (production) — tóm tắt commit message bằng Gemini rồi gửi vào group Lark riêng cho
// thông báo tính năng mới, KHÁC group `lark_notify_chat_id` (đang dùng cho sync/SKU đổi giá).
// Group đích đặt qua lệnh "/set-release-channel" (chỉ admin/creator) — xem api/lark/events/route.ts.
//
// Push `main` (Hiếu yêu cầu, s200+11): kèm luôn danh sách commit ĐANG CÒN trên `staging` mà CHƯA merge —
// workflow tự tính `git log origin/main..origin/staging` (cần git access, không làm được trong route này)
// rồi gửi qua field `pendingCommits`. Route chỉ tóm tắt + ghép nội dung, không tự đi tính diff branch.
// Lọc CỨNG trước khi tốn 1 lượt Gemini nào — commit cập nhật wiki/tài liệu (Hiếu yêu cầu KHÔNG noti) luôn
// theo đúng convention "docs:"/"docs(scope):" của repo (xem mọi commit message trong session_summary.txt).
// Không dựa vào Gemini để lọc loại này — chặn CHẮC CHẮN, không tốn token, không rủi ro model đoán sai.
const DOCS_ONLY_RE = /^docs(\([^)]*\))?\s*:/i
function isDocsCommit(message: string): boolean {
  return DOCS_ONLY_RE.test(message.trim())
}

function parseCommits(raw: unknown): ReleaseCommit[] {
  return Array.isArray(raw)
    ? raw
        .filter((c: any) => typeof c?.message === "string" && c.message.trim())
        .map((c: any) => ({
          sha: String(c.sha ?? "").slice(0, 12),
          message: String(c.message),
          // đường dẫn file commit đã đổi (workflow gửi) → suy ra tab bị ảnh hưởng; giới hạn để payload không phình
          files: Array.isArray(c.files) ? c.files.filter((f: unknown) => typeof f === "string").slice(0, 300) : [],
        }))
        .filter((c: ReleaseCommit) => !isDocsCommit(c.message))
    : []
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== process.env.MCP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const environment: "staging" | "production" = body?.environment === "staging" ? "staging" : "production"
  const commits = parseCommits(body?.commits)
  const pendingCommits = environment === "production" ? parseCommits(body?.pendingCommits) : []

  if (commits.length === 0 && pendingCommits.length === 0) {
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

  const doneSummary    = commits.length        ? withTabsFooter(await summarizeReleaseCommits(commits), commits)               : ""
  const pendingSummary = pendingCommits.length  ? withTabsFooter(await summarizeReleaseCommits(pendingCommits), pendingCommits)  : ""

  let text: string
  if (environment === "staging") {
    if (!doneSummary) return NextResponse.json({ sent: false, reason: "nothing user-facing to announce" })
    text = `🧪 [Staging] Vừa cập nhật (đang test, chưa lên production):\n\n${doneSummary}`
  } else {
    if (!doneSummary && !pendingSummary) {
      return NextResponse.json({ sent: false, reason: "nothing user-facing to announce" })
    }
    const parts = [
      "🚀 [Production] Vừa lên production:",
      doneSummary || "(chỉ có thay đổi kỹ thuật/dọn dẹp, không ảnh hưởng người dùng)",
    ]
    if (pendingSummary) {
      parts.push("", "🧪 Còn trên staging, CHƯA lên production:", pendingSummary)
    }
    text = parts.join("\n")
  }

  try {
    await sendLarkMessage(setting.value as string, "chat_id", text)
  } catch (e: any) {
    return NextResponse.json({ sent: false, error: e?.message ?? "send failed" }, { status: 502 })
  }

  return NextResponse.json({ sent: true, summary: text })
}
