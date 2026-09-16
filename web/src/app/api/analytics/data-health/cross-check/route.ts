import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { supabaseAdmin } from "@/lib/supabase"
import { computeMonthlyKpis } from "@/app/api/cron/refresh-monthly-kpis/route"

export const maxDuration = 60

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role !== "creator") throw new Error("Creator only")
  return session
}

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// So khớp số LIVE (tính lại ngay, dùng đúng công thức `computeMonthlyKpis` của cron
// refresh-monthly-kpis) với SNAPSHOT đang lưu trong Supabase `analytics_monthly_kpis` — bảng mà Bé Gấu/
// chatbot đọc để trả lời câu hỏi CM1/doanh thu theo tháng. Lệch nghĩa là cron chưa chạy/lỗi hoặc snapshot
// cũ — đúng lớp bug đã xảy ra nhiều lần (products/CS Troubleshoot cron chết âm thầm, s198+10/+11).
const FIELDS: { key: "revenue" | "cm1" | "cm1_pct" | "hk3_pct"; label: string; pct: boolean }[] = [
  { key: "revenue", label: "Doanh thu",     pct: false },
  { key: "cm1",     label: "CM1",           pct: false },
  { key: "cm1_pct", label: "CM1%",          pct: true  },
  { key: "hk3_pct", label: "3HK%",          pct: true  },
]

function diffStatus(diffPct: number): "ok" | "warn" | "bad" {
  const abs = Math.abs(diffPct)
  if (abs <= 1) return "ok"
  if (abs <= 5) return "warn"
  return "bad"
}

export async function GET() {
  try {
    await requireCreator()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const today = new Date()
  const months = [0, -1].map(off => getMonthStr(new Date(today.getFullYear(), today.getMonth() + off, 1)))

  const results: any[] = []
  for (const month of months) {
    let live: Awaited<ReturnType<typeof computeMonthlyKpis>> | null = null
    try {
      live = await computeMonthlyKpis(month, "ALL")
    } catch (e: any) {
      results.push({ month, error: `Không tính được số live: ${e?.message?.slice(0, 150) ?? "lỗi"}` })
      continue
    }

    const { data: snap } = await supabaseAdmin
      .from("analytics_monthly_kpis").select("*").eq("month", month).eq("company_code", "ALL").maybeSingle()

    if (!snap) {
      results.push({ month, error: "Chưa có snapshot analytics_monthly_kpis cho tháng này — cron refresh-monthly-kpis có thể chưa chạy lần nào." })
      continue
    }

    for (const f of FIELDS) {
      const liveVal = Number((live as any)[f.key] ?? 0)
      const snapVal = Number((snap as any)[f.key] ?? 0)
      const diffPct = f.pct
        ? liveVal - snapVal                       // đã là %, lệch tính thẳng bằng điểm %
        : (snapVal !== 0 ? ((liveVal - snapVal) / Math.abs(snapVal)) * 100 : (liveVal !== 0 ? 100 : 0))
      results.push({
        month, field: f.label, live: liveVal, snapshot: snapVal, diffPct: Math.round(diffPct * 100) / 100,
        snapshotRefreshedAt: (snap as any).refreshed_at ?? null,
        status: diffStatus(diffPct),
      })
    }
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), results })
}
