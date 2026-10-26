// Eval Argon (ARGON-X): chạy Argon trên dữ liệu mẫu HƯ CẤU của người dùng giả "eval-argon" (lib/argon/eval-fixtures.ts). Chỉ gọi bằng CRON_SECRET (scripts/eval-argon.mjs).
//   POST { action: "seed" }  → xoá rồi nạp lại dữ liệu mẫu (nguồn mail/thread/ghi chú, sổ sự việc, sổ mail), lập chỉ mục tìm kiếm; trả { dates } để thế {EFF}… trong câu hỏi
//   POST { action: "run", prompt, model?: "fast"|"deep", route?: "auto"|"full", skill?: { name, instructions } } → chạy MỘT lượt (không lịch sử, không lấy số liệu hệ thống), trả câu trả lời + route + công cụ + thời gian + tác dụng phụ
//   POST { action: "reset" } → xoá sạch dữ liệu của người dùng giả
// Lõi ở lib/argon/eval-run.ts. Không đụng dữ liệu người dùng thật: mọi truy vấn/ghi đều theo username EVAL_USER.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { evalReset, evalRun, evalSeed, type EvalRunIn } from "@/lib/argon/eval-run"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as EvalRunIn & { action?: string }
  try {
    if (b.action === "seed") return NextResponse.json(await evalSeed())
    if (b.action === "reset") { await evalReset(); return NextResponse.json({ ok: true }) }
    if (b.action === "run") return NextResponse.json(await evalRun(b, req.nextUrl.origin))
    return NextResponse.json({ error: "action phải là seed | run | reset" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
